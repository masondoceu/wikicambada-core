CREATE TABLE core_write_guards (
  id TEXT PRIMARY KEY,
  accepted INTEGER NOT NULL CONSTRAINT wiki_write_conflict CHECK (accepted = 1)
);

CREATE TABLE proposal_rate_limits (
  client_hash TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

CREATE TABLE r2_cleanup (
  r2_key TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
