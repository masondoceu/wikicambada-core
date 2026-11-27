import { lookupPageSlugs, type Env } from '../_lib/d1'
import { error, json } from '../_lib/response'

export async function onRequestGet({ request, env }: EventContext<Env, string, Record<string, never>>) {
  if (!env.DB) return error('Storage unavailable', 503)
  const slugs = new URL(request.url).searchParams.getAll('slug')
  if (slugs.length > 30 || slugs.some(slug => slug.length > 500)) return error('The query exceeds the allowed limit', 400)
  return json(await lookupPageSlugs(env, slugs))
}
