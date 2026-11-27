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

test('Compiled Functions integrate routing, Access, conflicts, media and feature availability', async () => {
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
    const legacyOptions = { modules: true, modulesRoot: output, scriptPath: join(output, file), compatibilityDate: '2026-06-22', d1Databases: { DB: 'integration' }, r2Buckets: ['WIKI_BUCKET'], bindings, cf: false,
      serviceBindings: { ASSETS: async request => {
        const url = new URL(request.url)
        if (url.pathname === '/src/config/site.json') return Response.json({
          site: { name: url.hostname === 'other.example.com' ? 'Outra "wiki"' : 'Fixture </script> & Wiki', language: 'en', interfaceLanguage: url.hostname === 'other.example.com' ? 'pt-BR' : 'en', homeSlug: 'main-page' },
          branding: { logo: '/src/media/branding/logo.png', favicon: '/src/media/branding/icon.png' },
          navigation: { main: [{ href: '/', label: 'Fixture home' }] },
          access: { mode: 'public' }, seo: { disallow: ['/wiki/unlisted'] }
        })
        return new Response(html, { headers: { 'content-type': 'text/html' } })
      } },
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
    assert.equal(shell.status, 404)
    assert.match(await shell.text(), /Page not found/)
    for (const [language, expected] of [[null, 'página não encontrada'], ['pt-BR', 'página não encontrada'], ['en', 'Page not found']]) {
      const missing = await mf.dispatchFetch('https://wiki.example.com/api/pages/alpha', { headers: language ? { 'x-wiki-language': language } : {} })
      assert.equal(missing.status, 404)
      assert.deepEqual(await missing.json(), { ok: false, error: expected })
    }
    for (const [language, expected] of [['pt-BR', /edição recusada: o título é obrigatório/], ['en', /Edit rejected: A title is required/]]) {
      const invalid = await mf.dispatchFetch('https://wiki.example.com/api/proposals/alpha', {
        method: 'POST',
        headers: { 'x-wiki-request': '1', 'x-wiki-language': language, 'content-type': 'application/json' },
        body: JSON.stringify({ title: '', content: '', summary: '' })
      })
      assert.equal(invalid.status, 400)
      assert.match((await invalid.json()).error, expected)
    }
    assert.equal((await request('/api/secure/pages/alpha/revisions', editor, { title: 'Alpha' })).status, 428)
    for (const [slug, minRole, text] of [['public-card', 'guest', 'Public template content'], ['restricted-card', 'admin', 'Restricted template content']]) {
      const template = await request('/api/secure/admin/templates', owner, { slug, title: slug, minRole, call: `{{${slug}}}`, renderMarkdown: `**${text}**` })
      assert.equal(template.status, 200, await template.clone().text())
    }
    const input = { title: 'Alpha', content: 'Editorial **prose**.\n\n__TOC__\n\n## A section\n\n[[Alpha#a-section|Jump]]\n\n:::infobox\nTitle: Example infobox\n::: \n\n![Caption](/src/media/branding/figure.png)\n\n<article>Literal HTML</article>\n\n{{public-card}}\n\n{{restricted-card}}', categories: ['Examples'], aliases: ['Alpha alias'], redirectRules: [{ fromSlug: 'alpha-redirect', fragment: 'a-section' }], summary: 'created', expectedRevisionId: null }
    const first = await (await request('/api/secure/pages/alpha/revisions', editor, input)).json()
    assert.equal(first.ok, true, JSON.stringify(first))
    const read = path => mf.dispatchFetch('https://wiki.example.com' + path, { redirect: 'manual' })
    const response = await read('/wiki/alpha')
    const document = await response.text()
    assert.equal(response.status, 200, document)
    assert.match(response.headers.get('cache-control'), /no-store/)
    assert.match(document, /<title>Alpha - Fixture &lt;\/script&gt; &amp; Wiki<\/title>/)
    assert.match(document, /<article class="wiki-article">[\s\S]*Editorial <strong>prose<\/strong>/)
    assert.match(document, /<html lang="en" class="is-ready"/)
    assert.match(document, /<link rel="canonical" href="https:\/\/wiki\.example\.com\/wiki\/alpha">/)
    assert.match(document, /name="description" content="Editorial prose\.[^"]*"/)
    assert.match(document, /property="og:image" content="https:\/\/wiki\.example\.com\/src\/media\/branding\/figure\.png"/)
    assert.match(document, /href="\/wiki\/alpha#a-section"/)
    assert.match(document, /id="a-section"/)
    assert.match(document, /class="article-toc"/)
    assert.match(document, /Example infobox/)
    assert.match(document, /&lt;article&gt;Literal HTML&lt;\/article&gt;/)
    assert.match(document, /Fixture home/)
    assert.match(document, /action="\/search" method="get"/)
    assert.match(document, /src="\/src\/scripts\/app\.js"/)
    assert.match(document, /src="\/src\/media\/branding\/logo\.png"/)
    assert.match(document, /href="\/src\/media\/branding\/icon\.png"/)
    assert.match(document, /<strong>Public template content<\/strong>/)
    assert.doesNotMatch(document, /Restricted template content/)
    const allowed = await request('/wiki/alpha', owner, undefined, 'GET')
    assert.match(allowed.headers.get('cache-control'), /no-store/)
    assert.match(await allowed.text(), /Restricted template content/)
    assert.doesNotMatch(document, /id="bootScreen"|editor@example\.com/)
    const state = document.match(/<script id="wiki-initial" type="application\/json">([^<]*)<\/script>/)[1]
    assert.equal(JSON.parse(state).config.site.name, 'Fixture </script> & Wiki')
    assert.doesNotMatch(state, /Editorial prose|superAdminEmail|currentRevisionId|databaseId/)
    const other = await Promise.all([read('/wiki/alpha'), mf.dispatchFetch('https://other.example.com/wiki/alpha')])
    assert.match(await other[0].text(), /Fixture/)
    const portuguese = await other[1].text()
    assert.match(portuguese, /Outra/)
    assert.match(portuguese, /Link para esta seção/)
    assert.match(document, /Link to this section/)
    assert.match(portuguese, /Editorial <strong>prose<\/strong>/)
    const redirect = await read('/wiki/alpha-redirect')
    assert.equal(redirect.status, 302)
    assert.equal(redirect.headers.get('location'), '/wiki/alpha#a-section')
    assert.equal((await read('/wiki/alpha-alias')).headers.get('location'), '/wiki/alpha')
    assert.match(await (await read('/search?q=Editorial')).text(), /Alpha/)
    assert.match(await (await read('/wiki/categoria/examples')).text(), /Alpha/)
    assert.match(await (await read('/wiki/especial/todas-as-paginas')).text(), /Alpha/)
    assert.match(await (await read('/wiki/especial/paginas-recentes')).text(), /Alpha/)
    assert.equal((await read('/wiki/especial/pagina-aleatoria')).headers.get('location'), '/wiki/alpha')
    assert.match(await (await read('/sitemap.xml')).text(), /<loc>https:\/\/wiki\.example\.com\/wiki\/alpha<\/loc>/)
    assert.match(await (await read('/robots.txt')).text(), /Disallow: \/wiki\/unlisted/)
    const history = await read('/history/alpha?revision=1')
    assert.match(history.headers.get('x-robots-tag'), /noindex/)
    assert.match(await history.text(), /Editorial <strong>prose<\/strong>/)
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
    const fileDocument = await (await read(`/wiki/arquivo/${uploaded.slug}`)).text()
    assert.match(fileDocument, /pixel\.png/)
    assert.doesNotMatch(fileDocument, /editor@example\.com|uploads\//)
    assert.equal((await request(`/api/secure/admin/storage/files/${uploaded.slug}`, owner, undefined, 'DELETE')).status, 200)
    assert.equal((await mf.dispatchFetch(`https://wiki.example.com/api/uploads/${uploaded.r2Key}`)).status, 404)
    await DB.prepare("INSERT INTO global_settings VALUES ('pageHistory','false','now','owner@example.com')").run()
    assert.equal((await mf.dispatchFetch('https://wiki.example.com/api/revisions/alpha')).status, 403)
    assert.equal((await read('/history/alpha?revision=1')).status, 403)
    await DB.prepare("UPDATE editor_profiles SET status = 'disabled' WHERE email = 'editor@example.com'").run()
    assert.equal((await request('/api/secure/pages/alpha/revisions', editor, input)).status, 403)
    assert.equal((await DB.prepare('SELECT COUNT(*) n FROM revisions').first()).n, 3)
    for (const slug of ['discussao/alpha', 'usuario/alpha', 'deleted-example']) {
      const added = await request('/api/secure/pages/' + encodeURIComponent(slug) + '/revisions', owner, { ...input, title: 'Namespace example', content: 'Namespace body', categories: [], aliases: [], redirectRules: [] })
      assert.equal(added.status, 200, await added.clone().text())
    }
    for (const path of ['/talk/alpha', '/usuario/alpha']) assert.match(await (await read(path)).text(), /Namespace body/)
    assert.equal((await read('/discussao/alpha')).headers.get('location'), '/talk/alpha')
    await DB.prepare("INSERT INTO global_settings VALUES ('talkPages','false','now','owner@example.com')").run()
    await DB.prepare("UPDATE pages SET status='deleted' WHERE slug='deleted-example'").run()
    assert.equal((await read('/talk/alpha')).status, 403)
    assert.equal((await read('/wiki/deleted-example')).status, 404)
    assert.doesNotMatch(await (await read('/sitemap.xml')).text(), /deleted-example|discussao|usuario/)
    const blocked = await request('/api/secure/admin/ip-rules', owner, { ip: '192.0.2.0/24', action: 'ban_site' })
    assert.equal(blocked.status, 200, await blocked.clone().text())
    const blockedPage = await mf.dispatchFetch('https://wiki.example.com/wiki/alpha', { headers: { 'cf-connecting-ip': '192.0.2.1' }, redirect: 'manual' })
    assert.equal(blockedPage.headers.get('location'), '/access-blocked/')
    await mf.setOptions({ ...base, workers: options.workers.map(worker => ({ ...worker, config: { ...worker.config, env: { ...worker.config.env, WIKI_ACCESS_MODE: { type: 'text', value: 'private' } } } })) })
    DB = await mf.getD1Database('DB')
    const privateResponse = await mf.dispatchFetch('https://wiki.example.com/api/pages/alpha')
    assert.equal(privateResponse.status, 401, await privateResponse.clone().text())
    assert.equal((await request('/api/pages/alpha', editor, undefined, 'GET')).status, 403)
    assert.equal((await request('/api/pages/alpha', owner, undefined, 'GET')).status, 200)
    assert.equal((await read('/wiki/alpha')).status, 401)
    const privatePage = await request('/wiki/alpha', owner, undefined, 'GET')
    assert.equal(privatePage.status, 200)
    assert.match(privatePage.headers.get('cache-control'), /no-store/)
    assert.match(privatePage.headers.get('x-robots-tag'), /noindex/)
    assert.doesNotMatch(await privatePage.text(), /owner@example\.com/)
    assert.equal((await read('/sitemap.xml')).status, 404)
    assert.match(await (await read('/robots.txt')).text(), /Disallow: \/\n/)
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
    assert.equal((await request('/wiki/alpha', owner, undefined, 'GET')).status, 503)
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
      const homeDocument = await previousFetch(local.origin)
      assert.equal(homeDocument.status, 200)
      assert.match(await homeDocument.text(), /Welcome/)
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
