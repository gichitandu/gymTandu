CREATE TABLE IF NOT EXISTS feeds (
  account_key TEXT PRIMARY KEY,
  token TEXT,
  token_hash TEXT UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  events TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS push_accounts (
 account_key TEXT PRIMARY KEY,
 time TEXT NOT NULL DEFAULT '08:30',
 timezone TEXT NOT NULL DEFAULT 'Europe/Rome',
 every_day INTEGER NOT NULL DEFAULT 0,
 events TEXT NOT NULL DEFAULT '[]',
 revision INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS push_devices (
 id TEXT PRIMARY KEY,
 account_key TEXT NOT NULL,
 endpoint TEXT UNIQUE NOT NULL,
 next_due INTEGER NOT NULL,
 due_day TEXT NOT NULL,
 lease_until INTEGER NOT NULL DEFAULT 0,
 last_sent_day TEXT,
 failures INTEGER NOT NULL DEFAULT 0,
 last_test_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS push_devices_due ON push_devices(next_due,lease_until);
CREATE INDEX IF NOT EXISTS push_devices_account ON push_devices(account_key);
CREATE TABLE IF NOT EXISTS hub_reminders (
 account_key TEXT NOT NULL,
 id TEXT NOT NULL,
 due_at INTEGER NOT NULL,
 sent_at INTEGER,
 acked INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(account_key,id)
);
CREATE INDEX IF NOT EXISTS hub_reminders_due ON hub_reminders(sent_at,due_at);
CREATE TABLE IF NOT EXISTS hub_feed (
 account_key TEXT PRIMARY KEY,
 events TEXT NOT NULL DEFAULT '[]'
);
