PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS editor_profiles (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'editor',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  namespace TEXT NOT NULL DEFAULT 'article',
  status TEXT NOT NULL DEFAULT 'published',
  is_locked INTEGER NOT NULL DEFAULT 0,
  current_revision_id TEXT,
  created_by_email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (namespace IN ('article', 'special', 'file', 'category', 'project')),
  CHECK (status IN ('published', 'draft', 'deleted')),
  CHECK (is_locked IN (0, 1))
) STRICT;

CREATE TABLE IF NOT EXISTS revisions (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  author_email TEXT NOT NULL,
  author_name TEXT,
  content_markdown TEXT NOT NULL,
  content_html TEXT,
  content_hash TEXT,
  summary TEXT NOT NULL DEFAULT 'sem resumo',
  created_at TEXT NOT NULL,
  UNIQUE (page_id, revision_number),
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug);
CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(status);
CREATE INDEX IF NOT EXISTS idx_revisions_page ON revisions(page_id, revision_number DESC);

CREATE TABLE IF NOT EXISTS redirects (
  id TEXT PRIMARY KEY,
  from_slug TEXT NOT NULL UNIQUE,
  to_slug TEXT NOT NULL,
  created_by_email TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_redirects_from_slug ON redirects(from_slug);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS page_categories (
  page_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  PRIMARY KEY (page_id, category_id),
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_page_categories_category ON page_categories(category_id);

CREATE TABLE IF NOT EXISTS page_links (
  from_page_id TEXT NOT NULL,
  to_slug TEXT NOT NULL,
  link_label TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (from_page_id, to_slug),
  FOREIGN KEY (from_page_id) REFERENCES pages(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_page_links_to_slug ON page_links(to_slug);

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  uploaded_by_email TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_uploads_r2_key ON uploads(r2_key);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE VIRTUAL TABLE IF NOT EXISTS page_search USING fts5(
  page_id UNINDEXED,
  slug UNINDEXED,
  title,
  subtitle,
  content_markdown
);
