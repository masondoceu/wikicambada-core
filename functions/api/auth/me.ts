import { readAccessUser, type AccessEnv } from '../_lib/access'
import { json } from '../_lib/response'

type Context = EventContext<AccessEnv, string, Record<string, never>>

export async function onRequestGet({ request, env }: Context) {
  const user = await readAccessUser(request, env)
  const url = new URL(request.url)
  const returnTo = url.searchParams.get('return') || '/'

  return json({
    ...user,
    loginUrl: `/api/auth/login?return=${encodeURIComponent(returnTo)}`,
    logoutUrl: `/api/auth/logout?return=${encodeURIComponent(returnTo)}`
  })
}
