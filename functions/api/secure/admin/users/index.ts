import { requireRole } from '../../../_lib/access'
import { deleteEditorUser, hasDb, listEditorUsers, updateEditorUser, type Env } from '../../../_lib/d1'
import { error, json } from '../../../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  const user = await requireRole(request, env, 'admin')
  if (!user) return error('gerenciamento de usuários restrito a administradores', 403)
  if (!hasDb(env)) return error('D1 ainda não foi ligado nesta versão', 501)
  return json({ ok: true, user, users: await listEditorUsers(env) })
}

export async function onRequestPost({ request, env }: Context) {
  const user = await requireRole(request, env, 'admin')
  if (!user) return error('gerenciamento de usuários restrito a administradores', 403)
  if (!hasDb(env)) return error('D1 ainda não foi ligado nesta versão', 501)
  const input = await request.json().catch(() => ({})) as { action?: string, email?: string, displayName?: string, role?: string, status?: string }
  try {
    if (String(input.action || '').trim() === 'delete') {
      const result = await deleteEditorUser(env, user.email, input.email || '')
      if (!result) return error('usuário não encontrado', 404)
      return json(result)
    }

    const profile = await updateEditorUser(env, user.email, input)
    if (!profile) return error('usuário não encontrado', 404)
    return json({ ok: true, profile })
  } catch (exception) {
    const message = exception instanceof Error ? exception.message : 'erro interno'
    return error(message, 400)
  }
}
