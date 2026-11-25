import { readAccessIdentity } from './access'
import { EditorialError, type Env } from './d1'
import { json } from './response'

export const RECOVERY_TABLES = ['editor_profiles', 'pages', 'revisions', 'redirects', 'categories', 'page_categories', 'page_links', 'uploads', 'system_settings', 'page_search', 'edit_proposals', 'page_aliases', 'ip_rules', 'activity_events', 'content_templates', 'global_settings', 'core_write_guards', 'proposal_rate_limits', 'r2_cleanup']

const EMPTY_ORDER = ['page_search', 'page_links', 'page_aliases', 'page_categories', 'revisions', 'redirects', 'pages', ...RECOVERY_TABLES.filter(name => !['page_search', 'page_links', 'page_aliases', 'page_categories', 'revisions', 'redirects', 'pages'].includes(name))]
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`
const EMPTY_TARGET = `${RECOVERY_TABLES.filter(table => table !== 'content_templates').map(table => `(SELECT COUNT(*) FROM ${quote(table)})`).join(' + ')} + (SELECT COUNT(*) FROM content_templates WHERE COALESCE(created_by_email, '') != 'system' OR COALESCE(updated_by_email, '') != 'system')`

async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function owner(request: Request, env: Env) {
  if (!env.DB || !env.WIKI_BUCKET) throw new EditorialError('armazenamento indisponível', 503)
  const identity = await readAccessIdentity(request, env)
  const email = identity.development ? identity.email! : String(env.WIKI_SUPER_ADMIN_EMAIL || '').trim().toLowerCase()
  if ((!identity.verified && !identity.development) || !email || identity.email !== email) throw new EditorialError('recuperação restrita ao super administrador', 403)
  const profile: any = await env.DB.prepare('SELECT status FROM editor_profiles WHERE email = ?').bind(email).first()
  const operation: any = await env.DB.prepare('SELECT token, owner_email FROM core_recovery_lock WHERE id = 1').first()
  const continuing = operation?.owner_email === email && operation.token === request.headers.get('x-wiki-recovery')
  if (!continuing && profile && profile.status !== 'active') throw new EditorialError('conta desativada', 403)
  return email
}

async function lockFor(request: Request, env: Env, email: string) {
  const lock: any = await env.DB!.prepare('SELECT * FROM core_recovery_lock WHERE id = 1').first()
  if (!lock || lock.owner_email !== email || lock.token !== request.headers.get('x-wiki-recovery')) throw new EditorialError('operação de recuperação não encontrada', 409)
  return lock
}

async function schema(env: Env) {
  const known = new Set([...RECOVERY_TABLES, 'core_recovery_lock', 'core_recovery_objects', 'core_recovery_chunks', 'd1_migrations', '_cf_KV', '_cf_METADATA', 'page_search_data', 'page_search_idx', 'page_search_content', 'page_search_docsize', 'page_search_config'])
  const inventory = await env.DB!.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()
  if (inventory.results.some((row: any) => !known.has(String(row.name)))) throw new EditorialError('o banco contém tabelas fora do schema de recuperação', 409)
  const triggers = await env.DB!.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'recovery_%'").all()
  if (triggers.results.length !== 54) throw new EditorialError('proteções de recuperação não foram aplicadas', 503)
  const result: Record<string, string[]> = {}
  for (const table of RECOVERY_TABLES) {
    const rows = await env.DB!.prepare(`PRAGMA table_info(${quote(table)})`).all()
    if (!rows.results.length) throw new EditorialError('schema de recuperação incompleto', 503)
    result[table] = rows.results.map((row: any) => String(row.name))
  }
  return result
}

function objectKey(value: string | null) {
  const key = String(value || '')
  if (!key || new TextEncoder().encode(key).length > 1024 || /[\u0000-\u001f]/.test(key)) throw new EditorialError('chave de objeto inválida', 400)
  return key
}

async function restoreBatch(env: Env, token: string, phase: string, statements: D1PreparedStatement[]) {
  const guard = crypto.randomUUID()
  await env.DB!.batch([
    env.DB!.prepare('UPDATE core_recovery_lock SET allow_write = 1 WHERE id = 1 AND token = ? AND phase = ?').bind(token, phase),
    env.DB!.prepare('INSERT INTO core_write_guards VALUES (?, CASE WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE id = 1 AND token = ? AND phase = ?) THEN 1 ELSE 0 END)').bind(guard, token, phase),
    env.DB!.prepare('DELETE FROM core_write_guards WHERE id = ?').bind(guard),
    ...statements,
    env.DB!.prepare('UPDATE core_recovery_lock SET allow_write = 0 WHERE id = 1')
  ])
}

async function clearLock(env: Env) {
  await env.DB!.batch([
    env.DB!.prepare('DELETE FROM core_recovery_chunks'),
    env.DB!.prepare('DELETE FROM core_recovery_objects'),
    env.DB!.prepare('DELETE FROM core_recovery_lock WHERE id = 1')
  ])
}

export async function recoveryGet(request: Request, env: Env) {
  const email = await owner(request, env)
  const url = new URL(request.url)
  const action = url.searchParams.get('action') || 'status'
  if (action === 'status') {
    const row: any = await env.DB!.prepare('SELECT token, kind, phase, created_at FROM core_recovery_lock WHERE id = 1 AND owner_email = ?').bind(email).first()
    return json({ operation: row, databaseSchema: 17, tables: await schema(env) })
  }
  const lock = await lockFor(request, env, email)
  if (lock.kind !== 'backup' || lock.phase !== 'transfer') throw new EditorialError('a operação não está exportando dados', 409)
  if (action === 'table') {
    const table = String(url.searchParams.get('table') || '')
    if (!RECOVERY_TABLES.includes(table)) throw new EditorialError('tabela inválida', 400)
    const cursor = url.searchParams.has('cursor') ? Number(url.searchParams.get('cursor')) : null
    if (cursor !== null && !Number.isSafeInteger(cursor)) throw new EditorialError('cursor inválido', 400)
    const rows: any = await env.DB!.prepare(`SELECT rowid AS _recovery_cursor, * FROM ${quote(table)} WHERE (? IS NULL OR rowid > ?) ORDER BY rowid LIMIT 20`).bind(cursor, cursor).all()
    const next = rows.results.length === 20 ? Number(rows.results.at(-1)._recovery_cursor) : null
    return json({ rows: rows.results.map(({ _recovery_cursor, ...row }: any) => row), next })
  }
  if (action === 'objects') {
    const page = await env.WIKI_BUCKET!.list({ limit: 20, cursor: url.searchParams.get('cursor') || undefined, include: ['httpMetadata', 'customMetadata'] })
    if (page.objects.length) await env.DB!.batch(page.objects.map(object => env.DB!.prepare(`INSERT INTO core_recovery_objects (r2_key, size_bytes, etag, metadata_json, stored) VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(r2_key) DO UPDATE SET size_bytes = excluded.size_bytes, etag = excluded.etag, metadata_json = excluded.metadata_json`).bind(object.key, object.size, object.etag, JSON.stringify({ httpMetadata: object.httpMetadata || {}, customMetadata: object.customMetadata || {} }))))
    return json({ objects: page.objects.map(object => ({ key: object.key, size: object.size, etag: object.etag, httpMetadata: object.httpMetadata || {}, customMetadata: object.customMetadata || {} })), next: page.truncated ? page.cursor : null })
  }
  if (action === 'object') {
    const key = objectKey(url.searchParams.get('key'))
    const registered: any = await env.DB!.prepare('SELECT etag FROM core_recovery_objects WHERE r2_key = ?').bind(key).first()
    const object = await env.WIKI_BUCKET!.get(key)
    if (!registered || !object || object.etag !== registered.etag) throw new EditorialError('o inventário R2 mudou durante o backup', 409)
    return new Response(object.body, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(object.size) } })
  }
  throw new EditorialError('ação inválida', 400)
}

export async function recoveryPost(request: Request, env: Env) {
  const email = await owner(request, env)
  const input: any = await request.json().catch(() => null)
  if (!input || typeof input.action !== 'string') throw new EditorialError('payload inválido', 400)
  if (input.action === 'begin-backup' || input.action === 'begin-restore') {
    const tables = await schema(env)
    const kind = input.action === 'begin-backup' ? 'backup' : 'restore'
    const token = crypto.randomUUID()
    if (kind === 'restore') {
      if (input.databaseSchema !== 17 || JSON.stringify(input.tables) !== JSON.stringify(tables)) throw new EditorialError('schema do backup incompatível', 409)
      if (!Number.isSafeInteger(input.objectCount) || input.objectCount < 0 || !input.counts || RECOVERY_TABLES.some(table => !Number.isSafeInteger(input.counts[table]) || input.counts[table] < 0)) throw new EditorialError('manifesto de restauração inválido', 400)
      const count: any = await env.DB!.prepare(`SELECT ${EMPTY_TARGET} AS total`).first()
      if (count.total || (await env.WIKI_BUCKET!.list({ limit: 1 })).objects.length) throw new EditorialError('a restauração exige D1 e R2 vazios', 409)
    }
    try {
      const initialTemplates = kind === 'restore' ? (await env.DB!.prepare('SELECT * FROM content_templates').all()).results : []
      const insert = env.DB!.prepare('INSERT INTO core_recovery_lock (id, token, kind, owner_email, manifest_json, created_at) VALUES (1, ?, ?, ?, ?, ?)').bind(token, kind, email, kind === 'restore' ? JSON.stringify({ counts: input.counts, objectCount: input.objectCount, initialTemplates }) : null, new Date().toISOString())
      if (kind === 'restore') {
        const guardId = crypto.randomUUID()
        await env.DB!.batch([
          env.DB!.prepare(`INSERT INTO core_write_guards VALUES (?, CASE WHEN ${EMPTY_TARGET} = 0 THEN 1 ELSE 0 END)`).bind(guardId),
          env.DB!.prepare('DELETE FROM core_write_guards WHERE id = ?').bind(guardId), insert
        ])
      } else await insert.run()
    } catch (cause) {
      if (String(cause).includes('UNIQUE') || String(cause).includes('wiki_write_conflict')) throw new EditorialError('outra recuperação está em andamento', 409)
      throw cause
    }
    if (kind === 'restore') await restoreBatch(env, token, 'transfer', [env.DB!.prepare('DELETE FROM content_templates')])
    return json({ token, kind, databaseSchema: 17, tables })
  }
  const lock = await lockFor(request, env, email)
  if (input.action === 'abort') {
    if (lock.kind === 'restore') {
      await env.DB!.prepare("UPDATE core_recovery_lock SET phase = 'aborting' WHERE id = 1").run()
      const objects: any = await env.DB!.prepare('SELECT r2_key FROM core_recovery_objects LIMIT 20').all()
      for (const row of objects.results) {
        await env.WIKI_BUCKET!.delete(row.r2_key)
        await env.DB!.prepare('DELETE FROM core_recovery_objects WHERE r2_key = ?').bind(row.r2_key).run()
      }
      if (objects.results.length) return json({ ok: true, done: false })
      const initial = JSON.parse(lock.manifest_json).initialTemplates || []
      await restoreBatch(env, lock.token, 'aborting', [
        ...EMPTY_ORDER.map(table => env.DB!.prepare(`DELETE FROM ${quote(table)}`)),
        ...initial.map((row: Record<string, any>) => env.DB!.prepare(`INSERT INTO content_templates (${Object.keys(row).map(quote).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).bind(...Object.values(row)))
      ])
    }
    await clearLock(env)
    return json({ ok: true, done: true })
  }
  if (input.action === 'table' && lock.kind === 'restore' && lock.phase === 'transfer') {
    const table = String(input.table || '')
    if (!RECOVERY_TABLES.includes(table) || !Array.isArray(input.rows) || input.rows.length > 20 || !input.chunkId || String(input.chunkId).length > 200) throw new EditorialError('bloco de restauração inválido', 400)
    const columns = (await env.DB!.prepare(`PRAGMA table_info(${quote(table)})`).all()).results.map((row: any) => String(row.name))
    if (input.rows.some((row: any) => !row || typeof row !== 'object' || columns.some(column => !(column in row)) || Object.keys(row).some(column => !columns.includes(column)))) throw new EditorialError('colunas do backup incompatíveis', 400)
    const hash = await digest(JSON.stringify({ table, rows: input.rows }))
    const previous: any = await env.DB!.prepare('SELECT sha256 FROM core_recovery_chunks WHERE chunk_id = ?').bind(input.chunkId).first()
    if (previous) {
      if (previous.sha256 !== hash) throw new EditorialError('bloco de recuperação em conflito', 409)
      return json({ ok: true, repeated: true })
    }
    await restoreBatch(env, lock.token, 'transfer', [
      ...input.rows.map((row: any) => env.DB!.prepare(`INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`).bind(...columns.map(column => row[column]))),
      env.DB!.prepare('INSERT INTO core_recovery_chunks VALUES (?, ?)').bind(input.chunkId, hash)
    ])
    return json({ ok: true })
  }
  if (input.action === 'start-validation' && lock.phase === 'transfer') {
    if (lock.kind === 'restore') {
      const manifest = JSON.parse(lock.manifest_json)
      const counts = manifest.counts
      const objects: any = await env.DB!.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(stored), 0) AS stored FROM core_recovery_objects').first()
      if (objects.total !== manifest.objectCount || objects.stored !== manifest.objectCount) throw new EditorialError('objetos R2 incompletos', 409)
      const rows = await env.DB!.batch(RECOVERY_TABLES.map(table => env.DB!.prepare(`SELECT COUNT(*) AS total FROM ${quote(table)}`)))
      if (rows.some((row, index) => Number((row.results[0] as any).total) !== counts[RECOVERY_TABLES[index]])) throw new EditorialError('restauração incompleta', 409)
      if ((await env.DB!.prepare('PRAGMA foreign_key_check').all()).results.length || await env.DB!.prepare('SELECT pages.id FROM pages LEFT JOIN revisions ON revisions.id = pages.current_revision_id WHERE pages.current_revision_id IS NOT NULL AND (revisions.id IS NULL OR revisions.page_id != pages.id) LIMIT 1').first()) throw new EditorialError('referências editoriais inválidas', 409)
    }
    await env.DB!.prepare("UPDATE core_recovery_lock SET phase = 'validating' WHERE id = 1").run()
    return json({ ok: true })
  }
  if (input.action === 'validate' && lock.phase === 'validating') {
    if (lock.kind === 'backup') {
      const page = await env.WIKI_BUCKET!.list({ limit: 20, cursor: input.cursor || undefined })
      for (const object of page.objects) {
        const original: any = await env.DB!.prepare('SELECT etag, size_bytes FROM core_recovery_objects WHERE r2_key = ?').bind(object.key).first()
        if (!original || original.etag !== object.etag || original.size_bytes !== object.size) throw new EditorialError('o inventário R2 mudou durante o backup', 409)
      }
      const key = `validate:${String(input.cursor || '')}`
      await env.DB!.prepare('INSERT INTO core_recovery_chunks VALUES (?, ?) ON CONFLICT(chunk_id) DO NOTHING').bind(key, String(page.objects.length)).run()
      if (!page.truncated) {
        const total: any = await env.DB!.prepare("SELECT (SELECT COUNT(*) FROM core_recovery_objects) AS expected, (SELECT SUM(CAST(sha256 AS INTEGER)) FROM core_recovery_chunks WHERE chunk_id LIKE 'validate:%') AS verified").first()
        if (total.expected !== Number(total.verified || 0)) throw new EditorialError('inventário R2 incompleto', 409)
        await env.DB!.prepare("UPDATE core_recovery_lock SET phase = 'complete' WHERE id = 1").run()
      }
      return json({ next: page.truncated ? page.cursor : null })
    }
    const offset = Math.max(0, Math.floor(Number(input.offset) || 0))
    const rows: any = await env.DB!.prepare('SELECT r2_key, size_bytes, sha256 FROM uploads ORDER BY id LIMIT 20 OFFSET ?').bind(offset).all()
    for (const row of rows.results) {
      const record: any = await env.DB!.prepare('SELECT size_bytes, sha256 FROM core_recovery_objects WHERE r2_key = ?').bind(row.r2_key).first()
      const object = await env.WIKI_BUCKET!.head(row.r2_key)
      if (!record || !object || object.size !== row.size_bytes || record.size_bytes !== row.size_bytes || (row.sha256 && row.sha256 !== record.sha256)) throw new EditorialError('referência de mídia inválida', 409)
    }
    await env.DB!.prepare('INSERT INTO core_recovery_chunks VALUES (?, ?) ON CONFLICT(chunk_id) DO NOTHING').bind(`validate:${offset}`, String(rows.results.length)).run()
    if (rows.results.length < 20) {
      const total: any = await env.DB!.prepare("SELECT (SELECT COUNT(*) FROM uploads) AS expected, (SELECT SUM(CAST(sha256 AS INTEGER)) FROM core_recovery_chunks WHERE chunk_id LIKE 'validate:%') AS verified").first()
      if (total.expected !== Number(total.verified || 0)) throw new EditorialError('validação de mídia incompleta', 409)
      await env.DB!.prepare("UPDATE core_recovery_lock SET phase = 'complete' WHERE id = 1").run()
    }
    return json({ next: rows.results.length === 20 ? offset + 20 : null })
  }
  if (input.action === 'finish' && lock.phase === 'complete') {
    await clearLock(env)
    return json({ ok: true })
  }
  throw new EditorialError('ação incompatível com o estado da recuperação', 409)
}

