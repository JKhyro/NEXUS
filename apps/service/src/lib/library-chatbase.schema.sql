CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by_identity_id TEXT NOT NULL,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  channel_id TEXT NULL,
  post_id TEXT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by_identity_id TEXT NOT NULL,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  author_identity_id TEXT NOT NULL,
  body TEXT NOT NULL,
  source_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  attachment_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  url TEXT NOT NULL,
  bytes BIGINT NOT NULL DEFAULT 0,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS relays (
  id TEXT PRIMARY KEY,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  message_id TEXT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  source_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
