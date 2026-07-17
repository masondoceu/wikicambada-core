import { getSystemStatus, type Env } from '../../_lib/d1'
import { json } from '../../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ env }: Context) {
  return json({ ok: true, status: await getSystemStatus(env) })
}
