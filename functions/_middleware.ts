import { readAccessUser } from './api/_lib/access'
import { getActiveIpRule, recordActivity, type Env } from './api/_lib/d1'

type Context = EventContext<Env, string, Record<string, never>>

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

function applyHeaders(response: Response, pathname: string) {
  const headers = new Headers(response.headers)
  headers.set('x-content-type-options', 'nosniff')
  headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  headers.set('x-frame-options', 'DENY')
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()')

  if (pathname.startsWith('/api/')) {
    headers.set('cache-control', 'no-store')
  } else if (pathname.startsWith('/src/') || /\.(png|jpg|jpeg|webp|gif|ico|css|js)$/i.test(pathname)) {
    headers.set('cache-control', 'public, max-age=3600')
  } else {
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
  if (!isExemptPath(url.pathname)) {
    const rule = await getActiveIpRule(context.env, context.request, 'ban_site').catch(() => null)
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

  const user = await readAccessUser(context.request, context.env).catch(() => null)
  await recordActivity(context.env, context.request, user).catch(() => null)

  const response = await context.next()
  return applyHeaders(response, url.pathname)
}
