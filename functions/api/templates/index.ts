import { globalSettingEnabled, hasDb, listContentTemplates, type Env } from '../_lib/d1'
import { error, json } from '../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ env }: Context) {
  if (!(await globalSettingEnabled(env, 'templates'))) return json([])
  if (!hasDb(env)) return json(await listContentTemplates(env, { role: 'guest' }))
  try {
    return json(await listContentTemplates(env, { role: 'guest' }))
  } catch (exception) {
    const message = exception instanceof Error ? exception.message : 'erro interno'
    return error(message, 500)
  }
}
