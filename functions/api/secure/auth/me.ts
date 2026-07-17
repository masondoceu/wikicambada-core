import { readAccessUser, type AccessEnv } from '../../_lib/access'
import { json } from '../../_lib/response'

type Context = EventContext<AccessEnv, string, Record<string, never>>

function safeReturnUrl(request: Request) {
  const url = new URL(request.url)
  const raw = url.searchParams.get('return') || '/'

  try {
    const target = new URL(raw, url.origin)
    if (target.origin !== url.origin) return '/'
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return '/'
  }
}

export async function onRequestGet({ request, env }: Context) {
  const user = await readAccessUser(request, env)
  const returnTo = safeReturnUrl(request)

  return json({
    ...user,
    loginUrl: `/api/auth/login?return=${encodeURIComponent(returnTo)}`,
    logoutUrl: `/api/auth/logout?return=${encodeURIComponent(returnTo)}`
  })
}
