import { requireRole } from '../../../_lib/access'
import { deleteContentTemplate, hasDb, listContentTemplates, saveContentTemplate, type Env } from '../../../_lib/d1'
import { error, failure, json } from '../../../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  const user = await requireRole(request, env, 'editor')
  if (!user) return error('The template editor is restricted to editors', 403)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)

  try {
    return json({ ok: true, templates: await listContentTemplates(env, { includeDisabled: true, role: 'super_admin' }) })
  } catch (exception) {
    return failure(exception)
  }
}

export async function onRequestPost({ request, env }: Context) {
  const user = await requireRole(request, env, 'editor')
  if (!user) return error('The template editor is restricted to editors', 403)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)

  const input = await request.json().catch(() => ({})) as any
  const action = String(input?.action || 'save').trim()

  try {
    if (action === 'delete') {
      const id = String(input?.id || '').trim()
      if (!id) return error('Missing template ID', 400)
      const result = await deleteContentTemplate(env, id)
      if (!result?.ok) return error('Template not found', 404)
      return json(result)
    }

    const template = await saveContentTemplate(env, input, user.email)
    if (!template) return error('Template not found', 404)
    return json({ ok: true, template })
  } catch (exception) {
    const message = exception instanceof Error ? exception.message : 'Internal error'
    return error(message, 400)
  }
}
