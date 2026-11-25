import { requireAccessUser } from '../../_lib/access'
import { globalSettingEnabled, hasDb, listUploads, recordUpload, slugFromTitle, type Env } from '../../_lib/d1'
import { error, json } from '../../_lib/response'
import { matchesMediaType } from '../../_lib/media'

type Context = EventContext<Env, string, Record<string, never>>

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024
const ALLOWED_FILE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-m4v',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/webm',
  'audio/flac',
  'audio/aac',
  'audio/mp4',
  'audio/x-m4a'
])

function safeFilename(value: string) {
  const fallback = 'arquivo'
  const name = String(value || fallback)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)

  return name || fallback
}

function extensionForType(type: string) {
  if (type === 'image/jpeg') return '.jpg'
  if (type === 'image/png') return '.png'
  if (type === 'image/webp') return '.webp'
  if (type === 'image/gif') return '.gif'
  if (type === 'video/mp4') return '.mp4'
  if (type === 'video/webm') return '.webm'
  if (type === 'video/ogg') return '.ogv'
  if (type === 'video/quicktime') return '.mov'
  if (type === 'video/x-m4v') return '.m4v'
  if (type === 'audio/mpeg' || type === 'audio/mp3') return '.mp3'
  if (type === 'audio/ogg') return '.oga'
  if (type === 'audio/wav' || type === 'audio/wave' || type === 'audio/x-wav') return '.wav'
  if (type === 'audio/webm') return '.webm'
  if (type === 'audio/flac') return '.flac'
  if (type === 'audio/aac') return '.aac'
  if (type === 'audio/mp4' || type === 'audio/x-m4a') return '.m4a'
  return ''
}

function ensureFilenameExtension(filename: string, mimeType: string) {
  if (/\.(png|jpe?g|webp|gif|mp4|webm|ogv|ogg|mov|m4v|mp3|oga|wav|flac|aac|m4a)$/i.test(filename)) return filename
  return `${filename}${extensionForType(mimeType)}`
}

function formatBytes(bytes: number) {
  return `${Math.round(bytes / 1024 / 1024)} MB`
}

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function safeAlign(value: string | File | null) {
  const clean = String(value || '').trim().toLowerCase()
  if (clean === 'left' || clean === 'esquerda') return 'left'
  if (clean === 'center' || clean === 'middle' || clean === 'centro' || clean === 'meio') return 'center'
  return 'right'
}

function safeWidth(value: string | File | null) {
  const parsed = Number.parseInt(String(value || ''), 10)
  if (!Number.isFinite(parsed)) return 260
  return Math.min(420, Math.max(120, parsed))
}

function markdownForFile(file: any, caption = '', align = 'right', width = 260) {
  const title = String(caption || file.filename).replace(/[\r\n]/g, ' ').trim() || file.filename
  const alt = String(file.filename).replace(/[\r\n]/g, ' ')
  const isVideo = String(file.mimeType || '').startsWith('video/')
  const isAudio = String(file.mimeType || '').startsWith('audio/')
  if (isVideo) {
    return `\n\n:::video\nsrc: ${file.contentUrl}\ntitle: ${alt}\ncaption: ${title}\ndetails: ${file.pageUrl}\n:::\n`
  }
  if (isAudio) {
    return `\n\n:::audio\nsrc: ${file.contentUrl}\ntitle: ${alt}\ncaption: ${title}\ndetails: ${file.pageUrl}\n:::\n`
  }

  return `\n\n:::thumb\nsrc: ${file.contentUrl}\nalt: ${alt}\ncaption: ${title}\ndetails: ${file.pageUrl}\nalign: ${align}\nwidth: ${width}\n:::\n`
}




