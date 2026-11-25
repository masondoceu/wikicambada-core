import { requireRole } from '../../../_lib/access'
import { hasDb, normalizeSlug, removeIpRule, type Env } from '../../../_lib/d1'
import { error, json } from '../../../_lib/response'

type Context = EventContext<Env, string, { id?: string[] | string }>

function cleanId(value: string[] | string | undefined) {
  return Array.isArray(value) ? value.join('/') : String(value || '').trim()
}

export async function onRequestDelete({ request, env, params }: Context) {
  const user = await requireRole(request, env, 'moderator')
  if (!user) return error('administração bloqueada pela política de acesso', 401)
  if (!hasDb(env)) return error('D1 ainda não foi ligado nesta instalação', 501)

  const id = cleanId(params.id)
  if (!id) return error('regra ausente', 400)

  const result = await removeIpRule(env, id)
  if (!result?.ok) return error('regra não encontrada', 404)
  return json(result)
}
