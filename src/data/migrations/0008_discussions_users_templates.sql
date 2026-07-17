PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS content_templates (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  group_name TEXT NOT NULL DEFAULT 'Geral',
  content_markdown TEXT NOT NULL,
  min_role TEXT NOT NULL DEFAULT 'guest',
  status TEXT NOT NULL DEFAULT 'active',
  created_by_email TEXT,
  updated_by_email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (min_role IN ('guest', 'editor', 'moderator', 'admin', 'super_admin')),
  CHECK (status IN ('active', 'disabled'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_content_templates_slug ON content_templates(slug);
CREATE INDEX IF NOT EXISTS idx_content_templates_status ON content_templates(status);
CREATE INDEX IF NOT EXISTS idx_content_templates_group ON content_templates(group_name, title);

INSERT INTO content_templates (id, slug, title, description, group_name, content_markdown, min_role, status, created_by_email, updated_by_email, created_at, updated_at)
VALUES
  ('tpl-delete-candidate', 'candidato-a-exclusao', 'Candidato à exclusão', 'Caixa vermelha para páginas que podem ser removidas após discussão.', 'Manutenção', ':::messagebox erro\ntitle: Esta página é candidata à exclusão\n\nMotivo: descreva o motivo aqui. Se discordar, explique na página de discussão antes de remover este aviso.\n:::', 'guest', 'active', 'system', 'system', datetime('now'), datetime('now')),
  ('tpl-multiple-issues', 'multiplos-problemas', 'Múltiplos problemas', 'Aviso de manutenção com lista de problemas editoriais.', 'Manutenção', ':::messagebox aviso\ntitle: Esta página possui múltiplos problemas\n\n- Ela cita poucas ou nenhuma fonte.\n- Ela pode estar confusa ou incompleta.\n- Ela pode conter links quebrados.\n- Ela pode conter informação desatualizada.\n:::', 'guest', 'active', 'system', 'system', datetime('now'), datetime('now')),
  ('tpl-note', 'nota-simples', 'Nota simples', 'Caixa informativa curta.', 'Caixas', ':::messagebox info\ntitle: Nota\n\nEscreva a observação aqui.\n:::', 'guest', 'active', 'system', 'system', datetime('now'), datetime('now')),
  ('tpl-background', 'fundo-de-secao', 'Fundo de seção', 'Bloco com cor, gradiente ou imagem de fundo.', 'Layout', ':::background\ntitle: Seção destacada\ncolor: #f8f9fa\ngradient: linear-gradient(180deg, rgba(255,255,255,.85), rgba(255,255,255,.65))\nimage: \n\nConteúdo da seção com fundo.\n:::', 'editor', 'active', 'system', 'system', datetime('now'), datetime('now')),
  ('tpl-side-image', 'imagem-lateral', 'Imagem lateral', 'Miniatura lateral com legenda e link para a página do arquivo.', 'Mídia', ':::thumb\nsrc: /api/files/arquivo/content\nalt: descrição da imagem\ncaption: legenda da imagem\ndetails: /wiki/arquivo/arquivo\nalign: right\nwidth: 260\n:::', 'guest', 'active', 'system', 'system', datetime('now'), datetime('now')),
  ('tpl-top-image', 'imagem-no-topo', 'Imagem grande no topo', 'Imagem grande em destaque.', 'Mídia', ':::image\nsrc: /api/files/arquivo/content\nalt: descrição da imagem\ncaption: legenda da imagem\ndetails: /wiki/arquivo/arquivo\n:::', 'guest', 'active', 'system', 'system', datetime('now'), datetime('now')),
  ('tpl-internal-links', 'links-internos', 'Links internos', 'Atalhos para artigo, usuário e discussão.', 'Links', 'Veja também: [[Outro artigo]], [[Usuário:Nome]] e [[Discussão:Outro artigo]].', 'guest', 'active', 'system', 'system', datetime('now'), datetime('now'))
ON CONFLICT(slug) DO NOTHING;
