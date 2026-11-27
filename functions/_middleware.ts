import { readAccessUser } from './api/_lib/access'
import { getActiveIpRule, recordActivity } from './api/_lib/d1'
import { error, localizeErrorResponse } from './api/_lib/response'
import { seedInitialContent } from './api/_lib/initial-content'
import { readPublicConfig, type ReaderData, type ReaderEnv } from './_lib/read-document'

type Context = EventContext<ReaderEnv, string, ReaderData>

function isExemptPath(pathname: string) {
  return pathname.startsWith('/admin') ||
    pathname.startsWith('/api/secure') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/access-denied') ||
    pathname.startsWith('/access-blocked') ||
    pathname.startsWith('/login-error') ||
    pathname.startsWith('/non-identity-blocked') ||
    pathname.startsWith('/src/') ||
    pathname === '/404.html'
}

function applyHeaders(response: Response, pathname: string, privateMode = false) {
  const headers = new Headers(response.headers)
  headers.set('x-content-type-options', 'nosniff')
  headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  headers.set('x-frame-options', 'DENY')
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()')

  if (privateMode || pathname.startsWith('/api/')) {
    headers.set('cache-control', 'no-store')
  } else if (!headers.has('cache-control') && (pathname.startsWith('/src/') || /\.(png|jpg|jpeg|webp|gif|ico|css|js)$/i.test(pathname))) {
    headers.set('cache-control', 'public, max-age=3600')
  } else if (!headers.has('cache-control')) {
    headers.set('cache-control', 'no-cache')
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

export async function onRequest(context: Context) {
  const url = new URL(context.request.url)
  const api = url.pathname.startsWith('/api/')
  const privateMode = context.env.WIKI_ACCESS_MODE === 'private'
  const respond = async (response: Response) => {
    let language = api ? context.request.headers.get('x-wiki-language') || undefined : context.env.WIKI_INTERFACE_LANGUAGE
    if (!api && !language && response.status >= 400 && response.headers.get('content-type')?.startsWith('application/json')) {
      language = await readPublicConfig(context).then(config => config.site.interfaceLanguage, () => undefined)
    }
    return applyHeaders(await localizeErrorResponse(response, language), url.pathname, privateMode)
  }
  if (context.env.WIKI_ACCESS_MODE && !['public', 'cloudflare-access', 'private'].includes(context.env.WIKI_ACCESS_MODE)) return respond(error('Invalid access mode', 503))
  if (url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(context.request.method)) {
    const origin = context.request.headers.get('origin')
    const site = context.request.headers.get('sec-fetch-site')
    if ((origin && origin !== url.origin) || site === 'cross-site' || context.request.headers.get('x-wiki-request') !== '1') return respond(error('Request origin rejected', 403))
  }
  if (!isExemptPath(url.pathname)) {
    let rule
    try { rule = await getActiveIpRule(context.env, context.request, 'ban_site') }
    catch { return respond(error('Service temporarily unavailable', 503)) }
    if (rule) {
      return new Response(null, {
        status: 302,
        headers: {
          location: '/access-blocked/',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff'
        }
      })
    }
  }

  const recoveryRoute = url.pathname === '/api/secure/admin/recovery'
  if (privateMode && (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml')) {
    const response = url.pathname === '/robots.txt'
      ? new Response('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } })
      : new Response(null, { status: 404 })
    return respond(response)
  }
  if (context.env.DB && !recoveryRoute) {
    try {
      const lock = await context.env.DB.prepare('SELECT id FROM core_recovery_lock WHERE id = 1').first()
      if (lock) return respond(error('Recovery in progress', 503))
    } catch { return respond(error('Recovery schema unavailable', 503)) }
    try { await seedInitialContent(context.env) }
    catch { return respond(error('Initial content temporarily unavailable', 503)) }
  }
  const user = recoveryRoute ? null : await readAccessUser(context.request, context.env).catch(() => null)
  if (!recoveryRoute && user?.status === 'unavailable' && (url.pathname.startsWith('/api/secure') || context.env.WIKI_ACCESS_MODE === 'private')) return respond(error('Storage temporarily unavailable', 503))
  if (!recoveryRoute && context.env.WIKI_ACCESS_MODE === 'private' && !url.pathname.startsWith('/api/auth') && !url.pathname.startsWith('/access-') && !url.pathname.startsWith('/login-error') && (!user?.canEdit || (!user.verified && user.access !== 'development'))) {
    return respond(error(user?.authenticated ? 'Insufficient permissions' : 'Authentication required', user?.authenticated ? 403 : 401))
  }
  if (context.data && user?.canEdit && user.status === 'active' && (user.verified || user.access === 'development')) {
    context.data.readerRole = user.role || 'editor'
  }
  if (!recoveryRoute) await recordActivity(context.env, context.request, user).catch(() => null)

  let response: Response
  try { response = await context.next() }
  catch (cause) {
    const status = cause && typeof cause === 'object' && 'status' in cause ? Number(cause.status) : 500
    response = error(status < 500 && cause instanceof Error ? cause.message : 'Service temporarily unavailable', status)
  }
  if (url.pathname.startsWith('/api/') && response.status >= 500) response = error('Service temporarily unavailable', response.status)
  return respond(response)
}
