import { globalSettingEnabled, hasDb, listCategories, normalizeSlug, readCategory, type Env } from '../_lib/d1'
import { error, json } from '../_lib/response'

type Context = EventContext<Env, string, { slug?: string[] }>

export async function onRequestGet({ env, params }: Context) {
  if (!(await globalSettingEnabled(env, 'categories'))) return error('Categories are disabled', 403)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)

  const slug = normalizeSlug(params.slug)
  if (!slug) return json(await listCategories(env))

  const category = await readCategory(env, slug)
  if (!category) return error('Category not found', 404)

  return json(category)
}
