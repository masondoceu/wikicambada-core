ALTER TABLE uploads ADD COLUMN file_slug TEXT;
ALTER TABLE uploads ADD COLUMN description TEXT;
ALTER TABLE uploads ADD COLUMN updated_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_uploads_file_slug ON uploads(file_slug);
CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads(created_at DESC);
