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
