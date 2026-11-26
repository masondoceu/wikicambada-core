import { readAccessUser } from './api/_lib/access'
import { getActiveIpRule, recordActivity, type Env } from './api/_lib/d1'
import { error } from './api/_lib/response'
import { seedInitialContent } from './api/_lib/initial-content'
import type { ReaderData } from './_lib/read-document'

type Context = EventContext<Env, string, ReaderData>

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
  if (context.env.WIKI_ACCESS_MODE && !['public', 'cloudflare-access', 'private'].includes(context.env.WIKI_ACCESS_MODE)) return applyHeaders(error('modo de acesso inválido', 503), url.pathname)
  if (url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(context.request.method)) {
    const origin = context.request.headers.get('origin')
    const site = context.request.headers.get('sec-fetch-site')
    if ((origin && origin !== url.origin) || site === 'cross-site' || context.request.headers.get('x-wiki-request') !== '1') return applyHeaders(error('origem da operação recusada', 403), url.pathname)
  }
  if (!isExemptPath(url.pathname)) {
    let rule
    try { rule = await getActiveIpRule(context.env, context.request, 'ban_site') }
    catch { return applyHeaders(error('serviço temporariamente indisponível', 503), url.pathname) }
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
  const privateMode = context.env.WIKI_ACCESS_MODE === 'private'
  if (privateMode && (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml')) {
    const response = url.pathname === '/robots.txt'
      ? new Response('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } })
      : new Response(null, { status: 404 })
    return applyHeaders(response, url.pathname, true)
  }
  if (context.env.DB && !recoveryRoute) {
    try {
      const lock = await context.env.DB.prepare('SELECT id FROM core_recovery_lock WHERE id = 1').first()
      if (lock) return applyHeaders(error('recuperação em andamento', 503), url.pathname)
    } catch { return applyHeaders(error('schema de recuperação indisponível', 503), url.pathname) }
    try { await seedInitialContent(context.env) }
    catch { return applyHeaders(error('conteúdo inicial temporariamente indisponível', 503), url.pathname) }
  }
  const user = recoveryRoute ? null : await readAccessUser(context.request, context.env).catch(() => null)
  if (!recoveryRoute && user?.status === 'unavailable' && (url.pathname.startsWith('/api/secure') || context.env.WIKI_ACCESS_MODE === 'private')) return applyHeaders(error('armazenamento temporariamente indisponível', 503), url.pathname)
  if (!recoveryRoute && context.env.WIKI_ACCESS_MODE === 'private' && !url.pathname.startsWith('/api/auth') && !url.pathname.startsWith('/access-') && !url.pathname.startsWith('/login-error') && (!user?.canEdit || (!user.verified && user.access !== 'development'))) {
    return applyHeaders(error(user?.authenticated ? 'permissão insuficiente' : 'autenticação obrigatória', user?.authenticated ? 403 : 401), url.pathname)
  }
  if (context.data && user?.canEdit && user.status === 'active' && (user.verified || user.access === 'development')) {
    context.data.readerRole = user.role || 'editor'
  }
  if (!recoveryRoute) await recordActivity(context.env, context.request, user).catch(() => null)

  let response: Response
  try { response = await context.next() }
  catch (cause) {
    const status = cause && typeof cause === 'object' && 'status' in cause ? Number(cause.status) : 500
    response = error(status < 500 && cause instanceof Error ? cause.message : 'serviço temporariamente indisponível', status)
  }
  if (url.pathname.startsWith('/api/') && response.status >= 500) response = error('serviço temporariamente indisponível', response.status)
  return applyHeaders(response, url.pathname, privateMode)
}
