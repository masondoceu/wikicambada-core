import { requireRole } from '../../../_lib/access'
import { hardDeletePage, hardDeleteUpload, hasDb, listTrash, purgeExpiredTrash, restoreDeletedPage, restoreDeletedUpload, type Env } from '../../../_lib/d1'
import { error, json } from '../../../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  const user = await requireRole(request, env, 'moderator')
  if (!user) return error('The trash is restricted to moderators', 403)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)
  await purgeExpiredTrash(env).catch(() => null)
  return json({ ok: true, trash: await listTrash(env) })
}

export async function onRequestPost({ request, env }: Context) {
  const user = await requireRole(request, env, 'moderator')
  if (!user) return error('The trash is restricted to moderators', 403)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)
  const input = await request.json().catch(() => ({})) as { action?: string, kind?: string, slug?: string }
  const action = String(input.action || '')
  const kind = String(input.kind || '')
  const slug = String(input.slug || '').trim()

  if (action === 'purge-expired') return json({ ok: true, purged: await purgeExpiredTrash(env) })
  if (!slug) return error('Missing slug', 400)

  if (action === 'restore' && kind === 'page') return json({ ok: true, page: await restoreDeletedPage(env, slug, user.email) })
  if (action === 'restore' && kind === 'file') return json({ ok: true, file: await restoreDeletedUpload(env, slug) })

  if (action === 'hard-delete' && !['admin', 'super_admin'].includes(user.role || '')) return error('Permanent deletion is restricted to administrators', 403)
  if (action === 'hard-delete' && kind === 'page') return json({ ok: true, result: await hardDeletePage(env, slug) })
  if (action === 'hard-delete' && kind === 'file') return json({ ok: true, result: await hardDeleteUpload(env, slug) })

  return error('Invalid action', 400)
}
