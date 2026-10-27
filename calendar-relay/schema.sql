CREATE TABLE IF NOT EXISTS feeds (
  account_key TEXT PRIMARY KEY,
  token TEXT,
  token_hash TEXT UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  events TEXT NOT NULL DEFAULT '[]'
);
