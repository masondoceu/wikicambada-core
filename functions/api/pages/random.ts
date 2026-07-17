import { globalSettingEnabled, hasDb, readRandomPage, type Env } from '../_lib/d1'
import { error, json } from '../_lib/response'

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ env }: Context) {
  if (!(await globalSettingEnabled(env, 'randomPage'))) return error('página aleatória foi desativada', 403)
  if (!hasDb(env)) return error('D1 ainda não foi ligado nesta instalação', 501)

  const page = await readRandomPage(env)
  if (!page) return error('nenhuma página publicada', 404)

  return json(page)
}
