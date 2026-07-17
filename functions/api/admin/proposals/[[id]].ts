import { requireAccessUser } from '../../_lib/access'
import { approveEditProposal, hasDb, listEditProposals, readEditProposal, rejectEditProposal, type Env } from '../../_lib/d1'
import { error, json } from '../../_lib/response'

type Context = EventContext<Env, string, { id?: string[] }>

function proposalId(value: string[] | string | undefined) {
  const raw = Array.isArray(value) ? value.join('/') : value
  return String(raw || '').trim()
}

export async function onRequestGet({ request, env, params }: Context) {
  const user = await requireAccessUser(request, env)
  if (!user) return error('painel restrito a editores autorizados', 401)
  if (!hasDb(env)) return error('D1 ainda não foi ligado neste alpha', 501)

  const id = proposalId(params.id)
  if (!id) {
    const url = new URL(request.url)
    const status = url.searchParams.get('status') || 'pending'
    const proposals = await listEditProposals(env, status)
    return json({ ok: true, user, proposals })
  }

  const proposal = await readEditProposal(env, id)
  if (!proposal) return error('proposta não encontrada', 404)
  return json({ ok: true, proposal })
}

export async function onRequestPost({ request, env, params }: Context) {
  const user = await requireAccessUser(request, env)
  if (!user) return error('painel restrito a editores autorizados', 401)
  if (!hasDb(env)) return error('D1 ainda não foi ligado neste alpha', 501)

  const id = proposalId(params.id)
  if (!id) return error('proposta ausente', 400)

  const input = await request.json().catch(() => ({})) as { action?: string, creditMode?: string }
  if (input.action === 'approve') {
    const result = await approveEditProposal(env, id, user.email, user.displayName || user.name, input.creditMode)
    if (!result) return error('proposta não encontrada ou já revisada', 404)
    return json({ ok: true, action: 'approved', ...result })
  }

  if (input.action === 'reject') {
    const proposal = await rejectEditProposal(env, id, user.email)
    if (!proposal) return error('proposta não encontrada ou já revisada', 404)
    return json({ ok: true, action: 'rejected', proposal })
  }

  return error('ação inválida', 400)
}
