CREATE TABLE core_recovery_lock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  token TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('backup', 'restore')),
  owner_email TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'transfer',
  allow_write INTEGER NOT NULL DEFAULT 0 CHECK (allow_write IN (0, 1)),
  manifest_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE core_recovery_objects (
  r2_key TEXT PRIMARY KEY,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT,
  etag TEXT,
  metadata_json TEXT,
  stored INTEGER NOT NULL DEFAULT 0 CHECK (stored IN (0, 1))
);

CREATE TABLE core_recovery_chunks (
  chunk_id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL
);

CREATE TRIGGER recovery_editor_profiles_insert BEFORE INSERT ON editor_profiles
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_editor_profiles_update BEFORE UPDATE ON editor_profiles
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_editor_profiles_delete BEFORE DELETE ON editor_profiles
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_pages_insert BEFORE INSERT ON pages
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_pages_update BEFORE UPDATE ON pages
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_pages_delete BEFORE DELETE ON pages
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_revisions_insert BEFORE INSERT ON revisions
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_revisions_update BEFORE UPDATE ON revisions
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_revisions_delete BEFORE DELETE ON revisions
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_redirects_insert BEFORE INSERT ON redirects
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_redirects_update BEFORE UPDATE ON redirects
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_redirects_delete BEFORE DELETE ON redirects
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_categories_insert BEFORE INSERT ON categories
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_categories_update BEFORE UPDATE ON categories
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_categories_delete BEFORE DELETE ON categories
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_page_categories_insert BEFORE INSERT ON page_categories
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_page_categories_update BEFORE UPDATE ON page_categories
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_page_categories_delete BEFORE DELETE ON page_categories
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_page_links_insert BEFORE INSERT ON page_links
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_page_links_update BEFORE UPDATE ON page_links
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_page_links_delete BEFORE DELETE ON page_links
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_uploads_insert BEFORE INSERT ON uploads
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_uploads_update BEFORE UPDATE ON uploads
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_uploads_delete BEFORE DELETE ON uploads
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_system_settings_insert BEFORE INSERT ON system_settings
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_system_settings_update BEFORE UPDATE ON system_settings
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_system_settings_delete BEFORE DELETE ON system_settings
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_edit_proposals_insert BEFORE INSERT ON edit_proposals
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_edit_proposals_update BEFORE UPDATE ON edit_proposals
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_edit_proposals_delete BEFORE DELETE ON edit_proposals
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_page_aliases_insert BEFORE INSERT ON page_aliases
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_page_aliases_update BEFORE UPDATE ON page_aliases
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_page_aliases_delete BEFORE DELETE ON page_aliases
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_ip_rules_insert BEFORE INSERT ON ip_rules
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_ip_rules_update BEFORE UPDATE ON ip_rules
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_ip_rules_delete BEFORE DELETE ON ip_rules
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_activity_events_insert BEFORE INSERT ON activity_events
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_activity_events_update BEFORE UPDATE ON activity_events
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_activity_events_delete BEFORE DELETE ON activity_events
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_content_templates_insert BEFORE INSERT ON content_templates
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_content_templates_update BEFORE UPDATE ON content_templates
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_content_templates_delete BEFORE DELETE ON content_templates
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_global_settings_insert BEFORE INSERT ON global_settings
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_global_settings_update BEFORE UPDATE ON global_settings
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_global_settings_delete BEFORE DELETE ON global_settings
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_core_write_guards_insert BEFORE INSERT ON core_write_guards
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_core_write_guards_update BEFORE UPDATE ON core_write_guards
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_core_write_guards_delete BEFORE DELETE ON core_write_guards
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_proposal_rate_limits_insert BEFORE INSERT ON proposal_rate_limits
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_proposal_rate_limits_update BEFORE UPDATE ON proposal_rate_limits
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_proposal_rate_limits_delete BEFORE DELETE ON proposal_rate_limits
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_r2_cleanup_insert BEFORE INSERT ON r2_cleanup
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_r2_cleanup_update BEFORE UPDATE ON r2_cleanup
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

CREATE TRIGGER recovery_r2_cleanup_delete BEFORE DELETE ON r2_cleanup
WHEN EXISTS (SELECT 1 FROM core_recovery_lock WHERE allow_write = 0)
BEGIN SELECT RAISE(ABORT, 'wiki_recovery_locked'); END;

