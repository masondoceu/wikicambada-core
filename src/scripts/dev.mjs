import http from 'node:http'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { parseArgs } from 'node:util'

export async function localProxy(target, secret, { host = '127.0.0.1', port = 8788 } = {}) {
  if (!['127.0.0.1', '::1'].includes(host) || !['127.0.0.1', '[::1]'].includes(new URL(target).hostname)) throw new Error('The development server must listen on loopback')
  let origin
  const server = http.createServer((request, response) => {
    if (request.headers.host !== new URL(origin).host || request.headers.origin && request.headers.origin !== origin || request.headers['sec-fetch-site'] === 'cross-site' || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)) { response.writeHead(403); response.end(); return }
    const url = new URL(request.url, origin), timestamp = String(Date.now())
    const proof = createHmac('sha256', secret).update(`${timestamp}\n${request.method}\n${url.pathname}${url.search}`).digest('hex')
    const headers = { ...request.headers, host: new URL(target).host, 'x-wiki-local-auth': timestamp + '.' + proof }
    if (headers.origin) headers.origin = new URL(target).origin
    const upstream = http.request(new URL(url.pathname + url.search, target), { method: request.method, headers }, incoming => { response.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(response) })
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(503); response.end() })
    request.on('aborted', () => upstream.destroy()); request.pipe(upstream)
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve) })
  origin = `http://${host === '::1' ? '[::1]' : host}:${server.address().port}`
  return { server, origin, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }) }
}
async function main() {
  const { values } = parseArgs({ options: { port: { type: 'string', default: '8788' }, ip: { type: 'string', default: '127.0.0.1' } } })
  if (!['127.0.0.1', '::1'].includes(values.ip)) throw new Error('The development server must listen on loopback')
  const reservation = net.createServer()
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve)); const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve))
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), secret = randomBytes(32).toString('hex')
  const child = spawn(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'pages', 'dev', '.wikicambada/public', '--ip', '127.0.0.1', '--port', String(port), '--binding', `WIKI_LOCAL_AUTH_SECRET=${secret}`], { cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let proxy, stopped = false
  const stop = () => { if (stopped) return; stopped = true; child.kill(); if (proxy) void proxy.close() }
  child.once('error', error => { console.error(error.message); process.exitCode = 1; stop() })
  child.once('exit', code => { stop(); if (code) process.exitCode = code })
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => process.stdout.write(chunk.toString().replaceAll(secret, '[local]')))
  try { proxy = await localProxy(`http://127.0.0.1:${port}`, secret, { host: values.ip, port: Number(values.port) }) } catch (error) { stop(); throw error }
  if (stopped) { await proxy.close(); return }
  console.log('WikiCambada Core: ' + proxy.origin)
  process.once('SIGINT', stop); process.once('SIGTERM', stop)
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })
