import test from 'node:test'
import assert from 'node:assert/strict'
import { database, loadFunction } from './helpers.mjs'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const service = await loadFunction('functions/api/_lib/recovery.ts')
const core = await loadFunction('functions/api/_lib/d1.ts')
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'recovery' }
const signed = `${encode({ alg: 'RS256', kid: 'recovery' })}.${encode({ email: 'owner@example.com', aud: ['wiki'], iss: 'https://recovery.cloudflareaccess.com', exp: Math.floor(Date.now() / 1000) + 600 })}`
const jwt = `${signed}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(signed))).toString('base64url')}`
const originalFetch = globalThis.fetch
globalThis.fetch = async () => Response.json({ keys: [jwk] })
const access = { WIKI_SUPER_ADMIN_EMAIL: 'owner@example.com', ACCESS_TEAM_DOMAIN: 'https://recovery.cloudflareaccess.com', ACCESS_AUD: 'wiki' }

function bucket() {
  const objects = new Map()
  return {
    objects,
    async list({ limit = 100, cursor = '0' } = {}) {
      const keys = [...objects.keys()].sort()
      const offset = Number(cursor)
      return { objects: keys.slice(offset, offset + limit).map(key => ({ key, ...objects.get(key) })), truncated: offset + limit < keys.length, cursor: String(offset + limit) }
    },
    async head(key) { return objects.has(key) ? { key, ...objects.get(key) } : null },
    async get(key) { const object = objects.get(key); return object ? { ...object, body: object.bytes } : null },
    async put(key, body, options = {}) {
      const bytes = new Uint8Array(await new Response(body).arrayBuffer())
      const hash = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex')
      if (options.sha256 && options.sha256 !== hash) throw new Error('checksum mismatch')
      objects.set(key, { bytes, size: bytes.length, etag: hash, httpMetadata: options.httpMetadata || {}, customMetadata: options.customMetadata || {} })
      return { key, ...objects.get(key) }
    },
    async delete(key) { objects.delete(key) }
  }
}

function request(method, token, body, params = {}, headers = {}) {
  return new Request(`https://wiki.example.com/api/secure/admin/recovery?${new URLSearchParams(params)}`, { method, headers: { 'cf-access-jwt-assertion': jwt, ...(token ? { 'x-wiki-recovery': token } : {}), ...headers }, ...(body !== undefined ? { body: typeof body === 'object' && !(body instanceof Uint8Array) ? JSON.stringify(body) : body } : {}) })
}
const post = async (env, token, action, fields = {}) => (await service.recoveryPost(request('POST', token, { action, ...fields }), env)).json()

