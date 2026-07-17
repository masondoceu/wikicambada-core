import { hasDb, readUpload, normalizeSlug, type Env } from '../_lib/d1'
import { error, json } from '../_lib/response'

type Context = EventContext<Env, string, { slug?: string[] | string }>

function parsePath(value: string[] | string | undefined) {
  const parts = Array.isArray(value) ? value : String(value || '').split('/')
  return parts.map(part => String(part || '').trim()).filter(Boolean)
}

function cleanFilenameHeader(value: string) {
  return String(value || 'arquivo').replace(/["\\\r\n]/g, '') || 'arquivo'
}

export async function onRequestGet({ env, params }: Context) {
  const parts = parsePath(params.slug)
  const wantsContent = parts[parts.length - 1] === 'content'
  const slugParts = wantsContent ? parts.slice(0, -1) : parts
  const slug = normalizeSlug(slugParts)

  if (!slug) return error('arquivo ausente', 400)
  if (!hasDb(env)) return error('D1 ainda não foi ligado para consultar arquivos', 501)

  const file = await readUpload(env, slug)
  if (!file) return error('arquivo não encontrado', 404)

  if (!wantsContent) return json(file)
  if (!env.WIKI_BUCKET) return error('R2 ainda não foi ligado para servir arquivos', 501)

  const object = await env.WIKI_BUCKET.get(file.r2Key)
  if (!object) return error('objeto não encontrado no R2', 404)

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  headers.set('content-disposition', `inline; filename="${cleanFilenameHeader(file.filename)}"`)

  return new Response(object.body, { headers })
}
