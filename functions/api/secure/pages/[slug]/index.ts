import { requireRole } from '../../../_lib/access'
import { deletePage, hasDb, normalizeSlug, type Env } from '../../../_lib/d1'
import { error, json } from '../../../_lib/response'

type Context = EventContext<Env, string, { slug?: string[] | string }>

export async function onRequestDelete({ request, env, params }: Context) {
  const slug = normalizeSlug(params.slug)
  if (!slug) return error('slug ausente', 400)

  const user = await requireRole(request, env, 'moderator')
  if (!user) return error('exclusão restrita a moderadores', 403)
  if (!hasDb(env)) return error('D1 ainda não foi ligado nesta instalação', 501)

  try {
    const result = await deletePage(env, slug, user.email)
    if (!result) return error('página não encontrada', 404)
    return json(result)
  } catch (exception) {
    const message = exception instanceof Error ? exception.message : 'erro interno'
    return error(`não foi possível deletar a página: ${message}`, 500)
  }
}

export async function onRequestOptions({ request, env }: Context) {
  const user = await requireRole(request, env, 'moderator')
  return json({ ok: true, authenticated: Boolean(user) })
}
