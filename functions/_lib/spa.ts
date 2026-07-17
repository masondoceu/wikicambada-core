type SpaEnv = {
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>
  }
}

export async function serveSpa(context: { request: Request; env: SpaEnv }) {
  const url = new URL(context.request.url)
  url.pathname = '/'
  url.search = ''

  const request = new Request(url.toString(), context.request)

  if (context.env.ASSETS?.fetch) {
    return context.env.ASSETS.fetch(request)
  }

  return fetch(request)
}
