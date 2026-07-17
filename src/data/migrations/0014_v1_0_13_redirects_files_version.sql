-- v1.0.13
-- permite redirecionamentos para seções específicas

ALTER TABLE redirects ADD COLUMN target_fragment TEXT;

CREATE INDEX IF NOT EXISTS idx_redirects_to_slug ON redirects(to_slug);
