PRAGMA foreign_keys = ON;

ALTER TABLE activity_events ADD COLUMN ip_country TEXT;
ALTER TABLE activity_events ADD COLUMN ip_region TEXT;
ALTER TABLE activity_events ADD COLUMN ip_city TEXT;
ALTER TABLE activity_events ADD COLUMN ip_timezone TEXT;
ALTER TABLE activity_events ADD COLUMN ip_colo TEXT;

CREATE INDEX IF NOT EXISTS idx_activity_events_country_created ON activity_events(ip_country, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pages_title_search ON pages(title COLLATE NOCASE);
