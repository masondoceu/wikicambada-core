import { localizeDiagnostic } from '../scripts/core/i18n.js'
import { messages } from './messages.js'

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { spawn } from 'node:child_process'
import { Project, genericConfig } from './project.js'
import { migrateLegacy } from './legacy.js'
import { operationLock } from './files.js'
import { backupProject, updateFromBase64, recoverInterrupted } from './updater.js'

export async function startServer({ project = new Project(), port = 8765, host = '127.0.0.1', graceMs = 25000, openBrowser = true } = {}) {
  if (!['127.0.0.1', '::1'].includes(host)) throw new Error('Setup must listen on loopback')
  const token = randomBytes(32).toString('hex'), clients = new Set(), sockets = new Set()
  let connected = false, timer, closing = false, active = 0, origin
  let resolveClosed
  const closed = new Promise(resolve => { resolveClosed = resolve })
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'" }
  function send(response, status, data, type = 'application/json; charset=utf-8') { const body = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data)); response.writeHead(status, { ...headers, 'content-type': type, 'content-length': body.length }); response.end(body) }
  function validToken(value) { return typeof value === 'string' && Buffer.byteLength(value) === token.length && timingSafeEqual(Buffer.from(value), Buffer.from(token)) }
  function authorized(request, url) {
    if (request.headers.host !== new URL(origin).host || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)) return false
    if (request.headers.origin && request.headers.origin !== origin || request.headers['sec-fetch-site'] === 'cross-site') return false
    return validToken(request.headers['x-setup-token'] || (url.pathname === '/api/events' ? url.searchParams.get('token') : null))
  }
  async function finish() {
    if (!closing || active) return
    clearTimeout(timer)
    for (const client of clients) client.end()
    clients.clear()
    server.close(() => resolveClosed())
    server.closeIdleConnections()
    for (const socket of sockets) socket.end()
    const force = setTimeout(() => { for (const socket of sockets) socket.destroy() }, 1000)
    force.unref()
  }
  async function shutdown() { closing = true; await finish() }
  function disconnected() {
    if (!closing && connected && clients.size === 0) { clearTimeout(timer); timer = setTimeout(shutdown, graceMs) }
  }
  const server = http.createServer(async (request, response) => {
    const language = request.headers['x-setup-language']
    const translate = value => language === 'en' ? value : localizeDiagnostic(value, messages)
    const verification = result => ({
      ...result,
      checks: result.checks.map(item => ({ ...item, name: translate(item.name), message: translate(item.message) }))
    })
    const reply = (status, data) => {
      if (data.error) {
        const message = translate(data.error)
        return send(response, status, { ...data, error: language === 'pt-BR' && message === data.error
          ? messages['Could not complete the local operation'] : message })
      }
      return send(response, status, data.verification ? { ...data, verification: verification(data.verification) } : data)
    }
    try {
      const url = new URL(request.url, origin)
      if (request.headers.host !== new URL(origin).host || request.headers.origin && request.headers.origin !== origin || request.headers['sec-fetch-site'] === 'cross-site') return reply(403, { error: 'Origin not allowed' })
      const ui = project.file('src/setup/ui')
      if (request.method === 'GET' && !url.pathname.startsWith('/api/')) {
        const name = url.pathname === '/' || url.pathname === '/index.html' ? 'index.html' : url.pathname.slice(1)
        if (!['index.html', 'setup.js', 'setup.css', 'cat-guard.png'].includes(name)) return reply(404, { error: 'Not found' })
        let body = fs.readFileSync(path.join(ui, name))
        if (name === 'index.html') body = Buffer.from(body.toString().replace('<head>', `<head>\n  <meta name="setup-token" content="${token}">`))
        return send(response, 200, body, { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', png: 'image/png' }[name.split('.').at(-1)])
      }
      if (!authorized(request, url)) return reply(403, { error: 'Invalid origin or local authorization' })
      if (request.method === 'GET' && url.pathname === '/api/events') {
        if (closing) return reply(503, { error: 'Shutting down' })
        clearTimeout(timer); connected = true; clients.add(response)
        response.writeHead(200, { ...headers, 'content-type': 'text/event-stream', connection: 'keep-alive' }); response.write(': connected\n\n')
        const heartbeat = setInterval(() => response.write(': keepalive\n\n'), 10000)
        response.on('close', () => { clearInterval(heartbeat); clients.delete(response); disconnected() })
        return
      }
      if (request.method === 'GET' && url.pathname === '/api/state') return send(response, 200, { config: project.config(), newConfig: genericConfig(), installation: project.installation(), presets: project.presets() })
      if (request.method === 'GET' && url.pathname === '/api/verify') return reply(200, verification(project.verify()))
      if (request.method !== 'POST') return reply(404, { error: 'Invalid route' })
      if (closing) return reply(503, { error: 'Shutting down' })
      if (request.headers['content-type']?.split(';')[0] !== 'application/json') return reply(400, { error: 'Invalid content type' })
      const chunks = []; let size = 0
      for await (const bytes of request) { size += bytes.length; if (size > 90 * 1024 * 1024) { reply(413, { error: 'Request too large' }); return } chunks.push(bytes) }
      let payload
      try { payload = JSON.parse(Buffer.concat(chunks).toString() || '{}') }
      catch { return reply(400, { ok: false, error: 'Invalid JSON' }) }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('The request body must be a JSON object')
      if (closing) return reply(503, { error: 'Shutting down' })
      if (url.pathname === '/api/shutdown') { send(response, 200, { ok: true }); response.on('finish', shutdown); setImmediate(shutdown); return }
      active++
      try {
        let result
        if (url.pathname === '/api/configure') result = { ok: true, ...await project.save(payload) }
        else if (url.pathname === '/api/backup') result = await operationLock(project.root, () => ({ ok: true, backup: backupProject(project) }))
        else if (url.pathname === '/api/update') result = await updateFromBase64(project, payload.file?.data || '', payload.file?.name, payload.expectedSha256)
        else if (url.pathname === '/api/migrate-legacy') result = await migrateLegacy(project, payload)
        else if (url.pathname === '/api/recover-local') result = await recoverInterrupted(project)
        else return reply(404, { error: 'Invalid route' })
        reply(200, result)
      } finally { active--; if (closing) await finish() }
    } catch (error) {
      if (!response.headersSent) reply(400, { ok: false, error: error.code ? 'Could not complete the local operation' : error.message })
    }
  })
  server.requestTimeout = 0
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
  async function listen(candidate) { return new Promise((resolve, reject) => { const fail = error => { server.off('listening', ready); reject(error) }, ready = () => { server.off('error', fail); resolve() }; server.once('error', fail); server.once('listening', ready); server.listen(candidate, host) }) }
  try { await listen(port) } catch (error) { if (error.code !== 'EADDRINUSE' || port === 0) throw error; await listen(0) }
  origin = `http://${host === '::1' ? '[::1]' : host}:${server.address().port}`
  if (openBrowser) {
    const platform = process.platform
    const command = platform === 'win32' ? 'rundll32.exe' : platform === 'darwin' ? 'open' : 'xdg-open'
    const child = spawn(command, platform === 'win32' ? ['url.dll,FileProtocolHandler', origin] : [origin], { detached: true, stdio: 'ignore', windowsHide: true })
    child.on('error', () => {}); child.unref()
  }
  return { server, origin, token, closed, shutdown, get active() { return active }, get clientCount() { return clients.size } }
}
