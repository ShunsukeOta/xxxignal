import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey().notNull(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan', { enum: ['personal', 'beta', 'pro'] }).notNull().default('personal'),
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const workspaceMembers = sqliteTable(
  'workspace_members',
  {
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'admin', 'editor', 'viewer'] }).notNull().default('owner'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index('idx_workspace_members_user').on(table.userId),
  ],
)

export const xAccounts = sqliteTable(
  'x_accounts',
  {
    id: text('id').primaryKey().notNull(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    handle: text('handle').notNull(),
    displayName: text('display_name').notNull(),
    niche: text('niche').notNull().default(''),
    targetAudience: text('target_audience').notNull().default(''),
    purpose: text('purpose').notNull().default(''),
    monetizationGoal: text('monetization_goal').notNull().default(''),
    timezone: text('timezone').notNull().default('Asia/Tokyo'),
    notes: text('notes').notNull().default(''),
    status: text('status', { enum: ['draft', 'active', 'paused'] }).notNull().default('draft'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    archivedAt: text('archived_at'),
  },
  (table) => [
    uniqueIndex('uq_x_accounts_workspace_handle').on(table.workspaceId, table.handle),
    index('idx_x_accounts_workspace').on(table.workspaceId, table.archivedAt, table.sortOrder),
  ],
)

export const accountStrategies = sqliteTable(
  'account_strategies',
  {
    accountId: text('account_id').primaryKey().notNull().references(() => xAccounts.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    primaryGoal: text('primary_goal', { enum: ['growth', 'traffic', 'sales', 'brand', 'community'] }).notNull().default('growth'),
    contentPillarsJson: text('content_pillars_json').notNull().default('[]'),
    forbiddenTopicsJson: text('forbidden_topics_json').notNull().default('[]'),
    postingTargetPerDay: integer('posting_target_per_day').notNull().default(1),
    monetizationType: text('monetization_type', { enum: ['none', 'affiliate', 'product', 'service', 'creator_rewards', 'other'] }).notNull().default('none'),
    funnelNotes: text('funnel_notes').notNull().default(''),
    strategyMemo: text('strategy_memo').notNull().default(''),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_account_strategies_workspace').on(table.workspaceId)],
)

export const voiceProfiles = sqliteTable(
  'voice_profiles',
  {
    accountId: text('account_id').primaryKey().notNull().references(() => xAccounts.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    toneKeywordsJson: text('tone_keywords_json').notNull().default('[]'),
    sentenceStyle: text('sentence_style', { enum: ['short', 'mixed', 'long'] }).notNull().default('mixed'),
    politeness: text('politeness', { enum: ['casual', 'neutral', 'polite'] }).notNull().default('neutral'),
    emojiUsage: text('emoji_usage', { enum: ['none', 'low', 'medium', 'high'] }).notNull().default('low'),
    assertiveness: text('assertiveness', { enum: ['soft', 'balanced', 'strong'] }).notNull().default('balanced'),
    preferredPhrasesJson: text('preferred_phrases_json').notNull().default('[]'),
    bannedPhrasesJson: text('banned_phrases_json').notNull().default('[]'),
    samplePosts: text('sample_posts').notNull().default(''),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_voice_profiles_workspace').on(table.workspaceId)],
)

export const settings = sqliteTable(
  'settings',
  {
    id: text('id').primaryKey().notNull(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    valueJson: text('value_json').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_settings_workspace_key').on(table.workspaceId, table.key),
    index('idx_settings_workspace').on(table.workspaceId),
  ],
)

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey().notNull(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    accountId: text('account_id').references(() => xAccounts.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    metadataJson: text('metadata_json').notNull().default('{}'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_audit_logs_workspace_created').on(table.workspaceId, table.createdAt),
    index('idx_audit_logs_account_created').on(table.accountId, table.createdAt),
  ],
)

export const researchSources = sqliteTable(
  'research_sources',
  {
    id: text('id').primaryKey().notNull(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['rss', 'web', 'manual'] }).notNull(),
    url: text('url').notNull(),
    notes: text('notes').notNull().default(''),
    lastSyncedAt: text('last_synced_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    archivedAt: text('archived_at'),
  },
  (table) => [
    uniqueIndex('uq_research_sources_workspace_url').on(table.workspaceId, table.url),
    index('idx_research_sources_workspace').on(table.workspaceId, table.archivedAt, table.createdAt),
  ],
)

export const researchTargets = sqliteTable(
  'research_targets',
  {
    id: text('id').primaryKey().notNull(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    handle: text('handle').notNull(),
    displayName: text('display_name').notNull().default(''),
    role: text('role', { enum: ['competitor', 'target', 'reference'] }).notNull().default('competitor'),
    notes: text('notes').notNull().default(''),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    archivedAt: text('archived_at'),
  },
  (table) => [
    uniqueIndex('uq_research_targets_workspace_handle').on(table.workspaceId, table.handle),
    index('idx_research_targets_workspace').on(table.workspaceId, table.archivedAt, table.role),
  ],
)

export const researchItems = sqliteTable(
  'research_items',
  {
    id: text('id').primaryKey().notNull(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    sourceId: text('source_id').references(() => researchSources.id, { onDelete: 'set null' }),
    accountId: text('account_id').references(() => xAccounts.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    url: text('url').notNull().default(''),
    summary: text('summary').notNull().default(''),
    topic: text('topic').notNull().default(''),
    kind: text('kind', { enum: ['rss', 'web', 'x_post', 'manual'] }).notNull().default('manual'),
    externalKey: text('external_key').notNull().default(''),
    publishedAt: text('published_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    archivedAt: text('archived_at'),
  },
  (table) => [
    index('idx_research_items_workspace').on(table.workspaceId, table.archivedAt, table.createdAt),
    index('idx_research_items_account').on(table.accountId, table.archivedAt, table.createdAt),
  ],
)

export const contentDrafts = sqliteTable(
  'content_drafts',
  {
    id: text('id').primaryKey().notNull(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull().references(() => xAccounts.id, { onDelete: 'cascade' }),
    researchItemId: text('research_item_id').references(() => researchItems.id, { onDelete: 'set null' }),
    title: text('title').notNull().default(''),
    targetAction: text('target_action', { enum: ['engagement', 'reply', 'profile_click', 'share', 'dwell', 'follow', 'conversion'] }).notNull().default('engagement'),
    status: text('status', { enum: ['draft', 'review', 'approved', 'rejected', 'published'] }).notNull().default('draft'),
    currentVersion: integer('current_version').notNull().default(1),
    currentHook: text('current_hook').notNull().default(''),
    currentBody: text('current_body').notNull(),
    currentAngle: text('current_angle').notNull().default(''),
    contentHash: text('content_hash').notNull(),
    duplicateScore: integer('duplicate_score').notNull().default(0),
    duplicateDraftId: text('duplicate_draft_id'),
    createdByUserId: text('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    publishedAt: text('published_at'),
    archivedAt: text('archived_at'),
  },
  (table) => [
    index('idx_content_drafts_workspace_status').on(table.workspaceId, table.archivedAt, table.status, table.updatedAt),
    index('idx_content_drafts_account_status').on(table.accountId, table.archivedAt, table.status, table.updatedAt),
    index('idx_content_drafts_hash').on(table.accountId, table.contentHash, table.archivedAt),
  ],
)

export const draftVersions = sqliteTable(
  'draft_versions',
  {
    id: text('id').primaryKey().notNull(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    draftId: text('draft_id').notNull().references(() => contentDrafts.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    hook: text('hook').notNull().default(''),
    body: text('body').notNull(),
    angle: text('angle').notNull().default(''),
    source: text('source', { enum: ['manual', 'ai', 'edit'] }).notNull().default('manual'),
    aiProvider: text('ai_provider').notNull().default(''),
    aiModel: text('ai_model').notNull().default(''),
    aiMetadataJson: text('ai_metadata_json').notNull().default('{}'),
    createdByUserId: text('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_draft_versions_number').on(table.draftId, table.versionNumber),
    index('idx_draft_versions_workspace_draft').on(table.workspaceId, table.draftId, table.versionNumber),
  ],
)

export const draftFeedback = sqliteTable(
  'draft_feedback',
  {
    id: text('id').primaryKey().notNull(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    draftId: text('draft_id').notNull().references(() => contentDrafts.id, { onDelete: 'cascade' }),
    versionId: text('version_id').references(() => draftVersions.id, { onDelete: 'set null' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    decision: text('decision', { enum: ['submit', 'approve', 'reject', 'publish', 'note'] }).notNull(),
    reasonCode: text('reason_code', { enum: ['', 'off_voice', 'too_generic', 'too_salesy', 'fact_risk', 'duplicate', 'weak_hook', 'other'] }).notNull().default(''),
    comment: text('comment').notNull().default(''),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_draft_feedback_workspace_draft').on(table.workspaceId, table.draftId, table.createdAt)],
)

export const voiceMemories = sqliteTable(
  'voice_memories',
  {
    id: text('id').primaryKey().notNull(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull().references(() => xAccounts.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['preference', 'avoidance', 'observation'] }).notNull(),
    content: text('content').notNull(),
    source: text('source', { enum: ['manual', 'feedback'] }).notNull().default('manual'),
    sourceDraftId: text('source_draft_id').references(() => contentDrafts.id, { onDelete: 'set null' }),
    createdByUserId: text('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    archivedAt: text('archived_at'),
  },
  (table) => [index('idx_voice_memories_account').on(table.accountId, table.archivedAt, table.active, table.createdAt)],
)
