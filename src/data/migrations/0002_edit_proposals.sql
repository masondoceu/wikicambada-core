CREATE TABLE IF NOT EXISTS edit_proposals (
  id TEXT PRIMARY KEY,
  page_slug TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  content_markdown TEXT NOT NULL,
  categories_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT 'proposta enviada por visitante',
  contact TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reporter_ip TEXT,
  user_agent TEXT,
  reviewed_by_email TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (status IN ('pending', 'approved', 'rejected'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_edit_proposals_status_created ON edit_proposals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_edit_proposals_page_slug ON edit_proposals(page_slug);
