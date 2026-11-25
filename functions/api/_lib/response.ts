export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(data), { ...init, headers })
}

export function error(message: string, status = 400) {
  return json({ ok: false, error: status >= 500 ? 'serviço temporariamente indisponível' : message }, { status })
}

export function failure(exception: unknown) {
  const status = exception instanceof Error && 'status' in exception ? Number(exception.status) : 500
  return error(exception instanceof Error ? exception.message : 'erro interno', status >= 400 && status <= 599 ? status : 500)
}
