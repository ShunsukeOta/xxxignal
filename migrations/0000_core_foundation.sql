PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'personal' CHECK (plan IN ('personal', 'beta', 'pro')),
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

CREATE TABLE IF NOT EXISTS x_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  handle TEXT NOT NULL,
  display_name TEXT NOT NULL,
  niche TEXT NOT NULL DEFAULT '',
  target_audience TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT '',
  monetization_goal TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE (workspace_id, handle)
);

CREATE INDEX IF NOT EXISTS idx_x_accounts_workspace ON x_accounts(workspace_id, archived_at, sort_order);

CREATE TABLE IF NOT EXISTS account_strategies (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES x_accounts(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  primary_goal TEXT NOT NULL DEFAULT 'growth' CHECK (primary_goal IN ('growth', 'traffic', 'sales', 'brand', 'community')),
  content_pillars_json TEXT NOT NULL DEFAULT '[]',
  forbidden_topics_json TEXT NOT NULL DEFAULT '[]',
  posting_target_per_day INTEGER NOT NULL DEFAULT 1 CHECK (posting_target_per_day BETWEEN 0 AND 20),
  monetization_type TEXT NOT NULL DEFAULT 'none' CHECK (monetization_type IN ('none', 'affiliate', 'product', 'service', 'creator_rewards', 'other')),
  funnel_notes TEXT NOT NULL DEFAULT '',
  strategy_memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_account_strategies_workspace ON account_strategies(workspace_id);

CREATE TABLE IF NOT EXISTS voice_profiles (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES x_accounts(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  tone_keywords_json TEXT NOT NULL DEFAULT '[]',
  sentence_style TEXT NOT NULL DEFAULT 'mixed' CHECK (sentence_style IN ('short', 'mixed', 'long')),
  politeness TEXT NOT NULL DEFAULT 'neutral' CHECK (politeness IN ('casual', 'neutral', 'polite')),
  emoji_usage TEXT NOT NULL DEFAULT 'low' CHECK (emoji_usage IN ('none', 'low', 'medium', 'high')),
  assertiveness TEXT NOT NULL DEFAULT 'balanced' CHECK (assertiveness IN ('soft', 'balanced', 'strong')),
  preferred_phrases_json TEXT NOT NULL DEFAULT '[]',
  banned_phrases_json TEXT NOT NULL DEFAULT '[]',
  sample_posts TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_voice_profiles_workspace ON voice_profiles(workspace_id);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, key)
);

CREATE INDEX IF NOT EXISTS idx_settings_workspace ON settings(workspace_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  account_id TEXT REFERENCES x_accounts(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_created ON audit_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_account_created ON audit_logs(account_id, created_at DESC);
