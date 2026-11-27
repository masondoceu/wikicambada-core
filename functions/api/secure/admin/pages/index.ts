import { requireRole } from '../../../_lib/access'
import { hasDb, listAdminPages, pageListStats, type Env } from '../../../_lib/d1'
import { error, json } from '../../../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  const user = await requireRole(request, env, 'moderator')
  if (!user) return error('Administration blocked by the access policy', 401)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)

  const url = new URL(request.url)
  const sort = url.searchParams.get('sort') === 'recent' ? 'recent' : 'title'
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0)
  const pages = await listAdminPages(env, { sort, includeDeleted: true, limit: 100, offset })
  const stats = await pageListStats(env, true)
  return json({ pages, ...stats, offset, nextOffset: offset + pages.length < (stats?.total || 0) ? offset + pages.length : null })
}
