import { json } from './_lib/response'

type Env = {
  DB?: D1Database
  WIKI_BUCKET?: R2Bucket
  WIKI_SITE_NAME?: string
  WIKI_CORE_VERSION?: string
}

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ env }: Context) {
  let databaseReachable = false
  let schemaReady = false
  let databaseSchema: number | null = null
  let uploadsReachable = false
  try {
    if (env.DB) {
      await env.DB.prepare('SELECT 1 AS ok').first()
      databaseReachable = true
      const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('core_write_guards', 'proposal_rate_limits', 'r2_cleanup', 'global_settings', 'core_recovery_lock', 'core_recovery_objects', 'core_recovery_chunks')").all()
      const triggers = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'recovery_%'").all()
      schemaReady = tables.results.length === 7 && triggers.results.length === 54
      if (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'd1_migrations'").first()) {
        const applied = (await env.DB.prepare('SELECT name FROM d1_migrations').all()).results.map((row: any) => Number(String(row.name).match(/^(\d+)_/)?.[1]))
        databaseSchema = 0
        while (applied.includes(databaseSchema + 1)) databaseSchema++
      }
    }
    if (env.WIKI_BUCKET) {
      await env.WIKI_BUCKET.list({ limit: 1 })
      uploadsReachable = true
    }
  } catch {}
  const ok = databaseReachable && schemaReady && uploadsReachable
  return json({
    ok,
    app: env.WIKI_SITE_NAME || 'WikiCambada Core',
    core: 'WikiCambada Core',
    version: env.WIKI_CORE_VERSION || 'v1.1.1',
    database: Boolean(env.DB),
    uploads: Boolean(env.WIKI_BUCKET),
    databaseReachable,
    schemaReady,
    databaseSchema,
    requiredDatabaseSchema: 17,
    uploadsReachable
  }, { status: ok ? 200 : 503 })
}
