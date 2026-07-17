PRAGMA foreign_keys = ON;

UPDATE content_templates
SET
  content_markdown = '{{Infobox
|titulo=Nome
|imagem=/api/files/arquivo/content
|legenda=Legenda da imagem
|imagem2=/api/files/outra-versao/content
|legenda2=Outra variação
|Tipo=tipo ou categoria
|Criador=alguém
|Data=2026
|Campo livre=valor livre
}}',
  render_markdown = ':::infobox
title: {{{titulo|Nome}}}
image: {{{imagem|}}}
caption: {{{legenda|}}}
image2: {{{imagem2|}}}
caption2: {{{legenda2|}}}
Tipo: {{{tipo|}}}
Criador: {{{criador|}}}
Data: {{{data|}}}
Campo livre: {{{campo livre|}}}
:::',
  params_markdown = 'titulo: título exibido na infobox
imagem/imagem2: uma ou mais imagens
legenda/legenda2: legenda correspondente
subtitulo: subtítulo opcional
qualquer outro campo: vira uma linha livre na infocaixa, preservando acentos e caixa',
  updated_at = datetime('now')
WHERE slug = 'infobox';

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
  'tpl-video-embed',
  'video',
  'Vídeo incorporado',
  'Bloco de vídeo para arquivo direto ou YouTube. Sistema de templates em fase de testes.',
  'Mídia',
  ':::video
youtube: https://youtu.be/id-do-video
title: Título do vídeo
caption: Legenda do vídeo
:::',
  '',
  'src/youtube: link do vídeo
titulo: título opcional
legenda: legenda opcional',
  'media',
  '',
  'top',
  '',
  'guest',
  'active',
  'system',
  'system',
  datetime('now'),
  datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM content_templates WHERE slug = 'video');
