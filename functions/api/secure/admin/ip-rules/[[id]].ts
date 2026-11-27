import { requireRole } from '../../../_lib/access'
import { hasDb, normalizeSlug, removeIpRule, type Env } from '../../../_lib/d1'
import { error, json } from '../../../_lib/response'

type Context = EventContext<Env, string, { id?: string[] | string }>

function cleanId(value: string[] | string | undefined) {
  return Array.isArray(value) ? value.join('/') : String(value || '').trim()
}

export async function onRequestDelete({ request, env, params }: Context) {
  const user = await requireRole(request, env, 'moderator')
  if (!user) return error('Administration blocked by the access policy', 401)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)

  const id = cleanId(params.id)
  if (!id) return error('Missing rule', 400)

  const result = await removeIpRule(env, id)
  if (!result?.ok) return error('Rule not found', 404)
  return json(result)
}
