PRAGMA foreign_keys = ON;

CREATE TABLE content_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  research_item_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  target_action TEXT NOT NULL DEFAULT 'engagement' CHECK (target_action IN ('engagement','reply','profile_click','share','dwell','follow','conversion')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','rejected','published')),
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  current_hook TEXT NOT NULL DEFAULT '',
  current_body TEXT NOT NULL,
  current_angle TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL,
  duplicate_score INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_score BETWEEN 0 AND 100),
  duplicate_draft_id TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  archived_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES x_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (research_item_id) REFERENCES research_items(id) ON DELETE SET NULL,
  FOREIGN KEY (duplicate_draft_id) REFERENCES content_drafts(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX idx_content_drafts_workspace_status ON content_drafts(workspace_id, archived_at, status, updated_at);
CREATE INDEX idx_content_drafts_account_status ON content_drafts(account_id, archived_at, status, updated_at);
CREATE INDEX idx_content_drafts_hash ON content_drafts(account_id, content_hash, archived_at);

CREATE TABLE draft_versions (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number >= 1),
  hook TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  angle TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','edit')),
  ai_provider TEXT NOT NULL DEFAULT '',
  ai_model TEXT NOT NULL DEFAULT '',
  ai_metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (draft_id) REFERENCES content_drafts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX uq_draft_versions_number ON draft_versions(draft_id, version_number);
CREATE INDEX idx_draft_versions_workspace_draft ON draft_versions(workspace_id, draft_id, version_number);

CREATE TABLE draft_feedback (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  version_id TEXT,
  user_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('submit','approve','reject','publish','note')),
  reason_code TEXT NOT NULL DEFAULT '' CHECK (reason_code IN ('','off_voice','too_generic','too_salesy','fact_risk','duplicate','weak_hook','other')),
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (draft_id) REFERENCES content_drafts(id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES draft_versions(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX idx_draft_feedback_workspace_draft ON draft_feedback(workspace_id, draft_id, created_at);

CREATE TABLE voice_memories (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('preference','avoidance','observation')),
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','feedback')),
  source_draft_id TEXT,
  created_by_user_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES x_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (source_draft_id) REFERENCES content_drafts(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX idx_voice_memories_account ON voice_memories(account_id, archived_at, active, created_at);
