import { hasDb, listPages, pageListStats, type Env } from '../_lib/d1'
import { error, json } from '../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Pick<Context, 'request' | 'env'>) {
  if (!hasDb(env)) return error('D1 ainda não foi ligado nesta instalação', 501)

  const url = new URL(request.url)
  const sort = url.searchParams.get('sort') === 'recent' ? 'recent' : 'title'
  const limit = Number(url.searchParams.get('limit') || '500')

  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0)
  const pages = await listPages(env, { sort, limit, offset })
  if (url.searchParams.get('paged') !== '1') return json(pages)
  const stats = await pageListStats(env)
  return json({ pages, ...stats, offset, nextOffset: offset + pages.length < (stats?.total || 0) ? offset + pages.length : null })
}
