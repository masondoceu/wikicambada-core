import { json } from './_lib/response'

type Env = {
  DB?: D1Database
  WIKI_BUCKET?: R2Bucket
  WIKI_SITE_NAME?: string
  WIKI_CORE_VERSION?: string
}

type Context = EventContext<Env, string, Record<string, never>>

export async function onRequestGet({ env }: Context) {
  return json({
    ok: true,
    app: env.WIKI_SITE_NAME || 'WikiCambada Core',
    core: 'WikiCambada Core',
    version: env.WIKI_CORE_VERSION || 'v1.1.0 Beta',
    database: Boolean(env.DB),
    uploads: Boolean(env.WIKI_BUCKET)
  })
}
