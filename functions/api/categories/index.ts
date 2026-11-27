import { globalSettingEnabled, hasDb, listCategories, type Env } from '../_lib/d1'
import { error, json } from '../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ env }: Context) {
  if (!(await globalSettingEnabled(env, 'categories'))) return error('Categories are disabled', 403)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)
  return json(await listCategories(env))
}
