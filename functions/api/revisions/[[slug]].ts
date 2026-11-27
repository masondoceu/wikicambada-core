import { globalSettingEnabled, hasDb, listPageRevisions, normalizeSlug, readPageRevision, type Env } from '../_lib/d1'
import { error, json } from '../_lib/response'

type Context = EventContext<Env, string, { slug?: string[] }>

export async function onRequestGet({ request, env, params }: Context) {
  if (!(await globalSettingEnabled(env, 'pageHistory'))) return error('Public history is disabled', 403)
  const slug = normalizeSlug(params.slug)
  if (!slug) return error('Missing slug', 400)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)

  const url = new URL(request.url)
  const revisionNumber = url.searchParams.get('revision')

  if (revisionNumber) {
    const revision = await readPageRevision(env, slug, revisionNumber)
    if (!revision) return error('Revision not found', 404)
    return json(revision)
  }

  const data = await listPageRevisions(env, slug, { offset: Number(url.searchParams.get('offset')) || 0 })
  if (!data) return error('Page not found', 404)

  return json(data)
}
