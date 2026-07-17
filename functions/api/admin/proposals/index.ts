import { requireAccessUser } from '../../_lib/access'
import { hasDb, listEditProposals, type Env } from '../../_lib/d1'
import { error, json } from '../../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  const user = await requireAccessUser(request, env)
  if (!user) return error('painel restrito a editores autorizados', 401)
  if (!hasDb(env)) return error('D1 ainda não foi ligado neste alpha', 501)

  const url = new URL(request.url)
  const status = url.searchParams.get('status') || 'pending'
  const proposals = await listEditProposals(env, status)
  return json({ ok: true, user, proposals })
}
