PRAGMA foreign_keys = ON;

UPDATE content_templates
SET
  content_markdown = '{{Infobox
|titulo=Nome
|imagem=/api/files/arquivo/content
|tipo=tipo ou categoria
|criador=alguém
|data=2026
|campo livre=valor livre
}}',
  params_markdown = 'titulo: título exibido na infobox
imagem: imagem opcional
legenda: legenda da imagem
subtitulo: subtítulo opcional
qualquer outro campo: vira uma linha livre na infocaixa',
  updated_at = datetime('now')
WHERE slug = 'infobox';
