import { requireAccessUser } from '../_lib/access'
import { error, json } from '../_lib/response'

type Env = {
  WIKI_BUCKET?: R2Bucket
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
  ACCESS_STRICT?: string
}

type Context = EventContext<Env, string, { key?: string[] }>

function normalizeKey(value: string[] | string | undefined) {
  const raw = Array.isArray(value) ? value.join('/') : value
  return raw?.replace(/^\/+/, '') || ''
}

export async function onRequestGet({ env, params }: Context) {
  const key = normalizeKey(params.key)
  if (!key) return error('arquivo ausente', 400)
  if (!env.WIKI_BUCKET) return error('R2 ainda não foi ligado neste pre-alpha', 501)

  const object = await env.WIKI_BUCKET.get(key)
  if (!object) return error('arquivo não encontrado', 404)

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  return new Response(object.body, { headers })
}

export async function onRequestPut({ request, env, params }: Context) {
  const user = await requireAccessUser(request, env)
  if (!user) return error('upload bloqueado pela política de acesso', 401)

  const key = normalizeKey(params.key)
  if (!key) return error('arquivo ausente', 400)
  if (!env.WIKI_BUCKET) return error('R2 ainda não foi ligado neste pre-alpha', 501)

  await env.WIKI_BUCKET.put(key, request.body, {
    httpMetadata: {
      contentType: request.headers.get('content-type') || 'application/octet-stream'
    },
    customMetadata: {
      uploadedBy: user.email
    }
  })

  return json({ ok: true, key })
}
