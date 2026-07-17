import { requireRole } from '../../_lib/access'
import { hasDb, maintenanceReport, type Env } from '../../_lib/d1'
import { error, json } from '../../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  const user = await requireRole(request, env, 'moderator')
  if (!user) return error('administração bloqueada pela política de acesso', 401)
  if (!hasDb(env)) return error('D1 ainda não foi ligado neste alpha', 501)

  return json(await maintenanceReport(env))
}
