import { requireRole } from '../../../_lib/access'
import { deletePage, hasDb, normalizeSlug, renamePage, setPageLock, type Env } from '../../../_lib/d1'
import { error, json } from '../../../_lib/response'

type Context = EventContext<Env, string, { slug?: string[] | string }>

export async function onRequestPost({ request, env, params }: Context) {
  const slug = normalizeSlug(params.slug)
  if (!slug) return error('slug ausente', 400)

  const user = await requireRole(request, env, 'admin')
  if (!user) return error('administração bloqueada pela política de acesso', 401)
  if (!hasDb(env)) return error('D1 ainda não foi ligado neste alpha', 501)

  const input = await request.json().catch(() => null)
  const action = String(input?.action || '').trim()

  try {
    if (action === 'lock') {
      const result = await setPageLock(env, slug, true, user.email)
      if (!result) return error('página não encontrada', 404)
      return json(result)
    }

    if (action === 'unlock') {
      const result = await setPageLock(env, slug, false, user.email)
      if (!result) return error('página não encontrada', 404)
      return json(result)
    }

    if (action === 'rename') {
      const result = await renamePage(env, slug, {
        title: input?.title,
        slug: input?.slug,
        summary: input?.summary
      }, user.email)
      if (!result) return error('página não encontrada', 404)
      return json({ ok: true, page: result })
    }

    if (action === 'delete') {
      const result = await deletePage(env, slug, user.email)
      if (!result) return error('página não encontrada', 404)
      return json(result)
    }

    return error('ação inválida', 400)
  } catch (exception) {
    const message = exception instanceof Error ? exception.message : 'erro interno'
    return error(message, 500)
  }
}

export async function onRequestDelete({ request, env, params }: Context) {
  const slug = normalizeSlug(params.slug)
  if (!slug) return error('slug ausente', 400)

  const user = await requireRole(request, env, 'admin')
  if (!user) return error('administração bloqueada pela política de acesso', 401)
  if (!hasDb(env)) return error('D1 ainda não foi ligado neste alpha', 501)

  const result = await deletePage(env, slug, user.email)
  if (!result) return error('página não encontrada', 404)
  return json(result)
}
