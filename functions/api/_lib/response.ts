import { localizeDiagnostic } from '../../../src/scripts/core/i18n.js'
import { messages } from './messages'

const english = Object.fromEntries(Object.entries(messages).map(([en, pt]) => [pt, en]))

export function diagnosticText(message: string, language?: string) {
  if (language === 'en') return message
  return translateError(message, false)
}

function translateError(message: string, toEnglish: boolean): string {
  const catalog = toEnglish ? english : messages
  return localizeDiagnostic(message, catalog, (value: string, pattern: string) => {
    const englishPattern = toEnglish ? english[pattern] : pattern
    if (englishPattern === 'Edit rejected: {0}') return value.split('; ').map(reason => translateError(reason, toEnglish)).join('; ')
    if (englishPattern.startsWith('Could not ')) return translateError(value, toEnglish)
    return value
  })
}


export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(data), { ...init, headers })
}

export function error(message: string, status = 400, headers?: HeadersInit) {
  const safeMessage = status >= 500 ? 'Service temporarily unavailable' : message
  const localized = diagnosticText(safeMessage)
  return json({ ok: false, error: localized === safeMessage ? messages['Invalid request'] : localized }, { status, headers })
}

export async function localizeErrorResponse(response: Response, language?: string) {
  if (language !== 'en' || response.status < 400 || !response.headers.get('content-type')?.startsWith('application/json')) return response
  const body: any = await response.clone().json().catch(() => null)
  if (body?.ok !== false || typeof body.error !== 'string') return response
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  return json({ ...body, error: translateError(body.error, true) }, { status: response.status, headers })
}

export function failure(exception: unknown) {
  const status = exception instanceof Error && 'status' in exception ? Number(exception.status) : 500
  return error(exception instanceof Error ? exception.message : 'Internal error', status >= 400 && status <= 599 ? status : 500)
}
