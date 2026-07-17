import { globalSettingEnabled, searchPages, type Env } from './_lib/d1'
import { error, json } from './_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  if (!(await globalSettingEnabled(env, 'search'))) return error('busca foi desativada', 403)
  const url = new URL(request.url)
  const query = url.searchParams.get('q')?.trim() || ''

  if (!query) return json([])
  if (!env.DB) return error('busca em D1 ainda não foi ligada neste alpha', 501)

  return json(await searchPages(env, query))
}
