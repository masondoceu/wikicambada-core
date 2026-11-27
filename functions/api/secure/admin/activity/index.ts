import { requireRole } from '../../../_lib/access'
import { clearRecentActivity, hasDb, listRecentActivity, type Env } from '../../../_lib/d1'
import { error, json } from '../../../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  const user = await requireRole(request, env, 'moderator')
  if (!user) return error('Activity is restricted to moderators', 403)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)
  const url = new URL(request.url)
  return json({ ok: true, activity: await listRecentActivity(env, Number(url.searchParams.get('limit') || 100)) })
}

export async function onRequestPost({ request, env }: Context) {
  const user = await requireRole(request, env, 'admin')
  if (!user) return error('Activity is restricted to administrators', 403)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)
  const input = await request.json().catch(() => ({})) as { action?: string }
  if (String(input.action || '') !== 'clear') return error('Invalid action', 400)
  return json({ ok: true, result: await clearRecentActivity(env) })
}
