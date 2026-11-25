import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { startServer } from '../setup/server.js'
import { Project, genericConfig } from '../setup/project.js'
import http from 'node:http'

const project = () => { const p = new Project(); p.config = genericConfig; p.installation = () => ({}); p.presets = () => ({}); return p }
const headers = app => ({ 'x-setup-token': app.token, 'content-type': 'application/json', origin: app.origin })
async function connect(app) { const controller = new AbortController(); const response = await fetch(app.origin + '/api/events?token=' + app.token, { signal: controller.signal }); assert.equal(response.status, 200); return () => controller.abort() }
async function until(check) { for (let attempt = 0; attempt < 100; attempt++) { if (check()) return; await sleep(10) } throw new Error('condition not reached') }

test('setup valida Host, Origin, CSRF e autorização local antes de encerrar', async () => {
  const app = await startServer({ project: project(), port: 0, openBrowser: false, graceMs: 120 })
  try {
    const html = await (await fetch(app.origin)).text()
    assert.ok(html.includes(`content="${app.token}"`))
    assert.equal((await fetch(app.origin + '/api/state')).status, 403)
    assert.equal((await fetch(app.origin + '/api/shutdown', { method: 'POST', body: '{}', headers: { ...headers(app), origin: 'https://attacker.invalid' } })).status, 403)
    const rebinding = await new Promise((resolve, reject) => { http.get(app.origin + '/api/state', { headers: { ...headers(app), host: 'attacker.invalid' } }, response => { response.resume(); resolve(response.statusCode) }).on('error', reject) })
    assert.equal(rebinding, 403)
    assert.equal((await fetch(app.origin + '/api/state', { headers: headers(app) })).status, 200)
    assert.equal((await fetch(app.origin + '/api/shutdown', { method: 'POST', body: '{}', headers: headers(app) })).status, 200)
    await app.closed
    await assert.rejects(fetch(app.origin))
  } finally { await app.shutdown(); await app.closed }
})
test('SSE mantém servidor sem primeiro cliente, com aba em segundo plano, recarga e múltiplas abas', async () => {
  const app = await startServer({ project: project(), port: 0, openBrowser: false, graceMs: 120 })
  try {
    await sleep(250)
    assert.equal((await fetch(app.origin)).status, 200)
    const first = await connect(app), second = await connect(app)
    first(); await until(() => app.clientCount === 1); await sleep(250)
    assert.equal((await fetch(app.origin)).status, 200)
    second(); await until(() => app.clientCount === 0); await sleep(25)
    const refreshed = await connect(app)
    await sleep(250); assert.equal(app.clientCount, 1)
    refreshed(); await app.closed
    await assert.rejects(fetch(app.origin))
  } finally { await app.shutdown(); await app.closed }
})
test('encerramento aguarda operação crítica antes de liberar porta e conexões', async () => {
  const p = project(); let release
  p.save = () => new Promise(resolve => { release = () => resolve({ config: {} }) })
  const app = await startServer({ project: p, port: 0, openBrowser: false, graceMs: 80 })
  try {
    const operation = fetch(app.origin + '/api/configure', { method: 'POST', headers: headers(app), body: '{}' })
    await until(() => app.active === 1)
    assert.equal((await fetch(app.origin + '/api/shutdown', { method: 'POST', headers: headers(app), body: '{}' })).status, 200)
    await sleep(100); assert.equal(app.active, 1)
    assert.equal((await fetch(app.origin + '/api/configure', { method: 'POST', headers: headers(app), body: '{}' })).status, 503)
    release(); assert.equal((await operation).status, 200); await app.closed
    await assert.rejects(fetch(app.origin))
  } finally { release?.(); await app.shutdown(); await app.closed }
})

test('setup recusa interfaces públicas e escolhe outra porta quando necessário', async () => {
  await assert.rejects(startServer({ host: '0.0.0.0', port: 0, openBrowser: false }), /loopback/)
  const first = await startServer({ project: project(), port: 0, openBrowser: false })
  let second
  try {
    second = await startServer({ project: project(), port: first.server.address().port, openBrowser: false })
    assert.notEqual(first.origin, second.origin)
    assert.equal((await fetch(second.origin)).status, 200)
  } finally { await first.shutdown(); if (second) await second.shutdown(); await first.closed; if (second) await second.closed }
})

test('setup aceita loopback IPv6 com a mesma autorização local', async t => {
  let app
  try { app = await startServer({ project: project(), host: '::1', port: 0, openBrowser: false }) }
  catch (error) { if (['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) return t.skip('IPv6 indisponível'); throw error }
  try {
    assert.equal((await fetch(app.origin + '/api/state', { headers: headers(app) })).status, 200)
    assert.equal((await fetch(app.origin + '/api/shutdown', { method: 'POST', headers: headers(app), body: '{}' })).status, 200)
    await app.closed
  } finally { await app.shutdown(); await app.closed }
})
