CREATE TABLE IF NOT EXISTS global_settings (
  setting_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_email TEXT
);

CREATE INDEX IF NOT EXISTS idx_global_settings_updated_at
  ON global_settings(updated_at DESC);
