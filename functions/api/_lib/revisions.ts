import { requireAccessUser } from './access'
import { EditorialError, globalSettingEnabled, hasDb, normalizeSlug, writePage, type Env } from './d1'
import { error, json } from './response'

type RevisionContext = EventContext<Env, string, { slug?: string[] | string }>

function managedNamespace(slug: string) {
  const value = String(slug || '').toLowerCase()
  return value === 'especial' || value === 'special' || value.startsWith('especial/') || value.startsWith('special/') || value.startsWith('arquivo/')
}

function validateRevisionPayload(input: any) {
  if (!input || typeof input.title !== 'string' || typeof input.content !== 'string') {
    return null
  }

  const title = input.title.trim()
  const content = String(input.content)
  const summary = typeof input.summary === 'string' ? input.summary.trim() : ''

  if (!title || !content.trim() || !summary) return null

  return {
    expectedRevisionId: input.expectedRevisionId as string | null,
    ...(typeof input.sourceSlug === 'string' ? { sourceSlug: input.sourceSlug } : {}),
    title,
    subtitle: typeof input.subtitle === 'string' ? input.subtitle.trim() : '',
    content,
    categories: Array.isArray(input.categories) ? input.categories.map(item => String(item).trim()).filter(Boolean) : [],
    aliases: Array.isArray(input.aliases) ? input.aliases.map(item => String(item).trim()).filter(Boolean) : [],
    redirects: Array.isArray(input.redirects) ? input.redirects.map(item => String(item).trim()).filter(Boolean) : [],
    ...(Array.isArray(input.redirectRules) ? {
      redirectRules: input.redirectRules
        .map(item => ({
          fromSlug: String(item?.fromSlug || '').trim(),
          fragment: String(item?.fragment || '').trim().replace(/^#/, '')
        }))
        .filter(item => item.fromSlug)
    } : {}),
    summary
  }
}

export async function createRevision({ request, env, params }: RevisionContext) {
  const slug = normalizeSlug(params.slug)
  if (!slug) return error('Missing slug', 400)
  if (managedNamespace(slug)) return error('This system namespace does not accept revisions', 403)
  if (slug.startsWith('discussao/') && !(await globalSettingEnabled(env, 'talkPages'))) return error('Discussion pages are disabled', 403)
  if (slug.startsWith('usuario/') && !(await globalSettingEnabled(env, 'userPages'))) return error('User pages are disabled', 403)

  const user = await requireAccessUser(request, env)
  if (!user) return error('Editing blocked by the access policy', 401)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)

  const input: any = await request.json().catch(() => null)
  if (!input || !Object.hasOwn(input, 'expectedRevisionId')) return error('Base revision required', 428)
  if (input.expectedRevisionId !== null && typeof input.expectedRevisionId !== 'string') return error('Invalid base revision', 400)
  const payload = validateRevisionPayload(input)
  if (!payload) return error('Incomplete or invalid edit data', 400)
  if (!(await globalSettingEnabled(env, 'categories'))) payload.categories = []

  try {
    const page = await writePage(env, slug, payload, user.email, user.name)
    return json({ ok: true, page })
  } catch (exception) {
    const message = exception instanceof Error ? exception.message : 'Internal error'
    const status = exception instanceof EditorialError ? exception.status : message.startsWith('Edit rejected:') ? 400 : 500
    return error(status < 500 ? message : 'Could not save the revision', status)
  }
}

export async function revisionOptions({ request, env }: RevisionContext) {
  const user = await requireAccessUser(request, env)
  return json({ ok: true, authenticated: Boolean(user) })
}
