import { requireRole } from '../../../_lib/access'
import { hasDb, listAdminPages, type Env } from '../../../_lib/d1'
import { error, json } from '../../../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  const user = await requireRole(request, env, 'moderator')
  if (!user) return error('administração bloqueada pela política de acesso', 401)
  if (!hasDb(env)) return error('D1 ainda não foi ligado neste alpha', 501)

  const url = new URL(request.url)
  const sort = url.searchParams.get('sort') === 'recent' ? 'recent' : 'title'
  const pages = await listAdminPages(env, { sort, includeDeleted: true, limit: 1000 })
  return json({ pages })
}
