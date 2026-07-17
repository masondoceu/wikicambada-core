PRAGMA foreign_keys = ON;

ALTER TABLE editor_profiles ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE editor_profiles ADD COLUMN last_seen_at TEXT;
ALTER TABLE editor_profiles ADD COLUMN last_seen_ip TEXT;
ALTER TABLE editor_profiles ADD COLUMN last_seen_path TEXT;
ALTER TABLE editor_profiles ADD COLUMN last_seen_user_agent TEXT;

ALTER TABLE pages ADD COLUMN deleted_at TEXT;
ALTER TABLE pages ADD COLUMN deleted_by_email TEXT;
ALTER TABLE pages ADD COLUMN purge_after TEXT;
ALTER TABLE pages ADD COLUMN deleted_reason TEXT;

ALTER TABLE uploads ADD COLUMN status TEXT NOT NULL DEFAULT 'published';
ALTER TABLE uploads ADD COLUMN deleted_at TEXT;
ALTER TABLE uploads ADD COLUMN deleted_by_email TEXT;
ALTER TABLE uploads ADD COLUMN purge_after TEXT;

ALTER TABLE edit_proposals ADD COLUMN reviewed_by_name TEXT;
ALTER TABLE edit_proposals ADD COLUMN suggestion_credit_mode TEXT DEFAULT 'contact';

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  role TEXT,
  ip TEXT,
  path TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_activity_events_created ON activity_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_ip_created ON activity_events(ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_email_created ON activity_events(email, created_at DESC);
