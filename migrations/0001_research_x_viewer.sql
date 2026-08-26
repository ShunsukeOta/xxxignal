PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS research_sources (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('rss', 'web', 'manual')),
  url TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_sources_workspace ON research_sources(workspace_id, archived_at, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_research_sources_workspace_url ON research_sources(workspace_id, url);

CREATE TABLE IF NOT EXISTS research_targets (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  handle TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'competitor' CHECK (role IN ('competitor', 'target', 'reference')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_targets_workspace ON research_targets(workspace_id, archived_at, role);
CREATE UNIQUE INDEX IF NOT EXISTS uq_research_targets_workspace_handle ON research_targets(workspace_id, handle);

CREATE TABLE IF NOT EXISTS research_items (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_id TEXT REFERENCES research_sources(id) ON DELETE SET NULL,
  account_id TEXT REFERENCES x_accounts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('rss', 'web', 'x_post', 'manual')),
  external_key TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_items_workspace ON research_items(workspace_id, archived_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_items_account ON research_items(account_id, archived_at, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_research_items_source_key ON research_items(workspace_id, source_id, external_key) WHERE external_key <> '';