export async function onRequestGet({ request, env }: Context) {
  const user = await requireAccessUser(request, env)
  if (!user) return error('listagem de arquivos bloqueada pela política de acesso', 401)
  if (!hasDb(env)) return error('D1 ainda não foi ligado para listar arquivos', 501)

  const url = new URL(request.url)
  const search = url.searchParams.get('q') || ''
  const limit = Number(url.searchParams.get('limit') || 80)
  const files = await listUploads(env, { search, limit, offset: Math.max(0, Number(url.searchParams.get('offset')) || 0) })

  return json(files)
}

export async function onRequestPost({ request, env }: Context) {
  const user = await requireAccessUser(request, env)
  if (!user) return error('upload bloqueado pela política de acesso', 401)
  if (!hasDb(env)) return error('D1 ainda não foi ligado para registrar uploads', 501)
  if (!env.WIKI_BUCKET) return error('R2 ainda não foi ligado para receber uploads', 501)
  if (!(await globalSettingEnabled(env, 'mediaUploads'))) return error('uploads de mídia foram desativados', 403)

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > MAX_REQUEST_BYTES) {
    return error(`o arquivo enviado excede o limite de ${formatBytes(MAX_UPLOAD_BYTES)}`, 413)
  }

  const form = await request.formData().catch(() => null)
  if (!form) return error('formulário de upload inválido', 400)

  const file = form.get('file') as File | null
  if (!file || typeof file.arrayBuffer !== 'function') return error('nenhum arquivo foi enviado', 400)

  const mimeType = String(file.type || '').toLowerCase()
  if (!ALLOWED_FILE_TYPES.has(mimeType)) {
    return error('tipo de arquivo não permitido. use PNG, JPEG, WebP, GIF, MP4, WebM, OGG/OGV, MOV, MP3, WAV, FLAC, AAC ou M4A', 415)
  }

  if (!file.size) return error('arquivo vazio', 400)
  if (file.size > MAX_UPLOAD_BYTES) {
    return error(`o arquivo excede o limite de ${formatBytes(MAX_UPLOAD_BYTES)}`, 413)
  }

  const filename = ensureFilenameExtension(safeFilename(file.name || 'arquivo'), mimeType)
  const buffer = await file.arrayBuffer()
  if (!matchesMediaType(buffer, mimeType)) return error('o conteúdo do arquivo não corresponde ao tipo informado', 415)
  const digest = hex(await crypto.subtle.digest('SHA-256', buffer))
  const now = new Date()
  const year = String(now.getUTCFullYear())
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const keyName = `${crypto.randomUUID()}-${slugFromTitle(filename.replace(/\.[^.]+$/, '')) || 'arquivo'}${extensionForType(mimeType)}`
  const r2Key = `uploads/${year}/${month}/${keyName}`

  await env.WIKI_BUCKET.put(r2Key, buffer, {
    httpMetadata: {
      contentType: mimeType,
      contentDisposition: `inline; filename="${filename.replace(/"/g, '')}"`
    },
    customMetadata: {
      uploadedBy: user.email,
      originalFilename: filename,
      sha256: digest
    }
  })

  const description = String(form.get('description') || form.get('caption') || '').trim().slice(0, 500)
  const preferredSlug = slugFromTitle(String(form.get('slug') || '').trim())
  const align = safeAlign(form.get('align'))
  const width = safeWidth(form.get('width'))
  let upload
  try {
    upload = await recordUpload(env, {
      r2Key,
      filename,
      mimeType,
      sizeBytes: file.size,
      sha256: digest,
      uploadedByEmail: user.email,
      description,
      preferredSlug
    })
  } catch (cause) {
    const persisted = await env.DB!.prepare('SELECT id FROM uploads WHERE r2_key = ?').bind(r2Key).first().catch(() => undefined)
    if (persisted === null) await env.WIKI_BUCKET.delete(r2Key).catch(() => undefined)
    throw cause
  }

  if (!upload) {
    await env.WIKI_BUCKET.delete(r2Key).catch(() => undefined)
    return error('não foi possível registrar o arquivo enviado', 500)
  }

  return json({
    ok: true,
    file: upload,
    markdown: markdownForFile(upload, description, align, width)
  })
}
