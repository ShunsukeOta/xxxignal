PRAGMA foreign_keys = ON;

CREATE TABLE x_connections (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  x_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL DEFAULT '',
  token_expires_at TEXT,
  scopes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','error','revoked')),
  last_error TEXT NOT NULL DEFAULT '',
  connected_at TEXT NOT NULL,
  last_refreshed_at TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES x_accounts(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX uq_x_connections_account ON x_connections(workspace_id, account_id);
CREATE UNIQUE INDEX uq_x_connections_x_user ON x_connections(workspace_id, x_user_id);
CREATE INDEX idx_x_connections_workspace_status ON x_connections(workspace_id, status, updated_at);

CREATE TABLE x_oauth_states (
  state TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  code_verifier_enc TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES x_accounts(id) ON DELETE CASCADE
);
CREATE INDEX idx_x_oauth_states_expires ON x_oauth_states(expires_at);

CREATE TABLE x_posts (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  x_post_id TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  conversation_id TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT '',
  x_created_at TEXT,
  public_metrics_json TEXT NOT NULL DEFAULT '{}',
  non_public_metrics_json TEXT NOT NULL DEFAULT '{}',
  organic_metrics_json TEXT NOT NULL DEFAULT '{}',
  fetched_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES x_accounts(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX uq_x_posts_workspace_post ON x_posts(workspace_id, x_post_id);
CREATE INDEX idx_x_posts_account_created ON x_posts(account_id, x_created_at, updated_at);

CREATE TABLE x_post_metric_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  impression_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  repost_count INTEGER NOT NULL DEFAULT 0,
  quote_count INTEGER NOT NULL DEFAULT 0,
  bookmark_count INTEGER NOT NULL DEFAULT 0,
  url_link_clicks INTEGER NOT NULL DEFAULT 0,
  user_profile_clicks INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES x_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES x_posts(id) ON DELETE CASCADE
);
CREATE INDEX idx_x_metric_snapshots_post_time ON x_post_metric_snapshots(post_id, captured_at);
CREATE INDEX idx_x_metric_snapshots_account_time ON x_post_metric_snapshots(account_id, captured_at);

CREATE TABLE x_api_cache (
  cache_key TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT,
  endpoint TEXT NOT NULL,
  response_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES x_accounts(id) ON DELETE CASCADE
);
CREATE INDEX idx_x_api_cache_workspace_expires ON x_api_cache(workspace_id, expires_at);

CREATE TABLE x_cost_ledger (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT,
  provider TEXT NOT NULL DEFAULT 'x',
  operation TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT '',
  units INTEGER NOT NULL DEFAULT 0 CHECK (units >= 0),
  unit_cost_microusd INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_microusd >= 0),
  estimated_cost_microusd INTEGER NOT NULL DEFAULT 0 CHECK (estimated_cost_microusd >= 0),
  pricing_version TEXT NOT NULL,
  request_id TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES x_accounts(id) ON DELETE SET NULL
);
CREATE INDEX idx_x_cost_ledger_workspace_time ON x_cost_ledger(workspace_id, created_at);
CREATE INDEX idx_x_cost_ledger_account_time ON x_cost_ledger(account_id, created_at);

CREATE TABLE x_budget_settings (
  workspace_id TEXT PRIMARY KEY NOT NULL,
  monthly_budget_microusd INTEGER NOT NULL DEFAULT 5000000 CHECK (monthly_budget_microusd >= 0),
  warning_percent INTEGER NOT NULL DEFAULT 80 CHECK (warning_percent BETWEEN 1 AND 100),
  hard_limit_enabled INTEGER NOT NULL DEFAULT 1 CHECK (hard_limit_enabled IN (0,1)),
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE x_sync_runs (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('posts','mentions')),
  status TEXT NOT NULL CHECK (status IN ('running','success','error','blocked')),
  requested_limit INTEGER NOT NULL DEFAULT 0,
  returned_count INTEGER NOT NULL DEFAULT 0,
  estimated_cost_microusd INTEGER NOT NULL DEFAULT 0,
  error_message TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES x_accounts(id) ON DELETE CASCADE
);
CREATE INDEX idx_x_sync_runs_account_time ON x_sync_runs(account_id, started_at);

CREATE TABLE x_engagement_inbox (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  x_post_id TEXT NOT NULL,
  author_id TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  x_created_at TEXT,
  public_metrics_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','acted','ignored')),
  first_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES x_accounts(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX uq_x_engagement_inbox_post ON x_engagement_inbox(workspace_id, account_id, x_post_id);
CREATE INDEX idx_x_engagement_inbox_account_status ON x_engagement_inbox(account_id, status, x_created_at);
