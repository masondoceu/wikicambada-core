import { requireRole } from '../../../../_lib/access'
import { deleteUpload, hasDb, normalizeSlug, updateUploadMetadata, type Env } from '../../../../_lib/d1'
import { error, json } from '../../../../_lib/response'

type Context = EventContext<Env, string, { slug?: string[] | string }>

export async function onRequestPost({ request, env, params }: Context) {
  const user = await requireRole(request, env, 'moderator')
  if (!user) return error('administração bloqueada pela política de acesso', 401)
  if (!hasDb(env)) return error('D1 ainda não foi ligado neste alpha', 501)

  const slug = normalizeSlug(params.slug)
  if (!slug) return error('arquivo ausente', 400)

  const input = await request.json().catch(() => null)
  const action = String(input?.action || '').trim()

  if (action === 'update') {
    const file = await updateUploadMetadata(env, slug, {
      filename: input?.filename,
      description: input?.description
    })
    if (!file) return error('arquivo não encontrado', 404)
    return json({ ok: true, file })
  }

  return error('ação inválida', 400)
}

export async function onRequestDelete({ request, env, params }: Context) {
  const user = await requireRole(request, env, 'moderator')
  if (!user) return error('administração bloqueada pela política de acesso', 401)
  if (!hasDb(env)) return error('D1 ainda não foi ligado neste alpha', 501)

  const slug = normalizeSlug(params.slug)
  if (!slug) return error('arquivo ausente', 400)

  const result = await deleteUpload(env, slug, user.email)
  if (!result) return error('arquivo não encontrado', 404)
  return json(result)
}
