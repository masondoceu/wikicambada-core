import { requireRole } from '../../../../_lib/access'
import { deleteUpload, hasDb, normalizeSlug, updateUploadMetadata, type Env } from '../../../../_lib/d1'
import { error, json } from '../../../../_lib/response'

type Context = EventContext<Env, string, { slug?: string[] | string }>

export async function onRequestPost({ request, env, params }: Context) {
  const user = await requireRole(request, env, 'moderator')
  if (!user) return error('Administration blocked by the access policy', 401)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)

  const slug = normalizeSlug(params.slug)
  if (!slug) return error('Missing file', 400)

  const input: any = await request.json().catch(() => null)
  const action = String(input?.action || '').trim()

  if (action === 'update') {
    const file = await updateUploadMetadata(env, slug, {
      filename: input?.filename,
      description: input?.description
    })
    if (!file) return error('File not found', 404)
    return json({ ok: true, file })
  }

  return error('Invalid action', 400)
}

export async function onRequestDelete({ request, env, params }: Context) {
  const user = await requireRole(request, env, 'moderator')
  if (!user) return error('Administration blocked by the access policy', 401)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)

  const slug = normalizeSlug(params.slug)
  if (!slug) return error('Missing file', 400)

  const result = await deleteUpload(env, slug, user.email)
  if (!result) return error('File not found', 404)
  return json(result)
}
