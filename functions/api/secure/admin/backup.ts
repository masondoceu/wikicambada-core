import { requireRole } from '../../_lib/access'
import { exportBackup, hasDb, importSeed, type Env } from '../../_lib/d1'
import { diagnosticText, error, failure, json } from '../../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  const user = await requireRole(request, env, 'admin')
  if (!user) return error('Administration blocked by the access policy', 401)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)

  const backup = await exportBackup(env)
  const filename = `wikicambada-content-export-${new Date().toISOString().slice(0, 10)}.json`
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`
    }
  })
}

export async function onRequestPost({ request, env }: Context) {
  const user = await requireRole(request, env, 'admin')
  if (!user) return error('Administration blocked by the access policy', 401)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)

  const payload = await request.json().catch(() => null)
  if (!payload) return error('Invalid JSON', 400)

  try {
    const result = await importSeed(env, payload, user.email)
    const language = request.headers.get('x-wiki-language') || undefined
    return json(result && { ...result, failed: result.failed.map(item => ({ ...item, error: diagnosticText(item.error, language) })) })
  } catch (exception) {
    return failure(exception)
  }
}
