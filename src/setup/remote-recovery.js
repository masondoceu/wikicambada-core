import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { isDeepStrictEqual } from 'node:util'
import { hash, safePath, writeJson, readJson, removeWithin, operationLock } from './files.js'
import { TABLES, EMPTY_ORDER, quote, columns, initializeDatabase, jsonLines, backupLocal, validateArchive } from './recovery.js'

export class RecoveryClient {
  constructor(url, jwt) {
    const parsed = new URL(url)
    if (parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname) || parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))) throw new Error('URL de recuperação inválida')
    if (!jwt || /[\r\n]/.test(jwt)) throw new Error('JWT de acesso inválido')
    this.url = parsed.origin + '/api/secure/admin/recovery'; this.jwt = jwt; this.token = null
  }
  async request(method, params, body, headers = {}) {
    const target = this.url + (params ? '?' + new URLSearchParams(params) : '')
    const values = { 'cf-access-jwt-assertion': this.jwt, Cookie: 'CF_Authorization=' + this.jwt, 'x-wiki-request': '1', Accept: 'application/json', ...(this.token ? { 'x-wiki-recovery': this.token } : {}), ...headers }
    if (body && typeof body === 'object' && !(body instanceof Readable)) { body = JSON.stringify(body); values['content-type'] = 'application/json' }
    let response
    try { response = await fetch(target, { method, headers: values, body, redirect: 'manual', signal: AbortSignal.timeout(60000), ...(body instanceof Readable ? { duplex: 'half' } : {}) }) } catch { throw new Error('a API de recuperação não está disponível') }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`recuperação recusada pela API (HTTP ${response.status})`) }
    return response
  }
  async json(method, params, body) { return (await this.request(method, params, body)).json() }
  post(action, values = {}) { return this.json('POST', null, { action, ...values }) }
  async validate(kind) {
    await this.post('start-validation'); let cursor = null
    do { const result = await this.post('validate', kind === 'backup' ? cursor === null ? {} : { cursor } : { offset: cursor || 0 }); cursor = result.next } while (cursor !== null)
  }
  async abort() { while (!(await this.post('abort')).done) {} }
}
export async function backupRemote(client, destination, configuration) {
  if (fs.existsSync(destination)) throw new Error('o destino do backup já existe')
  const operation = await client.post('begin-backup'); client.token = operation.token
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-remote-backup-')); let completed = false
  try {
    const database = path.join(temporary, 'database.sqlite'), objects = path.join(temporary, 'objects'), metadata = {}
    fs.mkdirSync(objects)
    const db = new DatabaseSync(database)
    try {
      initializeDatabase(db)
      if (operation.databaseSchema !== 17 || !isDeepStrictEqual(operation.tables, columns(db))) throw new Error('schema remoto incompatível com esta distribuição')
      db.exec('BEGIN')
      try {
        for (const table of EMPTY_ORDER) db.exec('DELETE FROM ' + quote(table))
        for (const [table, names] of Object.entries(operation.tables)) {
          let cursor = null
          const insert = db.prepare(`INSERT INTO ${quote(table)} (${names.map(quote).join(',')}) VALUES (${names.map(() => '?').join(',')})`)
          do {
            const page = await client.json('GET', { action: 'table', table, ...(cursor === null ? {} : { cursor }) })
            for (const row of page.rows) insert.run(...names.map(name => row[name]))
            cursor = page.next
          } while (cursor !== null)
        }
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
    } finally { db.close() }
    let cursor = null
    do {
      const page = await client.json('GET', { action: 'objects', ...(cursor === null ? {} : { cursor }) })
      for (const item of page.objects) {
        const target = path.join(objects, safePath(item.key)); fs.mkdirSync(path.dirname(target), { recursive: true })
        const response = await client.request('GET', { action: 'object', key: item.key })
        await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(target, { flags: 'wx' }))
        if (fs.statSync(target).size !== item.size) throw new Error('transferência R2 incompleta')
        metadata[item.key] = { httpMetadata: item.httpMetadata, customMetadata: item.customMetadata }
      }
      cursor = page.next
    } while (cursor !== null)
    await client.validate('backup')
    const manifest = await backupLocal(database, objects, destination, configuration, metadata)
    await client.post('finish'); completed = true
    return manifest
  } finally { removeWithin(os.tmpdir(), temporary); if (!completed) await client.abort() }
}
export async function restoreRemote(client, archive, stateFile, resume = false) {
  archive = path.resolve(archive); stateFile = path.resolve(stateFile)
  const manifest = await validateArchive(archive), manifestHash = hash(path.join(archive, 'manifest.json'))
  return operationLock(path.dirname(stateFile), async () => {
    const db = new DatabaseSync(path.join(archive, 'database.sqlite'), { readOnly: true })
    try {
      const tables = columns(db), counts = Object.fromEntries(TABLES.map(table => [table, db.prepare(`SELECT COUNT(*) AS n FROM ${quote(table)}`).get().n]))
      let objectCount = 0; for await (const item of jsonLines(path.join(archive, 'objects.jsonl'))) objectCount++
      let phase
      if (fs.existsSync(stateFile)) {
        const state = readJson(stateFile)
        if (!resume || state.url !== client.url || state.manifestHash !== manifestHash) throw new Error('há uma restauração pendente; verifique o destino e o backup antes de continuar')
        client.token = state.token
        const status = (await client.json('GET')).operation
        if (!status || status.token !== client.token || status.kind !== 'restore') throw new Error('a restauração pendente não corresponde ao destino')
        phase = status.phase
      } else {
        const operation = await client.post('begin-restore', { databaseSchema: 17, tables, counts, objectCount }); client.token = operation.token
        writeJson(stateFile, { url: client.url, token: client.token, manifestHash }); phase = 'transfer'
      }
      if (phase === 'transfer') {
        for await (const item of jsonLines(path.join(archive, 'objects.jsonl'))) {
          const metadata = Buffer.from(JSON.stringify({ httpMetadata: item.httpMetadata || {}, customMetadata: item.customMetadata || {} })).toString('base64')
          const stream = fs.createReadStream(path.join(archive, 'objects', safePath(item.key)))
          try { const response = await client.request('PUT', { key: item.key }, stream, { 'content-length': String(item.size), 'content-type': 'application/octet-stream', 'x-wiki-sha256': item.sha256, 'x-wiki-object-metadata': metadata }); await response.json() } finally { stream.destroy() }
        }
        for (const table of TABLES) {
          let chunk = 0, rows = []
          for (const row of db.prepare('SELECT * FROM ' + quote(table)).iterate()) { rows.push(row); if (rows.length === 20) { await client.post('table', { table, rows, chunkId: `${table}:${chunk++}` }); rows = [] } }
          if (rows.length) await client.post('table', { table, rows, chunkId: `${table}:${chunk}` })
        }
        await client.post('start-validation'); phase = 'validating'
      }
      if (phase === 'validating') { let offset = 0; do { const page = await client.post('validate', { offset }); offset = page.next } while (offset !== null) }
      await client.post('finish'); fs.unlinkSync(stateFile)
      return manifest
    } finally { db.close() }
  })
}