test('backup paginado bloqueia gravações e restaura todo o estado com mídia e metadados', async () => {
  const source = { ...access, DB: await database(), WIKI_BUCKET: bucket() }
  const target = { ...access, DB: await database(), WIKI_BUCKET: bucket() }
  try {
    const first = await core.writePage(source, 'alpha', { title: 'Alpha', content: 'first', categories: [], summary: 'first', expectedRevisionId: null }, 'editor@example.com')
    await core.writePage(source, 'alpha', { title: 'Alpha', content: 'second', categories: ['Categoria'], summary: 'second', aliases: ['Alias'], redirectRules: [{ fromSlug: 'initial', fragment: 'section' }], expectedRevisionId: first.currentRevisionId }, 'editor@example.com')
    source.DB.sqlite.prepare("INSERT INTO editor_profiles(id,email,role,status,created_at,updated_at) VALUES ('disabled','disabled@example.com','admin','disabled','now','now')").run()
    const bytes = new TextEncoder().encode('media content')
    const sha256 = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex')
    await source.WIKI_BUCKET.put('uploads/file.png', bytes, { httpMetadata: { contentType: 'image/png' }, customMetadata: { title: 'mídia' } })
    await core.recordUpload(source, { r2Key: 'uploads/file.png', filename: 'file.png', mimeType: 'image/png', sizeBytes: bytes.length, sha256 })
    const operation = await post(source, null, 'begin-backup')
    await assert.rejects(core.writePage(source, 'new', { title: 'New', content: 'new', summary: 'blocked', expectedRevisionId: null }, 'editor@example.com'), { status: 503 })
    const exported = {}
    for (const table of service.RECOVERY_TABLES) {
      exported[table] = []
      let cursor
      do {
        const page = await (await service.recoveryGet(request('GET', operation.token, undefined, { action: 'table', table, ...(cursor !== undefined ? { cursor } : {}) }), source)).json()
        exported[table].push(...page.rows)
        cursor = page.next
      } while (cursor !== null)
    }
    const inventory = await (await service.recoveryGet(request('GET', operation.token, undefined, { action: 'objects' }), source)).json()
    const media = new Uint8Array(await (await service.recoveryGet(request('GET', operation.token, undefined, { action: 'object', key: inventory.objects[0].key }), source)).arrayBuffer())
    await post(source, operation.token, 'start-validation')
    await post(source, operation.token, 'validate')
    await post(source, operation.token, 'finish')
    const restored = await post(target, null, 'begin-restore', { databaseSchema: 17, tables: operation.tables, counts: Object.fromEntries(Object.entries(exported).map(([table, rows]) => [table, rows.length])), objectCount: 1 })
    const metadata = Buffer.from(JSON.stringify({ httpMetadata: inventory.objects[0].httpMetadata, customMetadata: inventory.objects[0].customMetadata })).toString('base64')
    await service.recoveryPut(request('PUT', restored.token, media, { key: inventory.objects[0].key }, { 'content-length': String(media.length), 'x-wiki-sha256': sha256, 'x-wiki-object-metadata': metadata }), target)
    for (const [table, rows] of Object.entries(exported)) for (let offset = 0; offset < rows.length; offset += 20) {
      const fields = { table, rows: rows.slice(offset, offset + 20), chunkId: `${table}:${offset}` }
      await post(target, restored.token, 'table', fields)
      assert.equal((await post(target, restored.token, 'table', fields)).repeated, true)
    }
    await post(target, restored.token, 'start-validation')
    await post(target, restored.token, 'validate', { offset: 0 })
    await post(target, restored.token, 'finish')
    for (const table of service.RECOVERY_TABLES) assert.deepEqual(target.DB.sqlite.prepare(`SELECT * FROM ${table}`).all(), source.DB.sqlite.prepare(`SELECT * FROM ${table}`).all(), table)
    assert.deepEqual([...target.WIKI_BUCKET.objects.keys()], ['uploads/file.png'])
    assert.equal((await target.WIKI_BUCKET.head('uploads/file.png')).customMetadata.title, 'mídia')
    assert.equal((await core.readPageRevision(target, 'alpha', 1)).content, 'first')
    assert.equal((await core.readPageRevision(target, 'alpha', 2)).content, 'second')
  } finally { source.DB.sqlite.close(); target.DB.sqlite.close() }
})

test('restauração incompleta permanece fechada e pode ser abortada', async () => {
  const env = { ...access, DB: await database(), WIKI_BUCKET: bucket() }
  try {
    const status = await (await service.recoveryGet(request('GET'), env)).json()
    const counts = Object.fromEntries(service.RECOVERY_TABLES.map(table => [table, 0]))
    const operation = await post(env, null, 'begin-restore', { databaseSchema: 17, tables: status.tables, counts, objectCount: 1 })
    await assert.rejects(post(env, operation.token, 'start-validation'), { status: 409 })
    assert.equal(env.DB.sqlite.prepare('SELECT kind FROM core_recovery_lock').get().kind, 'restore')
    await post(env, operation.token, 'abort')
    assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM core_recovery_lock').get().n, 0)
  } finally { env.DB.sqlite.close() }
})

test('backup não omite silenciosamente tabelas de um schema desconhecido', async () => {
  const env = { ...access, DB: await database(), WIKI_BUCKET: bucket() }
  try {
    env.DB.sqlite.exec('CREATE TABLE custom_data (id TEXT)')
    await assert.rejects(post(env, null, 'begin-backup'), { status: 409 })
    assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM core_recovery_lock').get().n, 0)
  } finally { env.DB.sqlite.close() }
})

