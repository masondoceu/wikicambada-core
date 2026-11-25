import { requireRole } from '../../../_lib/access'
import { deleteContentTemplate, hasDb, listContentTemplates, saveContentTemplate, type Env } from '../../../_lib/d1'
import { error, failure, json } from '../../../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  const user = await requireRole(request, env, 'editor')
  if (!user) return error('criador de templates restrito a editores', 403)
  if (!hasDb(env)) return error('D1 ainda não foi ligado nesta instalação', 501)

  try {
    return json({ ok: true, templates: await listContentTemplates(env, { includeDisabled: true, role: 'super_admin' }) })
  } catch (exception) {
    return failure(exception)
  }
}

export async function onRequestPost({ request, env }: Context) {
  const user = await requireRole(request, env, 'editor')
  if (!user) return error('criador de templates restrito a editores', 403)
  if (!hasDb(env)) return error('D1 ainda não foi ligado nesta instalação', 501)

  const input = await request.json().catch(() => ({})) as any
  const action = String(input?.action || 'save').trim()

  try {
    if (action === 'delete') {
      const id = String(input?.id || '').trim()
      if (!id) return error('id do template ausente', 400)
      const result = await deleteContentTemplate(env, id)
      if (!result?.ok) return error('template não encontrado', 404)
      return json(result)
    }

    const template = await saveContentTemplate(env, input, user.email)
    if (!template) return error('template não encontrado', 404)
    return json({ ok: true, template })
  } catch (exception) {
    const message = exception instanceof Error ? exception.message : 'erro interno'
    return error(message, 400)
  }
}
