import { requireAccessUser } from '../../_lib/access'
import { globalSettingEnabled, hasDb, normalizeSlug, restorePageRevision, type Env } from '../../_lib/d1'
import { error, json } from '../../_lib/response'

type Context = EventContext<Env, string, { slug?: string[] }>

export async function onRequestPost({ request, env, params }: Context) {
  const slug = normalizeSlug(params.slug)
  if (!slug) return error('slug ausente', 400)
  if (!(await globalSettingEnabled(env, 'pageHistory'))) return error('histórico desativado', 403)

  const user = await requireAccessUser(request, env)
  if (!user) return error('edição bloqueada pela política de acesso', 401)
  if (!hasDb(env)) return error('D1 ainda não foi ligado nesta instalação', 501)

  const input: any = await request.json().catch(() => null)
  if (!input || !Object.hasOwn(input, 'expectedRevisionId')) return error('revisão-base obrigatória', 428)
  if (input.expectedRevisionId !== null && typeof input.expectedRevisionId !== 'string') return error('revisão-base inválida', 400)
  const action = String(input?.action || '')
  const revisionNumber = Number(input?.revisionNumber || 0)
  const summary = String(input?.summary || '').trim()

  if (action !== 'restore' || !revisionNumber) {
    return error('payload inválido', 400)
  }

  const page = await restorePageRevision(env, slug, revisionNumber, user.email, user.name, summary, input.expectedRevisionId)
  if (!page) return error('revisão não encontrada', 404)

  return json({ ok: true, page })
}

export async function onRequestOptions({ request, env }: Context) {
  const user = await requireAccessUser(request, env)
  return json({ ok: true, authenticated: Boolean(user) })
}
