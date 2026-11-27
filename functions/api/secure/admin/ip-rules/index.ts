import { requireRole } from '../../../_lib/access'
import { createIpRule, hasDb, listIpRules, type Env } from '../../../_lib/d1'
import { error, json } from '../../../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  const user = await requireRole(request, env, 'moderator')
  if (!user) return error('Administration blocked by the access policy', 401)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)

  const rules = await listIpRules(env)
  return json({ rules })
}

export async function onRequestPost({ request, env }: Context) {
  const user = await requireRole(request, env, 'moderator')
  if (!user) return error('Administration blocked by the access policy', 401)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)

  const input: any = await request.json().catch(() => null)
  if (!input) return error('Invalid payload', 400)

  try {
    const rule = await createIpRule(env, input, user.email)
    return json(rule)
  } catch (exception) {
    const message = exception instanceof Error ? exception.message : 'Internal error'
    return error(message, 400)
  }
}
