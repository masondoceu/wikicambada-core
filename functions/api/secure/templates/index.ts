import { requireAccessUser } from '../../_lib/access'
import { globalSettingEnabled, hasDb, listContentTemplates, type Env } from '../../_lib/d1'
import { error, failure, json } from '../../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  if (!(await globalSettingEnabled(env, 'templates'))) return json([])
  const user = await requireAccessUser(request, env)
  if (!user) return error('Templates are restricted to signed-in editors', 403)
  if (!hasDb(env)) return json(await listContentTemplates(env, { role: user.role || 'editor' }))

  try {
    return json(await listContentTemplates(env, { role: user.role || 'editor' }))
  } catch (exception) {
    return failure(exception)
  }
}
