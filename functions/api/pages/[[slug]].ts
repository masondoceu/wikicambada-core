import { readAccessUser } from '../_lib/access'
import { hasDb, normalizeSlug, publicPageEnabled, readPage, type Env } from '../_lib/d1'
import { createRevision } from '../_lib/revisions'
import { error, json } from '../_lib/response'
import { onRequestGet as listPageIndex } from './index'

type Context = EventContext<Env, string, { slug?: string[] }>

export async function onRequestGet(context: Context) {
  const { env, params } = context
  const slug = normalizeSlug(params.slug)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)

  if (!slug) {
    return listPageIndex(context)
  }

  if (!(await publicPageEnabled(env, slug))) return error('Page unavailable on this installation', 403)

  const page = await readPage(env, slug)
  if (!page) return error('Page not found', 404)
  if (!(await publicPageEnabled(env, page.slug))) return error('Page unavailable on this installation', 403)

  return json(page)
}

export const onRequestPost = createRevision

export async function onRequestOptions({ request, env }: Context) {
  const user = await readAccessUser(request, env)
  return json({ ok: true, authenticated: user.authenticated })
}
