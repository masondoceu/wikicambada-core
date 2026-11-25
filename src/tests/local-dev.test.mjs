import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createHmac } from 'node:crypto'
import { database, loadFunction } from './helpers.mjs'
import { localProxy } from '../scripts/dev.mjs'
const auth = await loadFunction('functions/api/_lib/access.ts')

test('bypass local exige prova do servidor, flag explícita e loopback, sem JWT ou headers manuais', async () => {
  const DB = await database(), secret = 'a'.repeat(64), env = { DB, DEV_BYPASS_AUTH: 'true', WIKI_LOCAL_AUTH_SECRET: secret }
  const worker = http.createServer(async (incoming, response) => {
    try { const user = await auth.readAccessUser(new Request(`http://${incoming.headers.host}${incoming.url}`, { headers: incoming.headers }), env); response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(user)) }
    catch { response.writeHead(500); response.end() }
  })
  await new Promise(resolve => worker.listen(0, '127.0.0.1', resolve))
  const target = `http://127.0.0.1:${worker.address().port}`, proxy = await localProxy(target, secret, { port: 0 })
  try {
    const user = await (await fetch(proxy.origin + '/api/auth/me')).json()
    assert.equal(user.canEdit, true); assert.equal(user.role, 'super_admin'); assert.equal(user.access, 'development')
    assert.equal((await (await fetch(target + '/api/auth/me', { headers: { 'cf-access-authenticated-user-email': 'local-admin@wikicambada.invalid' } })).json()).authenticated, false)
    env.DEV_BYPASS_AUTH = 'false'
    assert.equal((await (await fetch(proxy.origin + '/api/auth/me')).json()).authenticated, false)
    env.DEV_BYPASS_AUTH = 'true'
    const stamp = String(Date.now()), signature = createHmac('sha256', secret).update(`${stamp}\nGET\n/api/auth/me`).digest('hex')
    const signed = new Request(target + '/api/auth/me', { headers: { 'x-wiki-local-auth': `${stamp}.${signature}` } })
    assert.equal((await auth.readAccessUser(signed, { DB, DEV_BYPASS_AUTH: 'true' })).authenticated, false)
    const expired = String(Date.now() - 20000), expiredSignature = createHmac('sha256', secret).update(`${expired}\nGET\n/api/auth/me`).digest('hex')
    assert.equal((await auth.readAccessUser(new Request(target + '/api/auth/me', { headers: { 'x-wiki-local-auth': `${expired}.${expiredSignature}` } }), env)).authenticated, false)
    assert.equal((await auth.readAccessUser(new Request(target + '/api/auth/me?different=1', { headers: { 'x-wiki-local-auth': `${stamp}.${signature}` } }), env)).authenticated, false)
    assert.equal((await auth.readAccessUser(new Request('https://public.example.com/api/auth/me', { headers: { 'x-wiki-local-auth': `${stamp}.${signature}` } }), env)).authenticated, false)
    assert.equal((await auth.readAccessUser(new Request(target + '/api/auth/me', { headers: { 'x-wiki-local-auth': `${stamp}.${'0'.repeat(64)}` } }), env)).authenticated, false)
    assert.equal((await fetch(proxy.origin + '/api/auth/me', { headers: { origin: 'https://attacker.invalid' } })).status, 403)
    assert.equal((await fetch(proxy.origin + '/api/auth/me', { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403)
    DB.sqlite.prepare("UPDATE editor_profiles SET status='disabled'").run()
    assert.equal((await (await fetch(proxy.origin + '/api/auth/me')).json()).canEdit, false)
  } finally { await proxy.close(); worker.closeAllConnections(); await new Promise(resolve => worker.close(resolve)); DB.sqlite.close() }
})
