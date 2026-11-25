import { error } from '../_lib/response'

import { globalSettingEnabled, type Env } from '../_lib/d1'

type Context = EventContext<Env, string, { key?: string[] }>

function normalizeKey(value: string[] | string | undefined) {
  const raw = Array.isArray(value) ? value.join('/') : value
  const key = raw?.replace(/^\/+/, '') || ''
  if (!key.startsWith('uploads/') || key.includes('..') || /[\u0000-\u001f]/.test(key) || key.length > 1024) return ''
  return key
}

function safeInlineType(value: string | null) {
  return /^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm|ogg|quicktime|x-m4v)|audio\/(mpeg|mp3|ogg|wav|wave|x-wav|webm|flac|aac|mp4|x-m4a))$/i.test(String(value || ''))
}

export async function onRequestGet({ env, params }: Context) {
  const key = normalizeKey(params.key)
  if (!key) return error('arquivo ausente', 400)
  if (!env.WIKI_BUCKET) return error('R2 ainda não foi ligado nesta instalação', 501)

  if (!(await globalSettingEnabled(env, 'mediaUploads'))) return error('mídia desativada', 403)
  if (!env.DB) return error('armazenamento indisponível', 503)
  const registered = await env.DB.prepare("SELECT id FROM uploads WHERE r2_key = ? AND COALESCE(status, 'published') = 'published'").bind(key).first()
  if (!registered) return error('arquivo não encontrado', 404)
  const object = await env.WIKI_BUCKET.get(key)
  if (!object) return error('arquivo não encontrado', 404)

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  if (!safeInlineType(headers.get('content-type'))) {
    headers.set('content-type', 'application/octet-stream')
    headers.set('content-disposition', 'attachment')
  }
  headers.set('etag', object.httpEtag)
  return new Response(object.body, { headers })
}

export async function onRequestPut() {
  return error('a rota legada de upload foi desativada', 410)
}
