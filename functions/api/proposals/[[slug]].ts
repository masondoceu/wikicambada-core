import { createEditProposal, getActiveIpRule, globalSettingEnabled, hasDb, normalizeSlug, type Env } from '../_lib/d1'
import { notifyDiscordProposal } from '../_lib/discord'
import { error, json } from '../_lib/response'

type Context = EventContext<Env, string, { slug?: string[] }>

function managedNamespace(slug: string) {
  const value = String(slug || '').toLowerCase()
  return value === 'especial' || value === 'special' || value.startsWith('especial/') || value.startsWith('special/') || value.startsWith('arquivo/')
}

export async function onRequestPost({ request, env, params }: Context) {
  const slug = normalizeSlug(params.slug)
  if (!slug) return error('slug ausente', 400)
  if (managedNamespace(slug)) return error('este namespace é gerenciado pelo sistema e não aceita sugestões', 403)
  if (slug.startsWith('discussao/') && !(await globalSettingEnabled(env, 'talkPages'))) return error('páginas de discussão foram desativadas', 403)
  if (slug.startsWith('usuario/') && !(await globalSettingEnabled(env, 'userPages'))) return error('páginas de usuário foram desativadas', 403)
  if (!(await globalSettingEnabled(env, 'publicSuggestions'))) return error('sugestões públicas foram desativadas', 403)

  const ipRule = await getActiveIpRule(env, request, 'block_suggestions')
  if (ipRule) {
    return error('este endereço IP não pode enviar sugestões no momento', 403)
  }

  const input = await request.json().catch(() => null)
  if (!input || typeof input.title !== 'string' || typeof input.content !== 'string') {
    return error('payload inválido', 400)
  }

  try {
    if (!(await globalSettingEnabled(env, 'categories'))) input.categories = []
    const proposal = await createEditProposal(env, slug, input, request)
    const discord = await notifyDiscordProposal(env, request, proposal).catch(error => ({ sent: false, reason: String(error?.message || error) }))

    return json({
      ok: true,
      proposal,
      stored: hasDb(env),
      discord
    })
  } catch (exception) {
    const message = exception instanceof Error ? exception.message : 'erro interno'
    const status = message.startsWith('edição recusada:') ? 400 : 500
    return error(`não foi possível enviar a proposta: ${message}`, status)
  }
}
