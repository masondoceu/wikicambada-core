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
  if (!user) return error('This panel is restricted to authorized editors', 401)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)

  const id = proposalId(params.id)
  if (!id) {
    const url = new URL(request.url)
    const status = url.searchParams.get('status') || 'pending'
    const proposals = await listEditProposals(env, status)
    return json({ ok: true, user, proposals })
  }

  const proposal = await readEditProposal(env, id)
  if (!proposal) return error('Proposal not found', 404)
  return json({ ok: true, proposal })
}

export async function onRequestPost({ request, env, params }: Context) {
  const user = await requireAccessUser(request, env)
  if (!user) return error('This panel is restricted to authorized editors', 401)
  if (!hasDb(env)) return error('D1 is not bound on this installation', 501)

  const id = proposalId(params.id)
  if (!id) return error('Missing proposal', 400)

  const input = await request.json().catch(() => ({})) as { action?: string, creditMode?: string, expectedRevisionId?: string | null }
  if (input.action === 'approve') {
    if (!Object.hasOwn(input, 'expectedRevisionId')) return error('Base revision required', 428)
    if (input.expectedRevisionId !== null && typeof input.expectedRevisionId !== 'string') return error('Invalid base revision', 400)
    const result = await approveEditProposal(env, id, user.email, user.displayName || user.name, input.creditMode, input.expectedRevisionId)
    if (!result) return error('Proposal not found or already reviewed', 404)
    return json({ ok: true, action: 'approved', ...result })
  }

  if (input.action === 'reject') {
    const proposal = await rejectEditProposal(env, id, user.email)
    if (!proposal) return error('Proposal not found or already reviewed', 404)
    return json({ ok: true, action: 'rejected', proposal })
  }

  return error('Invalid action', 400)
}
