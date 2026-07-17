CREATE TABLE IF NOT EXISTS ip_rules (
  id TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by_email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (action IN ('block_suggestions', 'ban_site')),
  CHECK (status IN ('active', 'disabled'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_ip_rules_ip_action ON ip_rules(ip, action, status);
CREATE INDEX IF NOT EXISTS idx_ip_rules_created ON ip_rules(created_at DESC);
