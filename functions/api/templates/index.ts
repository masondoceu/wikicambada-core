import { globalSettingEnabled, hasDb, listContentTemplates, type Env } from '../_lib/d1'
import { error, failure, json } from '../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ env }: Context) {
  if (!(await globalSettingEnabled(env, 'templates'))) return json([])
  if (!hasDb(env)) return json(await listContentTemplates(env, { role: 'guest' }))
  try {
    return json(await listContentTemplates(env, { role: 'guest' }))
  } catch (exception) {
    return failure(exception)
  }
}
