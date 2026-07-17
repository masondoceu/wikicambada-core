import { requireRole } from '../../_lib/access'
import { exportBackup, hasDb, importSeed, type Env } from '../../_lib/d1'
import { error, json } from '../../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  const user = await requireRole(request, env, 'admin')
  if (!user) return error('administração bloqueada pela política de acesso', 401)
  if (!hasDb(env)) return error('D1 ainda não foi ligado neste alpha', 501)

  const backup = await exportBackup(env)
  const filename = `wikicambada-backup-${new Date().toISOString().slice(0, 10)}.json`
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`
    }
  })
}

export async function onRequestPost({ request, env }: Context) {
  const user = await requireRole(request, env, 'admin')
  if (!user) return error('administração bloqueada pela política de acesso', 401)
  if (!hasDb(env)) return error('D1 ainda não foi ligado neste alpha', 501)

  const payload = await request.json().catch(() => null)
  if (!payload) return error('json inválido', 400)

  try {
    const result = await importSeed(env, payload, user.email)
    return json(result)
  } catch (exception) {
    const message = exception instanceof Error ? exception.message : 'erro interno'
    return error(message, 500)
  }
}