test('cliente Node transfere backup e retoma restauração interrompida pela API HTTP', async () => {
  const source = { ...access, DB: await database(), WIKI_BUCKET: bucket() }
  const target = { ...access, DB: await database(), WIKI_BUCKET: bucket() }
  const directory = await mkdtemp(join(tmpdir(), 'wiki-recovery-http-'))
  async function server(env) {
    const server = createServer(async (incoming, outgoing) => {
      try {
        const headers = new Headers(Object.entries(incoming.headers).filter(([, value]) => typeof value === 'string'))
        const body = ['GET', 'HEAD'].includes(incoming.method) ? undefined : Readable.toWeb(incoming)
        const req = new Request(`http://127.0.0.1:${server.address().port}${incoming.url}`, { method: incoming.method, headers, body, ...(body ? { duplex: 'half' } : {}) })
        const response = await (incoming.method === 'GET' ? service.recoveryGet(req, env) : incoming.method === 'PUT' ? service.recoveryPut(req, env) : service.recoveryPost(req, env))
        outgoing.writeHead(response.status, Object.fromEntries(response.headers))
        if (response.body) Readable.fromWeb(response.body).pipe(outgoing)
        else outgoing.end()
      } catch (cause) { outgoing.writeHead(cause.status || 500, { 'content-type': 'application/json' }); outgoing.end(JSON.stringify({ error: cause.message })) }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    return server
  }
  const servers = [await server(source), await server(target)]
  try {
    const page = await core.writePage(source, 'alpha', { title: 'Alpha', content: 'initial', summary: 'first', expectedRevisionId: null }, 'editor@example.com')
    await core.writePage(source, 'alpha', { title: 'Alpha', content: 'updated', summary: 'second', expectedRevisionId: page.currentRevisionId, categories: ['Category'] }, 'editor@example.com')
    const bytes = new TextEncoder().encode('full media')
    const sha256 = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex')
    await source.WIKI_BUCKET.put('uploads/media.png', bytes, { httpMetadata: { contentType: 'image/png' }, customMetadata: { filename: 'mídia.png' } })
    await core.recordUpload(source, { r2Key: 'uploads/media.png', filename: 'media.png', mimeType: 'image/png', sizeBytes: bytes.length, sha256 })
    const script = `import fs from 'node:fs';import path from 'node:path';
import {RecoveryClient,backupRemote,restoreRemote} from './src/setup/remote-recovery.js';
const [source,target,jwt,root]=process.argv.slice(1);
await backupRemote(new RecoveryClient(source,jwt),path.join(root,'archive'));
class InterruptedClient extends RecoveryClient {
  async post(action,values) { const result=await super.post(action,values);if(action==='table')throw new Error('interrupted after committed chunk');return result }
}
try { await restoreRemote(new InterruptedClient(target,jwt),path.join(root,'archive'),path.join(root,'operation.json'));throw new Error('interruption expected') }
catch(error){if(!error.message.includes('interrupted'))throw error}
if(!fs.existsSync(path.join(root,'operation.json')))throw new Error('missing recovery state');
await restoreRemote(new RecoveryClient(target,jwt),path.join(root,'archive'),path.join(root,'operation.json'),true);
if(fs.existsSync(path.join(root,'operation.json')))throw new Error('recovery state remains');
console.log('round trip complete with resume');`
    const args = servers.map(server => `http://127.0.0.1:${server.address().port}`)
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, ...args, jwt, directory], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', bytes => { output += bytes.toString() })
    child.stderr.on('data', bytes => { output += bytes.toString() })
    const exit = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve) })
    assert.equal(exit, 0, output)
    assert.match(output, /round trip complete/)
    for (const table of service.RECOVERY_TABLES) assert.deepEqual(target.DB.sqlite.prepare(`SELECT * FROM ${table}`).all(), source.DB.sqlite.prepare(`SELECT * FROM ${table}`).all(), table)
    assert.equal((await target.WIKI_BUCKET.head('uploads/media.png')).customMetadata.filename, 'mídia.png')
  } finally {
    for (const server of servers) await new Promise(resolve => server.close(resolve))
    source.DB.sqlite.close(); target.DB.sqlite.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('destino com configurações persistentes recusa restauração antes de alterar dados', async () => {
  const env = { ...access, DB: await database(), WIKI_BUCKET: bucket() }
  try {
    const status = await (await service.recoveryGet(request('GET'), env)).json()
    env.DB.sqlite.prepare("INSERT INTO global_settings VALUES ('templates','false','now','owner@example.com')").run()
    const counts = Object.fromEntries(service.RECOVERY_TABLES.map(table => [table, 0]))
    await assert.rejects(post(env, null, 'begin-restore', { databaseSchema: 17, tables: status.tables, counts, objectCount: 0 }), { status: 409 })
    assert.equal(env.DB.sqlite.prepare('SELECT value_json FROM global_settings').get().value_json, 'false')
    assert.equal(env.DB.sqlite.prepare('SELECT count(*) n FROM core_recovery_lock').get().n, 0)
  } finally { env.DB.sqlite.close() }
})

test.after(() => { globalThis.fetch = originalFetch })
