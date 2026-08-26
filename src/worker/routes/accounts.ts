import { and, asc, eq, isNull } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import type { AccountInput, XAccount } from '../../shared/contracts'
import { createDb } from '../db/client'
import { accountStrategies, voiceProfiles, xAccounts } from '../db/schema'
import type { AppEnv } from '../types'
import { writeAudit } from '../lib/audit'
import { requireRole } from '../lib/authorization'
import { AppError, ok, readJson } from '../lib/http'
import { validateAccountInput } from '../lib/validation'

export const accountRoutes = new Hono<AppEnv>()

const safeArray = (value: string | null | undefined): string[] => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function toAccount(row: {
  account: typeof xAccounts.$inferSelect
  strategy: typeof accountStrategies.$inferSelect | null
  voice: typeof voiceProfiles.$inferSelect | null
}): XAccount {
  const { account, strategy, voice } = row
  return {
    id: account.id,
    workspaceId: account.workspaceId,
    handle: account.handle,
    displayName: account.displayName,
    niche: account.niche,
    targetAudience: account.targetAudience,
    purpose: account.purpose,
    monetizationGoal: account.monetizationGoal,
    timezone: account.timezone,
    notes: account.notes,
    status: account.status,
    sortOrder: account.sortOrder,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    archivedAt: account.archivedAt,
    strategy: {
      primaryGoal: strategy?.primaryGoal ?? 'growth',
      contentPillars: safeArray(strategy?.contentPillarsJson),
      forbiddenTopics: safeArray(strategy?.forbiddenTopicsJson),
      postingTargetPerDay: strategy?.postingTargetPerDay ?? 1,
      monetizationType: strategy?.monetizationType ?? 'none',
      funnelNotes: strategy?.funnelNotes ?? '',
      strategyMemo: strategy?.strategyMemo ?? '',
    },
    voice: {
      toneKeywords: safeArray(voice?.toneKeywordsJson),
      sentenceStyle: voice?.sentenceStyle ?? 'mixed',
      politeness: voice?.politeness ?? 'neutral',
      emojiUsage: voice?.emojiUsage ?? 'low',
      assertiveness: voice?.assertiveness ?? 'balanced',
      preferredPhrases: safeArray(voice?.preferredPhrasesJson),
      bannedPhrases: safeArray(voice?.bannedPhrasesJson),
      samplePosts: voice?.samplePosts ?? '',
    },
  }
}

async function listAccounts(c: Context<AppEnv>, includeArchived = false) {
  const session = c.get('session')
  const db = createDb(c.env)
  const condition = includeArchived
    ? eq(xAccounts.workspaceId, session.workspace.id)
    : and(eq(xAccounts.workspaceId, session.workspace.id), isNull(xAccounts.archivedAt))

  const rows = await db
    .select({ account: xAccounts, strategy: accountStrategies, voice: voiceProfiles })
    .from(xAccounts)
    .leftJoin(accountStrategies, eq(accountStrategies.accountId, xAccounts.id))
    .leftJoin(voiceProfiles, eq(voiceProfiles.accountId, xAccounts.id))
    .where(condition)
    .orderBy(asc(xAccounts.sortOrder), asc(xAccounts.createdAt))

  return rows.map(toAccount)
}

accountRoutes.get('/', async (c) => {
  const includeArchived = c.req.query('archived') === 'all'
  return ok(c, await listAccounts(c, includeArchived))
})

accountRoutes.get('/:id', async (c) => {
  const session = c.get('session')
  const db = createDb(c.env)
  const [row] = await db
    .select({ account: xAccounts, strategy: accountStrategies, voice: voiceProfiles })
    .from(xAccounts)
    .leftJoin(accountStrategies, eq(accountStrategies.accountId, xAccounts.id))
    .leftJoin(voiceProfiles, eq(voiceProfiles.accountId, xAccounts.id))
    .where(and(eq(xAccounts.id, c.req.param('id')), eq(xAccounts.workspaceId, session.workspace.id)))
    .limit(1)

  if (!row) throw new AppError(404, 'account_not_found', 'アカウントが見つかりません。')
  return ok(c, toAccount(row))
})

