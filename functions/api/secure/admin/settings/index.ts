import { requireRole } from '../../../_lib/access'
import { getGlobalSettings, hasDb, saveGlobalSettings, type Env } from '../../../_lib/d1'
import { error, json } from '../../../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  const user = await requireRole(request, env, 'admin')
  if (!user) return error('configurações globais restritas a administradores', 403)
  if (!hasDb(env)) return error('D1 ainda não foi ligado', 501)
  return json({ ok: true, settings: await getGlobalSettings(env) })
}

export async function onRequestPost({ request, env }: Context) {
  const user = await requireRole(request, env, 'admin')
  if (!user) return error('configurações globais restritas a administradores', 403)
  if (!hasDb(env)) return error('D1 ainda não foi ligado', 501)
  const input: any = await request.json().catch(() => null) as any
  if (!input?.settings || typeof input.settings !== 'object') return error('configurações inválidas', 400)
  try {
    return json({ ok: true, ...(await saveGlobalSettings(env, input.settings, user.email || '')) })
  } catch (exception) {
    return error(exception instanceof Error ? exception.message : 'erro interno', 400)
  }
}
