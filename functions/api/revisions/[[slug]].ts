import { globalSettingEnabled, hasDb, listPageRevisions, normalizeSlug, readPageRevision, type Env } from '../_lib/d1'
import { error, json } from '../_lib/response'

type Context = EventContext<Env, string, { slug?: string[] }>

export async function onRequestGet({ request, env, params }: Context) {
  if (!(await globalSettingEnabled(env, 'pageHistory'))) return error('histórico público foi desativado', 403)
  const slug = normalizeSlug(params.slug)
  if (!slug) return error('slug ausente', 400)
  if (!hasDb(env)) return error('D1 ainda não foi ligado nesta instalação', 501)

  const url = new URL(request.url)
  const revisionNumber = url.searchParams.get('revision')

  if (revisionNumber) {
    const revision = await readPageRevision(env, slug, revisionNumber)
    if (!revision) return error('revisão não encontrada', 404)
    return json(revision)
  }

  const data = await listPageRevisions(env, slug, { offset: Number(url.searchParams.get('offset')) || 0 })
  if (!data) return error('página não encontrada', 404)

  return json(data)
}
