import { EditorialError, createEditProposal, getActiveIpRule, globalSettingEnabled, hasDb, normalizeSlug, type Env } from '../_lib/d1'
import { notifyDiscordProposal } from '../_lib/discord'
import { error, json } from '../_lib/response'

type Context = EventContext<Env, string, { slug?: string[] }>

function managedNamespace(slug: string) {
  const value = String(slug || '').toLowerCase()
  return value === 'especial' || value === 'special' || value.startsWith('especial/') || value.startsWith('special/') || value.startsWith('arquivo/')
}

export async function onRequestPost({ request, env, params }: Context) {
  const slug = normalizeSlug(params.slug)
  if (!slug) return error('Missing slug', 400)
  if (managedNamespace(slug)) return error('This system namespace does not accept suggestions', 403)
  if (slug.startsWith('discussao/') && !(await globalSettingEnabled(env, 'talkPages'))) return error('Discussion pages are disabled', 403)
  if (slug.startsWith('usuario/') && !(await globalSettingEnabled(env, 'userPages'))) return error('User pages are disabled', 403)
  if (!(await globalSettingEnabled(env, 'publicSuggestions'))) return error('Public suggestions are disabled', 403)

  const ipRule = await getActiveIpRule(env, request, 'block_suggestions')
  if (ipRule) {
    return error('This IP address cannot submit suggestions at this time', 403)
  }

  const input: any = await request.json().catch(() => null)
  if (!input || typeof input.title !== 'string' || typeof input.content !== 'string') {
    return error('Invalid payload', 400)
  }

  try {
    if (!(await globalSettingEnabled(env, 'categories'))) input.categories = []
    const proposal = await createEditProposal(env, slug, input, request)
    const discord = await notifyDiscordProposal(env, request, proposal).catch(error => ({ sent: false, reason: String(error?.message || error) }))

    return json({
      ok: true,
      proposal: { id: proposal.id, status: proposal.status },
      stored: hasDb(env),
      discord: { sent: discord.sent }
    })
  } catch (exception) {
    const message = exception instanceof Error ? exception.message : 'Internal error'
    const status = exception instanceof EditorialError ? exception.status : message.startsWith('Edit rejected:') ? 400 : 500
    return error(status < 500 ? `Could not submit the proposal: ${message}` : 'Could not submit the proposal', status)
  }
}
