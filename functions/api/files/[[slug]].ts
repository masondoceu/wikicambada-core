import { globalSettingEnabled, hasDb, readUpload, normalizeSlug, publicUploadMetadata, type Env } from '../_lib/d1'
import { error, json } from '../_lib/response'

type Context = EventContext<Env, string, { slug?: string[] | string }>

function parsePath(value: string[] | string | undefined) {
  const parts = Array.isArray(value) ? value : String(value || '').split('/')
  return parts.map(part => String(part || '').trim()).filter(Boolean)
}

function cleanFilenameHeader(value: string) {
  return String(value || 'arquivo').replace(/["\\\r\n]/g, '') || 'arquivo'
}

function safeInlineType(value: string | null) {
  return /^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm|ogg|quicktime|x-m4v)|audio\/(mpeg|mp3|ogg|wav|wave|x-wav|webm|flac|aac|mp4|x-m4a))$/i.test(String(value || ''))
}

export async function onRequestGet({ env, params }: Context) {
  if (!(await globalSettingEnabled(env, 'mediaUploads'))) return error('Media disabled', 403)
  const parts = parsePath(params.slug)
  const wantsContent = parts[parts.length - 1] === 'content'
  const slugParts = wantsContent ? parts.slice(0, -1) : parts
  const slug = normalizeSlug(slugParts)

  if (!slug) return error('Missing file', 400)
  if (!hasDb(env)) return error('D1 is not bound for file lookup', 501)

  const file = await readUpload(env, slug)
  if (!file) return error('File not found', 404)

  if (!wantsContent) {
    return json(await publicUploadMetadata(env, file))
  }
  if (!env.WIKI_BUCKET) return error('R2 is not bound for serving files', 501)

  const object = await env.WIKI_BUCKET.get(file.r2Key)
  if (!object) return error('Object not found in R2', 404)

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  const inline = safeInlineType(headers.get('content-type'))
  if (!inline) headers.set('content-type', 'application/octet-stream')
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  headers.set('content-disposition', `${inline ? 'inline' : 'attachment'}; filename="${cleanFilenameHeader(file.filename)}"`)

  return new Response(object.body, { headers })
}
