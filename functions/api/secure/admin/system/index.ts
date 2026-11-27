import { requireRole } from '../../../_lib/access'
import { forceSystemRefresh, getSystemStatus, hasDb, type Env } from '../../../_lib/d1'
import { error, json } from '../../../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  const user = await requireRole(request, env, 'moderator')
  if (!user) return error('System status is restricted to moderators', 403)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)
  return json({ ok: true, status: await getSystemStatus(env) })
}

export async function onRequestPost({ request, env }: Context) {
  const user = await requireRole(request, env, 'admin')
  if (!user) return error('This action is restricted to administrators', 403)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)
  const input = await request.json().catch(() => ({})) as { action?: string }
  const action = String(input.action || '')
  if (action === 'force-cache') return json({ ok: true, result: await forceSystemRefresh(env, 'cache', user.email) })
  if (action === 'force-reload') return json({ ok: true, result: await forceSystemRefresh(env, 'reload', user.email) })
  return error('Invalid action', 400)
}
