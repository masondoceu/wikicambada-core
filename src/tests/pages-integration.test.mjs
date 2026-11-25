import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { migrationStatements } from './helpers.mjs'
import * as client from '../scripts/services/wiki-api.js'
import { localProxy } from '../scripts/dev.mjs'

test('Functions compiladas integram rotas, Access, conflitos, mídia e disponibilidade', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wiki-pages-integration-'))
  let mf
  let target
  const previousFetch = globalThis.fetch
  try {
    const output = join(directory, 'worker')
    const build = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'pages', 'functions', 'build', 'functions', '--outdir', output], { encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' }, timeout: 60000 })
    assert.equal(build.status, 0, build.stderr)
    const file = (await readdir(output)).find(name => name.endsWith('.js'))
    assert.ok(file)
    const html = await readFile('index.html', 'utf8')
    const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
    const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'integration' }
    async function token(email) {
      const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
      const signed = `${encode({ alg: 'RS256', kid: 'integration' })}.${encode({ email, aud: ['test'], iss: 'https://test.cloudflareaccess.com', exp: Math.floor(Date.now() / 1000) + 600 })}`
      return `${signed}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(signed))).toString('base64url')}`
    }
    const bindings = { ACCESS_TEAM_DOMAIN: 'https://test.cloudflareaccess.com', ACCESS_AUD: 'test', ACCESS_STRICT: 'true', WIKI_SUPER_ADMIN_EMAIL: 'owner@example.com', WIKI_ACCESS_MODE: 'public' }
    const legacyOptions = { modules: true, scriptPath: join(output, file), compatibilityDate: '2026-06-22', d1Databases: { DB: 'integration' }, r2Buckets: ['WIKI_BUCKET'], bindings, cf: false,
      serviceBindings: { ASSETS: async () => new Response(html, { headers: { 'content-type': 'text/html' } }) },
      outboundService: async request => { assert.equal(request.url, 'https://test.cloudflareaccess.com/cdn-cgi/access/certs'); return Response.json({ keys: [jwk] }) }
    }
    const options = convertV4MiniflareOptions(legacyOptions)
    const base = { ...options, resourcePersistencePath: join(directory, 'state'), telemetry: { enabled: false } }
    mf = new Miniflare(base)
    let DB = await mf.getD1Database('DB')
    for (const migration of migrationStatements()) await DB.batch(migration.map(sql => DB.prepare(sql)))
    const editor = await token('editor@example.com')
    const owner = await token('owner@example.com')
    const request = async (path, jwt, body, method = 'POST') => {
      const headers = { 'x-wiki-request': '1', ...(jwt ? { 'cf-access-jwt-assertion': jwt } : {}), 'content-type': 'application/json' }
      let payload = body === undefined ? undefined : JSON.stringify(body)
      if (body instanceof FormData) {
        const encoded = new Request('https://wiki.example.com', { method, body })
        headers['content-type'] = encoded.headers.get('content-type')
        payload = new Uint8Array(await encoded.arrayBuffer())
      }
      return mf.dispatchFetch(`https://wiki.example.com${path}`, { method, headers, ...(payload === undefined ? {} : { body: payload }) })
    }
    const shell = await mf.dispatchFetch('https://wiki.example.com/wiki/alpha')
    assert.equal(shell.status, 200)
    assert.match(await shell.text(), /src\/scripts\/app.js/)
    assert.equal((await request('/api/secure/pages/alpha/revisions', editor, { title: 'Alpha' })).status, 428)
    const input = { title: 'Alpha', content: 'first', summary: 'created', expectedRevisionId: null }
    const first = await (await request('/api/secure/pages/alpha/revisions', editor, input)).json()
    assert.equal(first.ok, true)
    const results = await Promise.all([request('/api/secure/pages/alpha/revisions', editor, { ...input, content: 'second', expectedRevisionId: first.page.currentRevisionId }), request('/api/pages/alpha', editor, { ...input, content: 'third', expectedRevisionId: first.page.currentRevisionId })])
    assert.deepEqual(results.map(response => response.status).sort(), [200, 409])
    globalThis.fetch = (path, options = {}) => mf.dispatchFetch(new URL(path, 'https://wiki.example.com').href, { ...options, headers: { ...options.headers, 'cf-access-jwt-assertion': editor } })
    const current = await client.getPage('alpha', { noCache: true })
    const saved = await client.savePage('alpha', { ...input, content: 'saved by frontend client', expectedRevisionId: current.currentRevisionId })
    assert.notEqual(saved.currentRevisionId, current.currentRevisionId)
    await assert.rejects(client.savePage('alpha', { ...input, expectedRevisionId: current.currentRevisionId }), { status: 409 })
    const listingResponse = await mf.dispatchFetch('https://wiki.example.com/api/pages?paged=1')
    assert.equal(listingResponse.status, 200)
    assert.match(await listingResponse.text(), /"total":1/)
    assert.equal((await client.getPageList()).total, 1)
    assert.equal((await client.getSearchPage('Alpha')).total, 1)
    assert.deepEqual(await client.getSearchPage(''), { results: [], total: 0, nextOffset: null })
    assert.equal((await client.listRevisions('alpha')).total, 3)
    assert.equal((await client.submitEditProposal('alpha', { title: 'Alpha', content: 'suggested', summary: 'suggestion' })).stored, true)
    const revisions = await (await mf.dispatchFetch('https://wiki.example.com/api/revisions/alpha')).json()
    assert.equal(revisions.total, 3)
    const form = new FormData()
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+c9c8AAAAASUVORK5CYII=', 'base64')
    form.set('file', new File([png], 'pixel.png', { type: 'image/png' }))
    const uploadResponse = await request('/api/secure/files', editor, form)
    assert.equal(uploadResponse.status, 200, await uploadResponse.clone().text())
    const uploaded = (await uploadResponse.json()).file
    const content = await mf.dispatchFetch(`https://wiki.example.com${uploaded.contentUrl}`)
    assert.equal(content.status, 200)
    assert.deepEqual(Buffer.from(await content.arrayBuffer()), png)
    assert.equal(content.headers.get('cache-control'), 'no-store')
    const publicFile = await (await mf.dispatchFetch(`https://wiki.example.com/api/files/${uploaded.slug}`)).json()
    assert.equal(publicFile.uploadedByEmail, undefined)
    assert.equal((await request(`/api/secure/admin/storage/files/${uploaded.slug}`, owner, undefined, 'DELETE')).status, 200)
    assert.equal((await mf.dispatchFetch(`https://wiki.example.com/api/uploads/${uploaded.r2Key}`)).status, 404)
    await DB.prepare("INSERT INTO global_settings VALUES ('pageHistory','false','now','owner@example.com')").run()
    assert.equal((await mf.dispatchFetch('https://wiki.example.com/api/revisions/alpha')).status, 403)
    await DB.prepare("UPDATE editor_profiles SET status = 'disabled' WHERE email = 'editor@example.com'").run()
    assert.equal((await request('/api/secure/pages/alpha/revisions', editor, input)).status, 403)
    assert.equal((await DB.prepare('SELECT COUNT(*) n FROM revisions').first()).n, 3)
    await mf.setOptions({ ...base, workers: options.workers.map(worker => ({ ...worker, config: { ...worker.config, env: { ...worker.config.env, WIKI_ACCESS_MODE: { type: 'text', value: 'private' } } } })) })
    DB = await mf.getD1Database('DB')
    const privateResponse = await mf.dispatchFetch('https://wiki.example.com/api/pages/alpha')
    assert.equal(privateResponse.status, 401, await privateResponse.clone().text())
    assert.equal((await request('/api/pages/alpha', editor, undefined, 'GET')).status, 403)
    assert.equal((await request('/api/pages/alpha', owner, undefined, 'GET')).status, 200)
    globalThis.fetch = previousFetch
    async function recovery(worker, token, action, fields = {}, params = {}) {
      const get = ['table', 'objects', 'object'].includes(action) && params.read
      const query = new URLSearchParams({ ...(get ? { action } : {}), ...params })
      query.delete('read')
      const response = await worker.dispatchFetch(`https://wiki.example.com/api/secure/admin/recovery?${query}`, { method: get ? 'GET' : 'POST', headers: { 'cf-access-jwt-assertion': owner, 'x-wiki-request': '1', 'content-type': 'application/json', ...(token ? { 'x-wiki-recovery': token } : {}) }, ...(get ? {} : { body: JSON.stringify({ action, ...fields }) }) })
      assert.equal(response.status, 200, await response.clone().text())
      return response.json()
    }
    const backup = await recovery(mf, null, 'begin-backup')
    assert.equal((await request('/api/secure/pages/alpha/revisions', owner, input)).status, 503)
    const tables = {}
    for (const table of Object.keys(backup.tables)) {
      tables[table] = []
      let cursor
      do {
        const data = await recovery(mf, backup.token, 'table', {}, { read: '1', table, ...(cursor === undefined ? {} : { cursor }) })
        tables[table].push(...data.rows)
        cursor = data.next
      } while (cursor !== null)
    }
    const inventory = await recovery(mf, backup.token, 'objects', {}, { read: '1' })
    assert.equal(inventory.objects.length, 1)
    const object = inventory.objects[0]
    const sourceObject = await mf.dispatchFetch(`https://wiki.example.com/api/secure/admin/recovery?action=object&key=${encodeURIComponent(object.key)}`, { headers: { 'cf-access-jwt-assertion': owner, 'x-wiki-recovery': backup.token } })
    assert.equal(sourceObject.status, 200)
    const mediaBytes = new Uint8Array(await sourceObject.arrayBuffer())
    assert.deepEqual(Buffer.from(mediaBytes), png)
    await recovery(mf, backup.token, 'start-validation')
    await recovery(mf, backup.token, 'validate')
    await recovery(mf, backup.token, 'finish')
    target = new Miniflare({ ...convertV4MiniflareOptions({ ...legacyOptions, d1Databases: { DB: 'restore-target' }, r2Buckets: { WIKI_BUCKET: 'restore-target' } }), resourcePersistencePath: join(directory, 'target'), telemetry: { enabled: false } })
    const targetDB = await target.getD1Database('DB')
    for (const migration of migrationStatements()) await targetDB.batch(migration.map(sql => targetDB.prepare(sql)))
    const restored = await recovery(target, null, 'begin-restore', { databaseSchema: 17, tables: backup.tables, counts: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])), objectCount: 1 })
    const hash = Buffer.from(await crypto.subtle.digest('SHA-256', mediaBytes)).toString('hex')
    const put = await target.dispatchFetch(`https://wiki.example.com/api/secure/admin/recovery?key=${encodeURIComponent(object.key)}`, { method: 'PUT', headers: { 'cf-access-jwt-assertion': owner, 'x-wiki-recovery': restored.token, 'x-wiki-request': '1', 'content-length': String(mediaBytes.length), 'x-wiki-sha256': hash, 'x-wiki-object-metadata': Buffer.from(JSON.stringify({ httpMetadata: object.httpMetadata, customMetadata: object.customMetadata })).toString('base64') }, body: mediaBytes })
    assert.equal(put.status, 200, await put.clone().text())
    for (const [table, rows] of Object.entries(tables)) for (let offset = 0; offset < rows.length; offset += 20) await recovery(target, restored.token, 'table', { table, rows: rows.slice(offset, offset + 20), chunkId: `${table}:${offset}` })
    await recovery(target, restored.token, 'start-validation')
    await recovery(target, restored.token, 'validate', { offset: 0 })
    await recovery(target, restored.token, 'finish')
    for (const table of Object.keys(tables)) assert.deepEqual((await targetDB.prepare(`SELECT * FROM ${table}`).all()).results, (await DB.prepare(`SELECT * FROM ${table}`).all()).results, table)
    assert.deepEqual(Buffer.from(await (await (await target.getR2Bucket('WIKI_BUCKET')).get(object.key)).arrayBuffer()), png)
    await target.dispose()
    const secret = 'b'.repeat(64)
    target = new Miniflare({ ...convertV4MiniflareOptions({ ...legacyOptions, host: '127.0.0.1', port: 0, d1Databases: { DB: 'new-wiki' }, r2Buckets: { WIKI_BUCKET: 'new-wiki' }, bindings: { ACCESS_STRICT: 'true', DEV_BYPASS_AUTH: 'true', WIKI_LOCAL_AUTH_SECRET: secret, WIKI_INITIAL_CONTENT: JSON.stringify({ id: 'new-wiki', language: 'en', homeSlug: 'main-page', guideSlug: 'editing-guide' }) } }), resourcePersistencePath: join(directory, 'new-wiki'), telemetry: { enabled: false } })
    const newDB = await target.getD1Database('DB')
    for (const migration of migrationStatements()) await newDB.batch(migration.map(sql => newDB.prepare(sql)))
    const local = await localProxy((await target.ready).origin, secret, { port: 0 })
    try {
      const localUser = await (await previousFetch(local.origin + '/api/auth/me')).json()
      assert.equal(localUser.role, 'super_admin'); assert.equal(localUser.canEdit, true)
      const home = await (await previousFetch(local.origin + '/api/pages/main-page')).json()
      assert.equal(home.title, 'Main page'); assert.match(home.content, /Welcome/)
      const edited = await previousFetch(local.origin + '/api/secure/pages/main-page/revisions', { method: 'POST', headers: { origin: local.origin, 'content-type': 'application/json', 'x-wiki-request': '1' }, body: JSON.stringify({ title: 'My home', content: 'edited', summary: 'edit', expectedRevisionId: home.currentRevisionId }) })
      assert.equal(edited.status, 200, await edited.clone().text())
      assert.equal((await previousFetch(local.origin + '/api/secure/admin/system')).status, 200)
      assert.equal((await newDB.prepare('SELECT COUNT(*) n FROM pages').first()).n, 2)
      assert.equal((await newDB.prepare('SELECT COUNT(*) n FROM revisions').first()).n, 3)
      assert.equal((await target.dispatchFetch('https://public.example.com/api/auth/me')).status, 200)
      assert.equal((await (await target.dispatchFetch('https://public.example.com/api/auth/me')).json()).authenticated, false)
    } finally { await local.close() }
  } finally { globalThis.fetch = previousFetch; client.clearPublicCache(); if (target) await target.dispose(); if (mf) await mf.dispose(); await rm(directory, { recursive: true, force: true }) }
})
