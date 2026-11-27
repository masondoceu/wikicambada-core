import { globalSettingEnabled, hasDb, readRandomPage, type Env } from '../_lib/d1'
import { error, json } from '../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ env }: Context) {
  if (!(await globalSettingEnabled(env, 'randomPage'))) return error('Random pages are disabled', 403)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)

  const page = await readRandomPage(env)
  if (!page) return error('No published pages', 404)

  return json(page)
}