export async function recoveryPut(request: Request, env: Env) {
  const email = await owner(request, env)
  const lock = await lockFor(request, env, email)
  if (lock.kind !== 'restore' || lock.phase !== 'transfer') throw new EditorialError('a operação não está restaurando objetos', 409)
  const key = objectKey(new URL(request.url).searchParams.get('key'))
  const size = Number(request.headers.get('content-length'))
  const hash = String(request.headers.get('x-wiki-sha256') || '')
  if (!Number.isSafeInteger(size) || size < 0 || !/^[a-f0-9]{64}$/.test(hash)) throw new EditorialError('metadados do objeto inválidos', 400)
  const encoded = request.headers.get('x-wiki-object-metadata')
  let metadata: any
  try { metadata = encoded ? JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), value => value.charCodeAt(0)))) : {} }
  catch { throw new EditorialError('metadados do objeto inválidos', 400) }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new EditorialError('metadados do objeto inválidos', 400)
  if (metadata.httpMetadata?.cacheExpiry) metadata.httpMetadata.cacheExpiry = new Date(metadata.httpMetadata.cacheExpiry)
  const existing: any = await env.DB!.prepare('SELECT sha256, size_bytes FROM core_recovery_objects WHERE r2_key = ?').bind(key).first()
  if (!existing && await env.WIKI_BUCKET!.head(key)) throw new EditorialError('objeto fora do escopo da restauração', 409)
  if (existing && (existing.sha256 !== hash || existing.size_bytes !== size)) throw new EditorialError('objeto de recuperação em conflito', 409)
  await env.DB!.prepare('INSERT INTO core_recovery_objects (r2_key, size_bytes, sha256, metadata_json) VALUES (?, ?, ?, ?) ON CONFLICT(r2_key) DO NOTHING').bind(key, size, hash, JSON.stringify(metadata)).run()
  const stored = await env.WIKI_BUCKET!.put(key, request.body, { sha256: hash, httpMetadata: metadata.httpMetadata || {}, customMetadata: metadata.customMetadata || {} })
  if (!stored || stored.size !== size) throw new EditorialError('tamanho do objeto diferente do manifesto', 409)
  await env.DB!.prepare('UPDATE core_recovery_objects SET stored = 1 WHERE r2_key = ?').bind(key).run()
  return json({ ok: true })
}
