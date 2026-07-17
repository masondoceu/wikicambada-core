import { requireAccessUser } from './access'
import { globalSettingEnabled, hasDb, normalizeSlug, writePage, type Env } from './d1'
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
  if (!slug) return error('slug ausente', 400)
  if (managedNamespace(slug)) return error('este namespace é gerenciado pelo sistema e não aceita revisões', 403)
  if (slug.startsWith('discussao/') && !(await globalSettingEnabled(env, 'talkPages'))) return error('páginas de discussão foram desativadas', 403)
  if (slug.startsWith('usuario/') && !(await globalSettingEnabled(env, 'userPages'))) return error('páginas de usuário foram desativadas', 403)

  const user = await requireAccessUser(request, env)
  if (!user) return error('edição bloqueada pela política de acesso', 401)
  if (!hasDb(env)) return error('D1 ainda não foi ligado nesta instalação', 501)

  const input = await request.json().catch(() => null)
  const payload = validateRevisionPayload(input)
  if (!payload) return error('dados de edição incompletos ou inválidos', 400)
  if (!(await globalSettingEnabled(env, 'categories'))) payload.categories = []

  try {
    const page = await writePage(env, slug, payload, user.email, user.name)
    return json({ ok: true, page })
  } catch (exception) {
    const message = exception instanceof Error ? exception.message : 'erro interno'
    const status = message.startsWith('edição recusada:') ? 400 : 500
    return error(`não foi possível salvar a revisão: ${message}`, status)
  }
}

export async function revisionOptions({ request, env }: RevisionContext) {
  const user = await requireAccessUser(request, env)
  return json({ ok: true, authenticated: Boolean(user) })
}
