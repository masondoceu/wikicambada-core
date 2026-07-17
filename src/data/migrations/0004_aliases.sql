CREATE TABLE IF NOT EXISTS page_aliases (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  alias_slug TEXT NOT NULL UNIQUE,
  alias_title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_page_aliases_page ON page_aliases(page_id);
CREATE INDEX IF NOT EXISTS idx_page_aliases_slug ON page_aliases(alias_slug);
