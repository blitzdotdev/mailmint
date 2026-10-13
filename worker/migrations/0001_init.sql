-- Inboxes: one row per address. API-created inboxes carry a capability token
-- (only its SHA-256 is stored); auto-created ones (catch-all) have none until claimed.
CREATE TABLE inboxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL UNIQUE COLLATE NOCASE,
  token_hash TEXT UNIQUE,
  origin TEXT NOT NULL CHECK (origin IN ('api', 'auto')),
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT
);
CREATE INDEX inboxes_expires ON inboxes (expires_at);
CREATE INDEX inboxes_recent ON inboxes (last_message_at DESC);

-- Messages. AUTOINCREMENT keeps ids strictly increasing (never reused), which the
-- wait cursor (`since`) and the InboxSignal high-water mark rely on.
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inbox_id INTEGER NOT NULL REFERENCES inboxes (id) ON DELETE CASCADE,
  rfc_message_id TEXT NOT NULL,
  envelope_from TEXT NOT NULL,
  envelope_to TEXT NOT NULL COLLATE NOCASE,
  tag TEXT COLLATE NOCASE,
  from_address TEXT COLLATE NOCASE,
  from_name TEXT,
  subject TEXT NOT NULL DEFAULT '',
  text_body TEXT,
  html_body TEXT,
  html_truncated INTEGER NOT NULL DEFAULT 0,
  codes_json TEXT NOT NULL DEFAULT '[]',
  links_json TEXT NOT NULL DEFAULT '[]',
  best_code TEXT,
  best_link TEXT,
  attachments_json TEXT NOT NULL DEFAULT '[]',
  raw_key TEXT NOT NULL,
  size INTEGER NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (inbox_id, rfc_message_id)
);
CREATE INDEX messages_inbox ON messages (inbox_id, id);

-- Owner API keys for the REST API / CLI (bm_key_…). Only the SHA-256 is stored.
CREATE TABLE api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by TEXT,
  last_used_at TEXT,
  revoked_at TEXT
);

-- Daily abuse counters, keyed (UTC day, counter name).
CREATE TABLE daily_counters (
  day TEXT NOT NULL,
  key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, key)
);

-- One-time MCP OAuth consent transactions (ported from cf-mailroom).
CREATE TABLE oauth_authorization_transactions (
  token_hash TEXT PRIMARY KEY,
  owner_sub TEXT NOT NULL,
  auth_request_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX oauth_authorization_transactions_expires ON oauth_authorization_transactions (expires_at);
