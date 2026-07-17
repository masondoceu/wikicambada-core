PRAGMA foreign_keys = ON;

UPDATE content_templates
SET
  content_markdown = replace(replace(content_markdown, '\r\n', char(10)), '\n', char(10)),
  render_markdown = replace(replace(COALESCE(render_markdown, ''), '\r\n', char(10)), '\n', char(10)),
  params_markdown = replace(replace(COALESCE(params_markdown, ''), '\r\n', char(10)), '\n', char(10)),
  updated_at = datetime('now')
WHERE content_markdown LIKE '%\n%'
   OR render_markdown LIKE '%\n%'
   OR params_markdown LIKE '%\n%';

INSERT INTO content_templates (
  id,
  slug,
  title,
  description,
  group_name,
  content_markdown,
  render_markdown,
  params_markdown,
  template_kind,
  image_url,
  image_position,
  accent_color,
  min_role,
  status,
  created_by_email,
  updated_by_email,
  created_at,
  updated_at
)
SELECT
  'tpl-infobox-basic',
  'infobox',
  'Infobox',
  'Predefinição lateral para dados resumidos de um artigo. Sistema de templates em fase de testes.',
  'Layout',
  '{{Infobox
|titulo=Nome
|imagem=/api/files/arquivo/content
|tipo=tipo ou categoria
|criador=alguém
|data=2026
}}',
  ':::infobox
image: {{{imagem|}}}
tipo: {{{tipo|}}}
criador: {{{criador|}}}
data: {{{data|}}}
:::',
  'titulo: título exibido na infobox
imagem: imagem opcional
tipo: tipo ou categoria
criador: autor/criador
data: data principal',
  'infobox',
  '',
  'right',
  '#3f6fa8',
  'guest',
  'active',
  'system',
  'system',
  datetime('now'),
  datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM content_templates WHERE slug = 'infobox');
