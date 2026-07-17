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

export async function onRequestGet({ request }: EventContext<Record<string, unknown>, string, Record<string, never>>) {
  const url = new URL(request.url)
  const returnTo = safeReturnUrl(request)
  const destination = new URL(`/api/secure/auth/start?return=${encodeURIComponent(returnTo)}`, url.origin)
  return Response.redirect(destination.toString(), 302)
}
