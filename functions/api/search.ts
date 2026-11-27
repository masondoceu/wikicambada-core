import { globalSettingEnabled, searchPages, searchPageBatch, type Env } from './_lib/d1'
import { error, json } from './_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  if (!(await globalSettingEnabled(env, 'search'))) return error('Search has been disabled', 403)
  const url = new URL(request.url)
  const query = url.searchParams.get('q')?.trim() || ''

  if (!query) return json(url.searchParams.get('paged') === '1' ? { results: [], total: 0, nextOffset: null } : [])
  if (!env.DB) return error('D1 search is not configured on this installation', 501)

  if (query.length > 500) return error('Search query too long', 400)
  if (url.searchParams.get('paged') === '1') return json(await searchPageBatch(env, query, Number(url.searchParams.get('offset')) || 0))
  return json(await searchPages(env, query))
}
