PRAGMA foreign_keys = ON;

CREATE TABLE opportunities (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('research','mention','manual')),
  source_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  urgency INTEGER NOT NULL DEFAULT 0 CHECK (urgency BETWEEN 0 AND 100),
  fit INTEGER NOT NULL DEFAULT 0 CHECK (fit BETWEEN 0 AND 100),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','planned','done','dismissed')),
  scheduled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES x_accounts(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX uq_opportunities_source ON opportunities(workspace_id, source_type, source_id) WHERE source_id <> '';
CREATE INDEX idx_opportunities_workspace_score ON opportunities(workspace_id, status, score, updated_at);
CREATE INDEX idx_opportunities_account ON opportunities(account_id, status, score);

CREATE TABLE calendar_items (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  draft_id TEXT,
  opportunity_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('publish','followup','research','manual')),
  title TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','cancelled')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES x_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (draft_id) REFERENCES content_drafts(id) ON DELETE SET NULL,
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL
);
CREATE INDEX idx_calendar_workspace_time ON calendar_items(workspace_id, status, scheduled_for);
CREATE INDEX idx_calendar_account_time ON calendar_items(account_id, status, scheduled_for);

CREATE TABLE weekly_learnings (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT,
  week_start TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('workspace','account')),
  summary TEXT NOT NULL DEFAULT '',
  winners_json TEXT NOT NULL DEFAULT '[]',
  observations_json TEXT NOT NULL DEFAULT '[]',
  recommendations_json TEXT NOT NULL DEFAULT '[]',
  sample_size INTEGER NOT NULL DEFAULT 0 CHECK (sample_size >= 0),
  generated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES x_accounts(id) ON DELETE CASCADE
);
CREATE INDEX idx_weekly_learnings_workspace_week ON weekly_learnings(workspace_id, week_start, scope);
CREATE INDEX idx_weekly_learnings_account_week ON weekly_learnings(account_id, week_start);

CREATE TABLE attribution_links (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  draft_id TEXT,
  label TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  tracking_key TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES x_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (draft_id) REFERENCES content_drafts(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX uq_attribution_links_tracking_key ON attribution_links(tracking_key);
CREATE INDEX idx_attribution_links_workspace ON attribution_links(workspace_id, account_id, active);

CREATE TABLE attribution_events (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  link_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('click','conversion','revenue')),
  amount_micros INTEGER NOT NULL DEFAULT 0 CHECK (amount_micros >= 0),
  currency TEXT NOT NULL DEFAULT 'JPY',
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (link_id) REFERENCES attribution_links(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES x_accounts(id) ON DELETE CASCADE
);
CREATE INDEX idx_attribution_events_workspace_time ON attribution_events(workspace_id, occurred_at);
CREATE INDEX idx_attribution_events_link_time ON attribution_events(link_id, occurred_at);
CREATE INDEX idx_attribution_events_account_time ON attribution_events(account_id, occurred_at);