accountRoutes.post('/', async (c) => {
  const session = c.get('session')
  requireRole(session, ['owner', 'admin', 'editor'])
  const db = createDb(c.env)
  const input = validateAccountInput(await readJson<unknown>(c))
  const activeAccounts = await db
    .select({ id: xAccounts.id })
    .from(xAccounts)
    .where(and(eq(xAccounts.workspaceId, session.workspace.id), isNull(xAccounts.archivedAt)))

  if (activeAccounts.length >= session.limits.accountLimit) {
    throw new AppError(409, 'account_limit_reached', `Phase 1では最大${session.limits.accountLimit}アカウントまで登録できます。`)
  }

  const duplicate = await db
    .select({ id: xAccounts.id })
    .from(xAccounts)
    .where(and(eq(xAccounts.workspaceId, session.workspace.id), eq(xAccounts.handle, input.handle)))
    .limit(1)

  if (duplicate.length > 0) {
    throw new AppError(409, 'duplicate_handle', '同じXユーザー名のアカウントがすでに登録されています。', {
      handle: '同じXユーザー名は登録できません。',
    })
  }

  const timestamp = new Date().toISOString()
  const accountId = `xac_${crypto.randomUUID()}`

  try {
    await db.insert(xAccounts).values({
      id: accountId,
      workspaceId: session.workspace.id,
      handle: input.handle,
      displayName: input.displayName,
      niche: input.niche,
      targetAudience: input.targetAudience,
      purpose: input.purpose,
      monetizationGoal: input.monetizationGoal,
      timezone: input.timezone,
      notes: input.notes,
      status: input.status,
      sortOrder: activeAccounts.length,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    })

    await db.insert(accountStrategies).values({
      accountId,
      workspaceId: session.workspace.id,
      primaryGoal: input.strategy.primaryGoal,
      contentPillarsJson: JSON.stringify(input.strategy.contentPillars),
      forbiddenTopicsJson: JSON.stringify(input.strategy.forbiddenTopics),
      postingTargetPerDay: input.strategy.postingTargetPerDay,
      monetizationType: input.strategy.monetizationType,
      funnelNotes: input.strategy.funnelNotes,
      strategyMemo: input.strategy.strategyMemo,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    await db.insert(voiceProfiles).values({
      accountId,
      workspaceId: session.workspace.id,
      toneKeywordsJson: JSON.stringify(input.voice.toneKeywords),
      sentenceStyle: input.voice.sentenceStyle,
      politeness: input.voice.politeness,
      emojiUsage: input.voice.emojiUsage,
      assertiveness: input.voice.assertiveness,
      preferredPhrasesJson: JSON.stringify(input.voice.preferredPhrases),
      bannedPhrasesJson: JSON.stringify(input.voice.bannedPhrases),
      samplePosts: input.voice.samplePosts,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  } catch (error) {
    await db.delete(xAccounts).where(and(eq(xAccounts.id, accountId), eq(xAccounts.workspaceId, session.workspace.id)))
    throw error
  }

  await writeAudit(c.env, session, {
    action: 'account.created',
    entityType: 'x_account',
    entityId: accountId,
    accountId,
    metadata: { handle: input.handle },
  })

  const [created] = await db
    .select({ account: xAccounts, strategy: accountStrategies, voice: voiceProfiles })
    .from(xAccounts)
    .leftJoin(accountStrategies, eq(accountStrategies.accountId, xAccounts.id))
    .leftJoin(voiceProfiles, eq(voiceProfiles.accountId, xAccounts.id))
    .where(eq(xAccounts.id, accountId))
    .limit(1)

  if (!created) throw new AppError(500, 'account_create_failed', 'アカウントの作成結果を取得できませんでした。')
  return ok(c, toAccount(created), 201)
})

accountRoutes.patch('/:id', async (c) => {
  const session = c.get('session')
  requireRole(session, ['owner', 'admin', 'editor'])
  const db = createDb(c.env)
  const accountId = c.req.param('id')
  const input: AccountInput = validateAccountInput(await readJson<unknown>(c))
  const [existing] = await db
    .select()
    .from(xAccounts)
    .where(and(eq(xAccounts.id, accountId), eq(xAccounts.workspaceId, session.workspace.id)))
    .limit(1)

  if (!existing) throw new AppError(404, 'account_not_found', 'アカウントが見つかりません。')

  const [duplicate] = await db
    .select({ id: xAccounts.id })
    .from(xAccounts)
    .where(and(eq(xAccounts.workspaceId, session.workspace.id), eq(xAccounts.handle, input.handle)))
    .limit(1)

  if (duplicate && duplicate.id !== accountId) {
    throw new AppError(409, 'duplicate_handle', '同じXユーザー名のアカウントがすでに登録されています。', {
      handle: '同じXユーザー名は登録できません。',
    })
  }

  const timestamp = new Date().toISOString()
  await db.update(xAccounts).set({
    handle: input.handle,
    displayName: input.displayName,
    niche: input.niche,
    targetAudience: input.targetAudience,
    purpose: input.purpose,
    monetizationGoal: input.monetizationGoal,
    timezone: input.timezone,
    notes: input.notes,
    status: input.status,
    updatedAt: timestamp,
  }).where(and(eq(xAccounts.id, accountId), eq(xAccounts.workspaceId, session.workspace.id)))

  await db.insert(accountStrategies).values({
    accountId,
    workspaceId: session.workspace.id,
    primaryGoal: input.strategy.primaryGoal,
    contentPillarsJson: JSON.stringify(input.strategy.contentPillars),
    forbiddenTopicsJson: JSON.stringify(input.strategy.forbiddenTopics),
    postingTargetPerDay: input.strategy.postingTargetPerDay,
    monetizationType: input.strategy.monetizationType,
    funnelNotes: input.strategy.funnelNotes,
    strategyMemo: input.strategy.strategyMemo,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onConflictDoUpdate({
    target: accountStrategies.accountId,
    set: {
      primaryGoal: input.strategy.primaryGoal,
      contentPillarsJson: JSON.stringify(input.strategy.contentPillars),
      forbiddenTopicsJson: JSON.stringify(input.strategy.forbiddenTopics),
      postingTargetPerDay: input.strategy.postingTargetPerDay,
      monetizationType: input.strategy.monetizationType,
      funnelNotes: input.strategy.funnelNotes,
      strategyMemo: input.strategy.strategyMemo,
      updatedAt: timestamp,
    },
  })

  await db.insert(voiceProfiles).values({
    accountId,
    workspaceId: session.workspace.id,
    toneKeywordsJson: JSON.stringify(input.voice.toneKeywords),
    sentenceStyle: input.voice.sentenceStyle,
    politeness: input.voice.politeness,
    emojiUsage: input.voice.emojiUsage,
    assertiveness: input.voice.assertiveness,
    preferredPhrasesJson: JSON.stringify(input.voice.preferredPhrases),
    bannedPhrasesJson: JSON.stringify(input.voice.bannedPhrases),
    samplePosts: input.voice.samplePosts,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onConflictDoUpdate({
    target: voiceProfiles.accountId,
    set: {
      toneKeywordsJson: JSON.stringify(input.voice.toneKeywords),
      sentenceStyle: input.voice.sentenceStyle,
      politeness: input.voice.politeness,
      emojiUsage: input.voice.emojiUsage,
      assertiveness: input.voice.assertiveness,
      preferredPhrasesJson: JSON.stringify(input.voice.preferredPhrases),
      bannedPhrasesJson: JSON.stringify(input.voice.bannedPhrases),
      samplePosts: input.voice.samplePosts,
      updatedAt: timestamp,
    },
  })

  await writeAudit(c.env, session, {
    action: 'account.updated',
    entityType: 'x_account',
    entityId: accountId,
    accountId,
    metadata: { handle: input.handle },
  })

  const [updated] = await db
    .select({ account: xAccounts, strategy: accountStrategies, voice: voiceProfiles })
    .from(xAccounts)
    .leftJoin(accountStrategies, eq(accountStrategies.accountId, xAccounts.id))
    .leftJoin(voiceProfiles, eq(voiceProfiles.accountId, xAccounts.id))
    .where(eq(xAccounts.id, accountId))
    .limit(1)

  if (!updated) throw new AppError(500, 'account_update_failed', '更新結果を取得できませんでした。')
  return ok(c, toAccount(updated))
})

accountRoutes.post('/:id/archive', async (c) => {
  const session = c.get('session')
  requireRole(session, ['owner', 'admin', 'editor'])
  const db = createDb(c.env)
  const accountId = c.req.param('id')
  const [existing] = await db.select().from(xAccounts)
    .where(and(eq(xAccounts.id, accountId), eq(xAccounts.workspaceId, session.workspace.id)))
    .limit(1)

  if (!existing) throw new AppError(404, 'account_not_found', 'アカウントが見つかりません。')
  if (existing.archivedAt) return ok(c, { archived: true })

  const timestamp = new Date().toISOString()
  await db.update(xAccounts).set({ archivedAt: timestamp, updatedAt: timestamp })
    .where(and(eq(xAccounts.id, accountId), eq(xAccounts.workspaceId, session.workspace.id)))

  await writeAudit(c.env, session, {
    action: 'account.archived',
    entityType: 'x_account',
    entityId: accountId,
    accountId,
    metadata: { handle: existing.handle },
  })

  return ok(c, { archived: true })
})

accountRoutes.post('/:id/restore', async (c) => {
  const session = c.get('session')
  requireRole(session, ['owner', 'admin', 'editor'])
  const db = createDb(c.env)
  const accountId = c.req.param('id')
  const activeAccounts = await db.select({ id: xAccounts.id }).from(xAccounts)
    .where(and(eq(xAccounts.workspaceId, session.workspace.id), isNull(xAccounts.archivedAt)))

  if (activeAccounts.length >= session.limits.accountLimit) {
    throw new AppError(409, 'account_limit_reached', `Phase 1では最大${session.limits.accountLimit}アカウントまで登録できます。`)
  }

  const [existing] = await db.select().from(xAccounts)
    .where(and(eq(xAccounts.id, accountId), eq(xAccounts.workspaceId, session.workspace.id)))
    .limit(1)

  if (!existing) throw new AppError(404, 'account_not_found', 'アカウントが見つかりません。')
  if (!existing.archivedAt) return ok(c, { archived: false })

  const timestamp = new Date().toISOString()
  await db.update(xAccounts).set({ archivedAt: null, updatedAt: timestamp })
    .where(and(eq(xAccounts.id, accountId), eq(xAccounts.workspaceId, session.workspace.id)))

  await writeAudit(c.env, session, {
    action: 'account.restored',
    entityType: 'x_account',
    entityId: accountId,
    accountId,
    metadata: { handle: existing.handle },
  })

  return ok(c, { archived: false })
})
