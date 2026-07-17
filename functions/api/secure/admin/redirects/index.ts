import { requireRole } from '../../../_lib/access'
import {
  deleteAdvancedAlias,
  deleteAdvancedRedirect,
  hasDb,
  listAdvancedRedirects,
  saveAdvancedAlias,
  saveAdvancedRedirect,
  type Env
} from '../../../_lib/d1'
import { error, json } from '../../../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  const user = await requireRole(request, env, 'editor')
  if (!user) return error('gerenciamento de redirecionamentos bloqueado pela política de acesso', 401)
  if (!hasDb(env)) return error('D1 ainda não foi ligado', 501)

  return json(await listAdvancedRedirects(env))
}

export async function onRequestPost({ request, env }: Context) {
  const user = await requireRole(request, env, 'editor')
  if (!user) return error('gerenciamento de redirecionamentos bloqueado pela política de acesso', 401)
  if (!hasDb(env)) return error('D1 ainda não foi ligado', 501)

  const input = await request.json().catch(() => null) as any
  const action = String(input?.action || '').trim()

  try {
    if (action === 'save_redirect') {
      return json(await saveAdvancedRedirect(env, {
        fromSlug: input?.fromSlug,
        toSlug: input?.toSlug,
        fragment: input?.fragment
      }, user.email))
    }

    if (action === 'delete_redirect') {
      return json(await deleteAdvancedRedirect(env, input?.fromSlug))
    }

    if (action === 'save_alias') {
      return json(await saveAdvancedAlias(env, {
        aliasTitle: input?.aliasTitle,
        toSlug: input?.toSlug
      }))
    }

    if (action === 'delete_alias') {
      return json(await deleteAdvancedAlias(env, input?.aliasSlug))
    }

    return error('ação inválida', 400)
  } catch (exception) {
    const message = exception instanceof Error ? exception.message : 'erro interno'
    return error(message, 400)
  }
}
