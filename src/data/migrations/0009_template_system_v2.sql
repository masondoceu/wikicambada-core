PRAGMA foreign_keys = ON;

ALTER TABLE content_templates ADD COLUMN render_markdown TEXT;
ALTER TABLE content_templates ADD COLUMN params_markdown TEXT;
ALTER TABLE content_templates ADD COLUMN template_kind TEXT NOT NULL DEFAULT 'custom';
ALTER TABLE content_templates ADD COLUMN image_url TEXT;
ALTER TABLE content_templates ADD COLUMN image_position TEXT NOT NULL DEFAULT 'left';
ALTER TABLE content_templates ADD COLUMN accent_color TEXT;

CREATE INDEX IF NOT EXISTS idx_content_templates_kind ON content_templates(template_kind, group_name, title);

UPDATE content_templates
SET
  title = 'Candidato à exclusão',
  description = 'Predefinição de eliminação com motivo, imagem lateral, autor, data e link de discussão.',
  group_name = 'Manutenção',
  content_markdown = '{{Candidato à exclusão
|motivo=descreva o motivo
|autor=
|data=
|imagem=
}}',
  render_markdown = ':::templatebox delete
title: Esta página é candidata à eliminação
subtitle: Motivo: **{{{motivo|nenhum motivo informado}}}** {{{autor|}}} {{{data|}}}
image: {{{imagem|}}}
icon: 🗑️
accent: #e04444

Se discordar, explique o motivo na página de discussão antes de remover este aviso.

Lembre-se de verificar o que aponta para esta página antes de deletar.
:::',
  params_markdown = 'motivo: motivo exibido no aviso
autor: pessoa que marcou a página
data: data do aviso
imagem: imagem lateral opcional
discussao: página discutida',
  template_kind = 'delete',
  image_position = 'left',
  accent_color = '#e04444',
  updated_at = datetime('now')
WHERE slug = 'candidato-a-exclusao';

UPDATE content_templates
SET
  title = 'Múltiplos problemas',
  description = 'Predefinição de manutenção com lista de problemas, ícone/imagem e parâmetros booleanos.',
  group_name = 'Manutenção',
  content_markdown = '{{Múltiplos problemas
|fontes=sim
|referencias=sim
|revisao=sim
|nao_enciclopedico=sim
|imagem=
}}',
  render_markdown = ':::templatebox issues
title: Foram assinalados vários problemas nesta página ou seção
image: {{{imagem|}}}
icon: ⚠️
accent: #d18a28

- As fontes **não cobrem todo o texto**.
- Necessita de **fontes secundárias fiáveis** publicadas por terceiros.
- Texto necessita de **revisão**, devido a inconsistências ou dados de confiabilidade duvidosa.
- O conteúdo pode ser de **natureza não enciclopédica**.

Discuta na página de discussão antes de remover este template.
:::',
  params_markdown = 'fontes: sim/não
referencias: sim/não
revisao: sim/não
nao_enciclopedico: sim/não
confuso: sim/não
imagem: imagem lateral opcional',
  template_kind = 'issues',
  image_position = 'left',
  accent_color = '#d18a28',
  updated_at = datetime('now')
WHERE slug = 'multiplos-problemas';

INSERT INTO content_templates (id, slug, title, description, group_name, content_markdown, render_markdown, params_markdown, template_kind, image_url, image_position, accent_color, min_role, status, created_by_email, updated_by_email, created_at, updated_at)
VALUES
  ('tpl-sources-cover', 'fontes-nao-cobrem-tudo', 'Fontes não cobrem tudo', 'Aviso compacto para artigos com fontes insuficientes.', 'Manutenção', '{{Fontes não cobrem tudo|data=junho de 2026|imagem=}}', ':::templatebox sources
title: Esta página cita fontes, mas que não cobrem todo o conteúdo
image: {{{imagem|}}}
icon: 📖
accent: #3f6fa8
compact: sim

Ajude a inserir referências confiáveis. {{{data|}}}
:::', 'data: mês e ano
imagem: imagem lateral opcional', 'sources', NULL, 'left', '#3f6fa8', 'guest', 'active', 'system', 'system', datetime('now'), datetime('now')),
  ('tpl-merge-with', 'fundir-com', 'Fundir com', 'Aviso compacto para fusão de artigo ou seção com outra página.', 'Manutenção', '{{Fundir com|Nome do artigo|data=junho de 2026|imagem=}}', ':::templatebox merge
title: Este artigo ou seção deverá ser fundido com [[{{{1|Nome do artigo}}}]]
image: {{{imagem|}}}
icon: 🔀
accent: #3f6fa8
compact: sim

Se discorda, discuta sobre a fusão na página de discussão daquele artigo. {{{data|}}}
:::', '1/artigo: artigo de destino
data: mês e ano
imagem: imagem lateral opcional', 'merge', NULL, 'left', '#3f6fa8', 'guest', 'active', 'system', 'system', datetime('now'), datetime('now')),
  ('tpl-stub', 'esboco', 'Esboço', 'Aviso compacto para artigo curto que precisa ser expandido.', 'Manutenção', '{{Esboço|artigo|imagem=}}', ':::templatebox stub
title: Este artigo ainda é um esboço
image: {{{imagem|}}}
icon: 🧩
accent: #777777
compact: sim

Você pode ajudar esta wiki expandindo este {{{1|artigo}}}.
:::', '1/tema: tema do esboço
imagem: imagem lateral opcional', 'stub', NULL, 'left', '#777777', 'guest', 'active', 'system', 'system', datetime('now'), datetime('now'))
ON CONFLICT(slug) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  group_name = excluded.group_name,
  content_markdown = excluded.content_markdown,
  render_markdown = excluded.render_markdown,
  params_markdown = excluded.params_markdown,
  template_kind = excluded.template_kind,
  image_url = excluded.image_url,
  image_position = excluded.image_position,
  accent_color = excluded.accent_color,
  min_role = excluded.min_role,
  status = excluded.status,
  updated_by_email = excluded.updated_by_email,
  updated_at = excluded.updated_at;
