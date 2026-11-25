import { requireRole } from '../../../_lib/access'
import { hasDb, listStorageOverview, type Env } from '../../../_lib/d1'
import { error, json } from '../../../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  const user = await requireRole(request, env, 'moderator')
  if (!user) return error('administração bloqueada pela política de acesso', 401)
  if (!hasDb(env)) return error('D1 ainda não foi ligado nesta instalação', 501)

  const url = new URL(request.url)
  const search = url.searchParams.get('q') || ''
  const limit = Number(url.searchParams.get('limit') || 120)
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0)
  const cursor = url.searchParams.get('cursor') || undefined
  const data = await listStorageOverview(env, { search, limit, offset, cursor })
  return json(data)
}
