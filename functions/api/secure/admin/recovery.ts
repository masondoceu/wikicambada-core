import { recoveryGet, recoveryPost, recoveryPut } from '../../_lib/recovery'
import { type Env } from '../../_lib/d1'

type Context = EventContext<Env, string, Record<string, never>>

export const onRequestGet = ({ request, env }: Context) => recoveryGet(request, env)
export const onRequestPost = ({ request, env }: Context) => recoveryPost(request, env)
export const onRequestPut = ({ request, env }: Context) => recoveryPut(request, env)
