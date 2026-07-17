import { hasDb, listPages, type Env } from '../_lib/d1'
import { error, json } from '../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  if (!hasDb(env)) return error('D1 ainda não foi ligado neste alpha', 501)

  const url = new URL(request.url)
  const sort = url.searchParams.get('sort') === 'recent' ? 'recent' : 'title'
  const limit = Number(url.searchParams.get('limit') || '500')

  return json(await listPages(env, { sort, limit }))
}
