import type { Env } from './d1'

export async function notifyDiscordProposal(env: Env, request: Request, proposal: any) {
  const ui = (pt: string, en: string) => env.WIKI_INTERFACE_LANGUAGE === 'en' ? en : pt
  const webhookUrl = env.DISCORD_EDIT_WEBHOOK_URL
  if (!webhookUrl) return { sent: false, reason: 'Discord webhook is not configured' }

  const origin = env.PUBLIC_BASE_URL || new URL(request.url).origin
  const reviewUrl = `${origin}/admin/proposals?id=${encodeURIComponent(proposal.id)}`
  const proposalsUrl = `${origin}/admin/proposals`
  const pageUrl = `${origin}/wiki/${encodeURIComponent(proposal.pageSlug)}`

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: env.WIKI_SITE_NAME || 'WikiCambada Core',
      content: ui('Nova proposta de edição recebida.', 'New edit proposal received.'),
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: proposal.title,
          description: proposal.summary || ui('Sem resumo informado.', 'No summary provided.'),
          color: 3447003,
          fields: [
            { name: ui('Página', 'Page'), value: proposal.pageSlug, inline: true },
            { name: ui('Contato', 'Contact'), value: proposal.contact || ui('Não informado', 'Not provided'), inline: true },
            { name: 'IP', value: proposal.reporterIp || ui('Não informado', 'Not provided'), inline: true },
            { name: ui('Proposta', 'Proposal'), value: proposal.id, inline: false }
          ],
          timestamp: proposal.createdAt
        }
      ],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 5, label: ui('Abrir proposta', 'Open proposal'), url: reviewUrl },
            { type: 2, style: 5, label: ui('Painel de propostas', 'Proposal dashboard'), url: proposalsUrl },
            { type: 2, style: 5, label: ui('Abrir página', 'Open page'), url: pageUrl }
          ]
        }
      ]
    })
  })

  return { sent: response.ok, status: response.status }
}
