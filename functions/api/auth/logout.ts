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
  const returnTo = new URL(safeReturnUrl(request), url.origin).toString()
  const logoutUrl = new URL('/cdn-cgi/access/logout', url.origin)
  logoutUrl.searchParams.set('return', returnTo)
  return Response.redirect(logoutUrl.toString(), 302)
}
