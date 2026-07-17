import type { Env } from './d1'

export async function notifyDiscordProposal(env: Env, request: Request, proposal: any) {
  const webhookUrl = env.DISCORD_EDIT_WEBHOOK_URL
  if (!webhookUrl) return { sent: false, reason: 'webhook ausente' }

  const origin = env.PUBLIC_BASE_URL || new URL(request.url).origin
  const reviewUrl = `${origin}/admin/proposals?id=${encodeURIComponent(proposal.id)}`
  const proposalsUrl = `${origin}/admin/proposals`
  const pageUrl = `${origin}/wiki/${encodeURIComponent(proposal.pageSlug)}`

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: env.WIKI_SITE_NAME || 'WikiCambada Core',
      content: 'Nova proposta de edição recebida.',
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: proposal.title,
          description: proposal.summary || 'Sem resumo informado.',
          color: 3447003,
          fields: [
            { name: 'Página', value: proposal.pageSlug, inline: true },
            { name: 'Contato', value: proposal.contact || 'Não informado', inline: true },
            { name: 'IP', value: proposal.reporterIp || 'Não informado', inline: true },
            { name: 'Proposta', value: proposal.id, inline: false }
          ],
          timestamp: proposal.createdAt
        }
      ],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 5, label: 'Abrir proposta', url: reviewUrl },
            { type: 2, style: 5, label: 'Painel de propostas', url: proposalsUrl },
            { type: 2, style: 5, label: 'Abrir página', url: pageUrl }
          ]
        }
      ]
    })
  })

  return { sent: response.ok, status: response.status }
}
