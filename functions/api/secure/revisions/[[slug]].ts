import { requireAccessUser } from '../../_lib/access'
import { globalSettingEnabled, hasDb, normalizeSlug, restorePageRevision, type Env } from '../../_lib/d1'
import { error, json } from '../../_lib/response'

type Context = EventContext<Env, string, { slug?: string[] }>

export async function onRequestPost({ request, env, params }: Context) {
  const slug = normalizeSlug(params.slug)
  if (!slug) return error('Missing slug', 400)
  if (!(await globalSettingEnabled(env, 'pageHistory'))) return error('History disabled', 403)

  const user = await requireAccessUser(request, env)
  if (!user) return error('Editing blocked by the access policy', 401)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)

  const input: any = await request.json().catch(() => null)
  if (!input || !Object.hasOwn(input, 'expectedRevisionId')) return error('Base revision required', 428)
  if (input.expectedRevisionId !== null && typeof input.expectedRevisionId !== 'string') return error('Invalid base revision', 400)
  const action = String(input?.action || '')
  const revisionNumber = Number(input?.revisionNumber || 0)
  const summary = String(input?.summary || '').trim()

  if (action !== 'restore' || !revisionNumber) {
    return error('Invalid payload', 400)
  }

  const page = await restorePageRevision(env, slug, revisionNumber, user.email, user.name, summary, input.expectedRevisionId)
  if (!page) return error('Revision not found', 404)

  return json({ ok: true, page })
}

export async function onRequestOptions({ request, env }: Context) {
  const user = await requireAccessUser(request, env)
  return json({ ok: true, authenticated: Boolean(user) })
}
