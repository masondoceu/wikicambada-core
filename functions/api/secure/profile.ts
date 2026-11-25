import { requireAccessUser } from '../_lib/access'
import { hasDb, updateOwnEditorProfile, type Env } from '../_lib/d1'
import { error, json } from '../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestPost({ request, env }: Context) {
  const user = await requireAccessUser(request, env)
  if (!user) return error('perfil restrito a usuários autenticados', 401)
  if (!hasDb(env)) return error('D1 ainda não foi ligado nesta instalação', 501)
  const input = await request.json().catch(() => ({})) as { displayName?: string }
  const profile = await updateOwnEditorProfile(env, user.email, input)
  return json({ ok: true, profile })
}
