import test from 'node:test'
import assert from 'node:assert/strict'
import { database, loadFunction } from './helpers.mjs'

const auth = await loadFunction('functions/api/_lib/access.ts')
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'test' }
const originalFetch = globalThis.fetch
globalThis.fetch = async () => Response.json({ keys: [jwk] })
const env = { ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com', ACCESS_AUD: 'wiki', ACCESS_STRICT: 'true' }
async function request(payload = {}, header = {}) {
  const now = Math.floor(Date.now() / 1000)
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const data = `${encode({ alg: 'RS256', kid: 'test', ...header })}.${encode({ email: 'editor@example.com', iss: env.ACCESS_TEAM_DOMAIN, aud: ['wiki'], exp: now + 600, iat: now, ...payload })}`
  const signature = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(data))).toString('base64url')
  return new Request('https://wiki.example.com/api/secure/pages', { headers: { 'cf-access-jwt-assertion': `${data}.${signature}` } })
}

test('Access verifica assinatura, issuer, audience, exp, nbf, iat e algoritmo', async () => {
  const DB = await database()
  assert.equal((await auth.readAccessUser(await request(), { ...env, DB })).canEdit, true)
  for (const payload of [{ iss: 'https://other.example.com' }, { aud: ['other'] }, { exp: undefined }, { exp: 1 }, { nbf: 9999999999 }, { iat: 9999999999 }, { email: undefined }]) assert.equal((await auth.readAccessUser(await request(payload), { ...env, DB })).authenticated, false)
  assert.equal((await auth.readAccessUser(await request({}, { alg: 'HS256' }), { ...env, DB })).authenticated, false)
  const signed = await request()
  const token = signed.headers.get('cf-access-jwt-assertion')
  assert.equal((await auth.readAccessUser(new Request(signed.url, { headers: { 'cf-access-jwt-assertion': `${token.slice(0, -5)}abcde` } }), { ...env, DB })).authenticated, false)
  DB.sqlite.close()
})

test('usuário desativado e falhas D1 nunca concedem edição', async () => {
  const DB = await database()
  const signed = await request()
  await auth.readAccessUser(signed, { ...env, DB })
  DB.sqlite.prepare("UPDATE editor_profiles SET status = 'disabled'").run()
  assert.equal((await auth.readAccessUser(signed, { ...env, DB })).canEdit, false)
  DB.fail = sql => sql.includes('SELECT * FROM editor_profiles')
  const failed = await auth.readAccessUser(signed, { ...env, DB })
  assert.equal(failed.canEdit, false)
  assert.equal(failed.status, 'unavailable')
  await assert.rejects(auth.requireAccessUser(signed, { ...env, DB }), { status: 503 })
  assert.equal((await auth.readAccessUser(signed, env)).canEdit, false)
  DB.sqlite.close()
})

test('modo permissivo exige opção explícita e endereço local', async () => {
  const DB = await database()
  const headers = { 'cf-access-authenticated-user-email': 'editor@example.com' }
  const remote = new Request('https://wiki.example.com/', { headers })
  const local = new Request('http://localhost/', { headers })
  assert.equal((await auth.readAccessUser(remote, { DB, ACCESS_STRICT: 'false' })).authenticated, false)
  assert.equal((await auth.readAccessUser(remote, { DB, ACCESS_STRICT: 'false', WIKI_DEV_AUTH: 'true' })).authenticated, false)
  assert.equal((await auth.readAccessUser(local, { DB, ACCESS_STRICT: 'false', WIKI_DEV_AUTH: 'true' })).access, 'development')
  DB.sqlite.close()
})

test('falha na promoção do perfil e bindings JWT ausentes recusam autorização', async () => {
  const DB = await database()
  const signed = await request()
  await auth.readAccessUser(signed, { ...env, DB })
  DB.fail = sql => sql.includes('UPDATE editor_profiles SET role')
  const failed = await auth.readAccessUser(signed, { ...env, DB, WIKI_SUPER_ADMIN_EMAIL: 'editor@example.com' })
  assert.equal(failed.status, 'unavailable')
  assert.equal(failed.canEdit, false)
  assert.equal((await auth.readAccessUser(signed, { DB, ACCESS_STRICT: 'false' })).authenticated, false)
  DB.sqlite.close()
})

test.after(() => { globalThis.fetch = originalFetch })
