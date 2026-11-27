import type { Env } from './d1'

export async function seedInitialContent(env: Env) {
  if (!env.DB || !env.WIKI_INITIAL_CONTENT) return
  const input = JSON.parse(env.WIKI_INITIAL_CONTENT)
  if (!input?.id || !['pt-BR', 'en'].includes(input.language) || !/^[a-z0-9-]+$/.test(input.homeSlug) || !/^[a-z0-9-]+$/.test(input.guideSlug) || input.homeSlug === input.guideSlug) throw new Error('Invalid initial content configuration')
  const existing = await env.DB.prepare("SELECT key FROM system_settings WHERE key = 'initial_content'").first()
  if (existing) return
  const english = input.language === 'en', now = new Date().toISOString(), token = crypto.randomUUID()
  const pages = [
    { slug: input.homeSlug, title: english ? 'Main page' : 'Página principal', content: english ? `Welcome to your wiki.\n\nRead [[${input.guideSlug}|Start here]] to create and edit your first articles.` : `Bem-vindo à sua wiki.\n\nLeia [[${input.guideSlug}|Comece por aqui]] para criar e editar seus primeiros artigos.` },
    { slug: input.guideSlug, title: english ? 'Start here' : 'Comece por aqui', content: english ? '## Create an article\n\nSearch for a title and choose **Create page**. Write the content, add an edit summary and save.\n\n## Edit a page\n\nUse **Edit** to update an article. Its previous versions remain available in **History**.\n\n## Basic Markdown\n\nUse `## Heading` for sections, `**bold**` for emphasis and `- item` for lists. Link another article with `[[Article title]]` or an external site with `[label](https://example.com)`.' : '## Criar um artigo\n\nPesquise um título e escolha **Criar página**. Escreva o conteúdo, informe um resumo da edição e salve.\n\n## Editar uma página\n\nUse **Editar** para atualizar um artigo. As versões anteriores continuam disponíveis em **Histórico**.\n\n## Markdown básico\n\nUse `## Título` para seções, `**negrito**` para destaque e `- item` para listas. Vincule outro artigo com `[[Título do artigo]]` ou um site externo com `[texto](https://example.com)`.' }
  ]
  const statements = [env.DB.prepare("INSERT INTO system_settings (key, value_json, updated_at) SELECT 'initial_content', CASE WHEN EXISTS (SELECT 1 FROM pages) THEN ? ELSE ? END, ? WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'initial_content')").bind(JSON.stringify({ state: 'skipped', installation: input.id }), JSON.stringify({ state: 'seeded', installation: input.id, token }), now)]
  const marker = JSON.stringify({ state: 'seeded', installation: input.id, token })
  for (const page of pages) {
    const id = crypto.randomUUID(), revision = crypto.randomUUID()
    statements.push(env.DB.prepare("INSERT INTO pages(id,slug,title,namespace,status,created_by_email,created_at,updated_at,current_revision_id) SELECT ?,?,?,'article','published','system',?,?,? WHERE EXISTS (SELECT 1 FROM system_settings WHERE key = 'initial_content' AND value_json = ?)").bind(id, page.slug, page.title, now, now, revision, marker))
    statements.push(env.DB.prepare("INSERT INTO revisions(id,page_id,revision_number,author_email,author_name,title,categories_json,content_markdown,summary,created_at) SELECT ?,?,1,'system','WikiCambada Core',?,'[]',?,?,? WHERE EXISTS (SELECT 1 FROM system_settings WHERE key = 'initial_content' AND value_json = ?)").bind(revision, id, page.title, page.content, english ? 'Initial content' : 'Conteúdo inicial', now, marker))
    statements.push(env.DB.prepare("INSERT INTO page_search(page_id,slug,title,subtitle,content_markdown) SELECT ?,?,?,'',? WHERE EXISTS (SELECT 1 FROM system_settings WHERE key = 'initial_content' AND value_json = ?)").bind(id, page.slug, page.title, page.content, marker))
  }
  await env.DB.batch(statements)
}
