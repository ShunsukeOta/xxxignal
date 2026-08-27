import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import type {
  ContentDraft,
  ContentOverview,
  DraftCreateInput,
  DraftDetail,
  DraftFeedback,
  DraftRejectReason,
  DraftStatus,
  DraftStatusInput,
  DraftTargetAction,
  DraftUpdateInput,
  DraftVersion,
  GenerateDraftInput,
  ResearchItem,
  VoiceMemory,
  VoiceMemoryInput,
  XAccount,
} from '../../shared/contracts'
import { createDb } from '../db/client'
import {
  accountStrategies,
  contentDrafts,
  draftFeedback,
  draftVersions,
  researchItems,
  voiceMemories,
  voiceProfiles,
  xAccounts,
} from '../db/schema'
import { writeAudit } from '../lib/audit'
import { requireRole } from '../lib/authorization'
import { checkDuplicate } from '../lib/duplicate'
import { AppError, ok, readJson } from '../lib/http'
import { createAiProvider } from '../providers/ai'
import type { AppEnv } from '../types'

export const contentRoutes = new Hono<AppEnv>()

const canWrite = ['owner', 'admin', 'editor'] as const
const targetActions = new Set<DraftTargetAction>(['engagement', 'reply', 'profile_click', 'share', 'dwell', 'follow', 'conversion'])
const rejectReasons = new Set<DraftRejectReason>(['', 'off_voice', 'too_generic', 'too_salesy', 'fact_risk', 'duplicate', 'weak_hook', 'other'])
const allowedTransitions: Record<DraftStatus, DraftStatus[]> = {
  draft: ['review'],
  review: ['approved', 'rejected'],
  approved: ['review', 'published'],
  rejected: ['review'],
  published: [],
}

const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const safeArray = (value: string | null | undefined): string[] => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function toDraft(row: typeof contentDrafts.$inferSelect): ContentDraft {
  return {
    ...row,
    duplicateScore: row.duplicateScore ?? 0,
  }
}

function toVersion(row: typeof draftVersions.$inferSelect): DraftVersion {
  return {
    ...row,
    aiMetadata: parseJsonObject(row.aiMetadataJson),
  }
}

function toFeedback(row: typeof draftFeedback.$inferSelect): DraftFeedback {
  return row
}

function toVoiceMemory(row: typeof voiceMemories.$inferSelect): VoiceMemory {
  return {
    ...row,
    active: Boolean(row.active),
  }
}

function validateTargetAction(value: unknown): DraftTargetAction {
  if (typeof value === 'string' && targetActions.has(value as DraftTargetAction)) return value as DraftTargetAction
  throw new AppError(422, 'validation_error', 'Target Actionを選択してください。', { targetAction: 'Target Actionが正しくありません。' })
}

function validateDraftCreate(value: unknown): DraftCreateInput {
  if (!value || typeof value !== 'object') throw new AppError(422, 'validation_error', '入力内容を確認してください。')
  const body = value as Record<string, unknown>
  const accountId = text(body.accountId, 128)
  const content = text(body.body, 5000)
  const fields: Record<string, string> = {}
  if (!accountId) fields.accountId = 'アカウントを選択してください。'
  if (!content) fields.body = '投稿本文を入力してください。'
  if (Object.keys(fields).length) throw new AppError(422, 'validation_error', '入力内容を確認してください。', fields)
  return {
    accountId,
    researchItemId: text(body.researchItemId, 128) || null,
    title: text(body.title, 160),
    targetAction: validateTargetAction(body.targetAction),
    hook: text(body.hook, 500),
    body: content,
    angle: text(body.angle, 300),
    source: body.source === 'ai' ? 'ai' : body.source === 'edit' ? 'edit' : 'manual',
    aiProvider: text(body.aiProvider, 80),
    aiModel: text(body.aiModel, 160),
    aiMetadata: body.aiMetadata && typeof body.aiMetadata === 'object' && !Array.isArray(body.aiMetadata)
      ? body.aiMetadata as Record<string, unknown>
      : {},
  }
}

function validateDraftUpdate(value: unknown): DraftUpdateInput {
  if (!value || typeof value !== 'object') throw new AppError(422, 'validation_error', '入力内容を確認してください。')
  const body = value as Record<string, unknown>
  const content = text(body.body, 5000)
  if (!content) throw new AppError(422, 'validation_error', '投稿本文を入力してください。', { body: '投稿本文を入力してください。' })
  return {
    title: typeof body.title === 'string' ? text(body.title, 160) : undefined,
    targetAction: typeof body.targetAction === 'string' ? validateTargetAction(body.targetAction) : undefined,
    hook: text(body.hook, 500),
    body: content,
    angle: text(body.angle, 300),
  }
}

function validateStatusInput(value: unknown): DraftStatusInput {
  if (!value || typeof value !== 'object') throw new AppError(422, 'validation_error', '入力内容を確認してください。')
  const body = value as Record<string, unknown>
  const status = typeof body.status === 'string' ? body.status : ''
  if (!['review', 'approved', 'rejected', 'published'].includes(status)) {
    throw new AppError(422, 'validation_error', 'ステータスが正しくありません。')
  }
  const reasonCode = typeof body.reasonCode === 'string' && rejectReasons.has(body.reasonCode as DraftRejectReason)
    ? body.reasonCode as DraftRejectReason
    : ''
  const comment = text(body.comment, 2000)
  const remember = body.remember === true
  if (status === 'rejected' && !reasonCode) throw new AppError(422, 'validation_error', '却下理由を選択してください。', { reasonCode: '却下理由を選択してください。' })
  if (remember && !comment) throw new AppError(422, 'validation_error', 'Voice Memoryへ保存する場合はコメントを入力してください。', { comment: '学習させる具体的な理由を入力してください。' })
  return { status: status as DraftStatusInput['status'], reasonCode, comment, remember }
}

function validateGenerateInput(value: unknown): GenerateDraftInput {
  if (!value || typeof value !== 'object') throw new AppError(422, 'validation_error', '入力内容を確認してください。')
  const body = value as Record<string, unknown>
  const countRaw = Number(body.count ?? 3)
  const count = Math.max(1, Math.min(3, Math.round(Number.isFinite(countRaw) ? countRaw : 3))) as 1 | 2 | 3
  const accountId = text(body.accountId, 128)
  if (!accountId) throw new AppError(422, 'validation_error', 'アカウントを選択してください。', { accountId: 'アカウントを選択してください。' })
  return {
    accountId,
    researchItemId: text(body.researchItemId, 128) || null,
    targetAction: validateTargetAction(body.targetAction),
    instruction: text(body.instruction, 2000),
    count,
  }
}

async function getAccount(c: Context<AppEnv>, accountId: string): Promise<XAccount> {
  const session = c.get('session')
  const db = createDb(c.env)
  const [row] = await db
    .select({ account: xAccounts, strategy: accountStrategies, voice: voiceProfiles })
    .from(xAccounts)
    .leftJoin(accountStrategies, eq(accountStrategies.accountId, xAccounts.id))
    .leftJoin(voiceProfiles, eq(voiceProfiles.accountId, xAccounts.id))
    .where(and(eq(xAccounts.id, accountId), eq(xAccounts.workspaceId, session.workspace.id), isNull(xAccounts.archivedAt)))
    .limit(1)
  if (!row) throw new AppError(404, 'account_not_found', 'アカウントが見つかりません。')
  return {
    ...row.account,
    strategy: {
      primaryGoal: row.strategy?.primaryGoal ?? 'growth',
      contentPillars: safeArray(row.strategy?.contentPillarsJson),
      forbiddenTopics: safeArray(row.strategy?.forbiddenTopicsJson),
      postingTargetPerDay: row.strategy?.postingTargetPerDay ?? 1,
      monetizationType: row.strategy?.monetizationType ?? 'none',
      funnelNotes: row.strategy?.funnelNotes ?? '',
      strategyMemo: row.strategy?.strategyMemo ?? '',
    },
    voice: {
      toneKeywords: safeArray(row.voice?.toneKeywordsJson),
      sentenceStyle: row.voice?.sentenceStyle ?? 'mixed',
      politeness: row.voice?.politeness ?? 'neutral',
      emojiUsage: row.voice?.emojiUsage ?? 'low',
      assertiveness: row.voice?.assertiveness ?? 'balanced',
      preferredPhrases: safeArray(row.voice?.preferredPhrasesJson),
      bannedPhrases: safeArray(row.voice?.bannedPhrasesJson),
      samplePosts: row.voice?.samplePosts ?? '',
    },
  }
}

async function getResearchItem(c: Context<AppEnv>, researchItemId: string | null): Promise<ResearchItem | null> {
  if (!researchItemId) return null
  const session = c.get('session')
  const db = createDb(c.env)
  const [item] = await db
    .select()
    .from(researchItems)
    .where(and(eq(researchItems.id, researchItemId), eq(researchItems.workspaceId, session.workspace.id), isNull(researchItems.archivedAt)))
    .limit(1)
  if (!item) throw new AppError(404, 'research_item_not_found', 'Research Itemが見つかりません。')
  return item
}

async function getDraft(c: Context<AppEnv>, draftId: string) {
  const session = c.get('session')
  const db = createDb(c.env)
  const [draft] = await db
    .select()
    .from(contentDrafts)
    .where(and(eq(contentDrafts.id, draftId), eq(contentDrafts.workspaceId, session.workspace.id)))
    .limit(1)
  if (!draft) throw new AppError(404, 'draft_not_found', 'Draftが見つかりません。')
  return draft
}

async function getCurrentVersionId(c: Context<AppEnv>, draftId: string, currentVersion: number) {
  const session = c.get('session')
  const db = createDb(c.env)
  const [version] = await db
    .select({ id: draftVersions.id })
    .from(draftVersions)
    .where(and(
      eq(draftVersions.workspaceId, session.workspace.id),
      eq(draftVersions.draftId, draftId),
      eq(draftVersions.versionNumber, currentVersion),
    ))
    .limit(1)
  return version?.id ?? null
}

contentRoutes.get('/ai/status', async (c) => {
  const provider = createAiProvider(c.env)
  return ok(c, {
    provider: provider.name,
    configured: provider.configured,
    external: provider.external,
    model: provider.model,
    note: provider.note,
  })
})

contentRoutes.post('/generate', async (c) => {
  const session = c.get('session')
  requireRole(session, canWrite)
  const input = validateGenerateInput(await readJson<unknown>(c))
  const account = await getAccount(c, input.accountId)
  const researchItem = await getResearchItem(c, input.researchItemId)
  const db = createDb(c.env)
  const memories = await db
    .select()
    .from(voiceMemories)
    .where(and(
      eq(voiceMemories.workspaceId, session.workspace.id),
      eq(voiceMemories.accountId, input.accountId),
      eq(voiceMemories.active, true),
      isNull(voiceMemories.archivedAt),
    ))
    .orderBy(desc(voiceMemories.createdAt))
    .limit(50)

  const provider = createAiProvider(c.env)
  const generated = await provider.generate({
    account,
    researchItem,
    voiceMemories: memories.map(toVoiceMemory),
    targetAction: input.targetAction,
    instruction: input.instruction,
    count: input.count,
  })

  const candidates = await Promise.all(generated.candidates.map(async (candidate) => ({
    ...candidate,
    duplicate: await checkDuplicate(c.env, session.workspace.id, input.accountId, candidate.body),
  })))

  await writeAudit(c.env, session, {
    action: 'content.generated',
    entityType: 'content_generation',
    accountId: input.accountId,
    metadata: { provider: generated.provider, model: generated.model, count: candidates.length },
  })

  return ok(c, { ...generated, candidates })
})

contentRoutes.post('/duplicate-check', async (c) => {
  const session = c.get('session')
  const body = await readJson<Record<string, unknown>>(c)
  const accountId = text(body.accountId, 128)
  const content = text(body.body, 5000)
  const excludeDraftId = text(body.excludeDraftId, 128) || undefined
  if (!accountId || !content) throw new AppError(422, 'validation_error', 'アカウントと本文を入力してください。')
  await getAccount(c, accountId)
  return ok(c, await checkDuplicate(c.env, session.workspace.id, accountId, content, excludeDraftId))
})

contentRoutes.get('/overview', async (c) => {
  const session = c.get('session')
  const db = createDb(c.env)
  const drafts = await db
    .select()
    .from(contentDrafts)
    .where(and(eq(contentDrafts.workspaceId, session.workspace.id), isNull(contentDrafts.archivedAt)))
    .orderBy(desc(contentDrafts.updatedAt))
  const archivedDrafts = await db
    .select()
    .from(contentDrafts)
    .where(and(eq(contentDrafts.workspaceId, session.workspace.id), isNotNull(contentDrafts.archivedAt)))
    .orderBy(desc(contentDrafts.updatedAt))
  const memories = await db
    .select()
    .from(voiceMemories)
    .where(and(eq(voiceMemories.workspaceId, session.workspace.id), isNull(voiceMemories.archivedAt)))
    .orderBy(desc(voiceMemories.createdAt))

  const result: ContentOverview = {
    drafts: drafts.map(toDraft),
    archivedDrafts: archivedDrafts.map(toDraft),
    voiceMemories: memories.map(toVoiceMemory),
  }
  return ok(c, result)
})

contentRoutes.get('/drafts/:id', async (c) => {
  const session = c.get('session')
  const db = createDb(c.env)
  const draft = await getDraft(c, c.req.param('id'))
  const versions = await db
    .select()
    .from(draftVersions)
    .where(and(eq(draftVersions.workspaceId, session.workspace.id), eq(draftVersions.draftId, draft.id)))
    .orderBy(desc(draftVersions.versionNumber))
  const feedback = await db
    .select()
    .from(draftFeedback)
    .where(and(eq(draftFeedback.workspaceId, session.workspace.id), eq(draftFeedback.draftId, draft.id)))
    .orderBy(desc(draftFeedback.createdAt))
  const result: DraftDetail = {
    draft: toDraft(draft),
    versions: versions.map(toVersion),
    feedback: feedback.map(toFeedback),
  }
  return ok(c, result)
})

contentRoutes.post('/drafts', async (c) => {
  const session = c.get('session')
  requireRole(session, canWrite)
  const input = validateDraftCreate(await readJson<unknown>(c))
  await getAccount(c, input.accountId)
  await getResearchItem(c, input.researchItemId)
  const duplicate = await checkDuplicate(c.env, session.workspace.id, input.accountId, input.body)
  const db = createDb(c.env)
  const timestamp = now()
  const draftId = id('drf')
  const versionId = id('drv')

  await db.insert(contentDrafts).values({
    id: draftId,
    workspaceId: session.workspace.id,
    accountId: input.accountId,
    researchItemId: input.researchItemId,
    title: input.title || input.hook || input.body.slice(0, 60),
    targetAction: input.targetAction,
    status: 'draft',
    currentVersion: 1,
    currentHook: input.hook,
    currentBody: input.body,
    currentAngle: input.angle,
    contentHash: duplicate.contentHash,
    duplicateScore: duplicate.score,
    duplicateDraftId: duplicate.match?.draftId ?? null,
    createdByUserId: session.user.id,
    createdAt: timestamp,
    updatedAt: timestamp,
    publishedAt: null,
    archivedAt: null,
  })

  try {
    await db.insert(draftVersions).values({
      id: versionId,
      workspaceId: session.workspace.id,
      draftId,
      versionNumber: 1,
      hook: input.hook,
      body: input.body,
      angle: input.angle,
      source: input.source ?? 'manual',
      aiProvider: input.aiProvider ?? '',
      aiModel: input.aiModel ?? '',
      aiMetadataJson: JSON.stringify(input.aiMetadata ?? {}),
      createdByUserId: session.user.id,
      createdAt: timestamp,
    })
  } catch (error) {
    await db.delete(contentDrafts).where(and(eq(contentDrafts.id, draftId), eq(contentDrafts.workspaceId, session.workspace.id)))
    throw error
  }

  await writeAudit(c.env, session, {
    action: 'draft.created',
    entityType: 'content_draft',
    entityId: draftId,
    accountId: input.accountId,
    metadata: { source: input.source ?? 'manual', duplicateScore: duplicate.score },
  })
  const [created] = await db.select().from(contentDrafts).where(eq(contentDrafts.id, draftId)).limit(1)
  if (!created) throw new AppError(500, 'draft_create_failed', 'Draftの作成結果を取得できませんでした。')
  return ok(c, toDraft(created), 201)
})

contentRoutes.patch('/drafts/:id', async (c) => {
  const session = c.get('session')
  requireRole(session, canWrite)
  const draft = await getDraft(c, c.req.param('id'))
  if (draft.archivedAt) throw new AppError(409, 'draft_archived', 'Archive中のDraftは編集できません。')
  if (draft.status === 'published') throw new AppError(409, 'draft_published', '公開済みDraftは編集できません。')
  const input = validateDraftUpdate(await readJson<unknown>(c))
  const duplicate = await checkDuplicate(c.env, session.workspace.id, draft.accountId, input.body, draft.id)
  const db = createDb(c.env)
  const timestamp = now()
  const versionNumber = draft.currentVersion + 1
  const versionId = id('drv')

  await db.insert(draftVersions).values({
    id: versionId,
    workspaceId: session.workspace.id,
    draftId: draft.id,
    versionNumber,
    hook: input.hook,
    body: input.body,
    angle: input.angle,
    source: 'edit',
    aiProvider: '',
    aiModel: '',
    aiMetadataJson: '{}',
    createdByUserId: session.user.id,
    createdAt: timestamp,
  })

  await db.update(contentDrafts).set({
    title: input.title ?? draft.title,
    targetAction: input.targetAction ?? draft.targetAction,
    status: 'draft',
    currentVersion: versionNumber,
    currentHook: input.hook,
    currentBody: input.body,
    currentAngle: input.angle,
    contentHash: duplicate.contentHash,
    duplicateScore: duplicate.score,
    duplicateDraftId: duplicate.match?.draftId ?? null,
    updatedAt: timestamp,
  }).where(and(eq(contentDrafts.id, draft.id), eq(contentDrafts.workspaceId, session.workspace.id)))

  await writeAudit(c.env, session, {
    action: 'draft.version_created',
    entityType: 'content_draft',
    entityId: draft.id,
    accountId: draft.accountId,
    metadata: { version: versionNumber, duplicateScore: duplicate.score },
  })
  const [updated] = await db.select().from(contentDrafts).where(eq(contentDrafts.id, draft.id)).limit(1)
  if (!updated) throw new AppError(500, 'draft_update_failed', 'Draftの更新結果を取得できませんでした。')
  return ok(c, toDraft(updated))
})

contentRoutes.post('/drafts/:id/status', async (c) => {
  const session = c.get('session')
  requireRole(session, canWrite)
  const draft = await getDraft(c, c.req.param('id'))
  if (draft.archivedAt) throw new AppError(409, 'draft_archived', 'Archive中のDraftはレビューできません。')
  const input = validateStatusInput(await readJson<unknown>(c))
  if (!allowedTransitions[draft.status].includes(input.status)) {
    throw new AppError(409, 'invalid_draft_transition', `${draft.status} から ${input.status} へは変更できません。`)
  }

  const db = createDb(c.env)
  const timestamp = now()
  const versionId = await getCurrentVersionId(c, draft.id, draft.currentVersion)
  await db.update(contentDrafts).set({
    status: input.status,
    publishedAt: input.status === 'published' ? timestamp : draft.publishedAt,
    updatedAt: timestamp,
  }).where(and(eq(contentDrafts.id, draft.id), eq(contentDrafts.workspaceId, session.workspace.id)))

  const decision = input.status === 'review' ? 'submit' : input.status === 'approved' ? 'approve' : input.status === 'rejected' ? 'reject' : 'publish'
  await db.insert(draftFeedback).values({
    id: id('dfb'),
    workspaceId: session.workspace.id,
    draftId: draft.id,
    versionId,
    userId: session.user.id,
    decision,
    reasonCode: input.reasonCode ?? '',
    comment: input.comment ?? '',
    createdAt: timestamp,
  })

  if (input.status === 'rejected' && input.remember && input.comment) {
    await db.insert(voiceMemories).values({
      id: id('vmm'),
      workspaceId: session.workspace.id,
      accountId: draft.accountId,
      kind: 'avoidance',
      content: input.comment,
      source: 'feedback',
      sourceDraftId: draft.id,
      createdByUserId: session.user.id,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    })
  }

  await writeAudit(c.env, session, {
    action: `draft.${input.status}`,
    entityType: 'content_draft',
    entityId: draft.id,
    accountId: draft.accountId,
    metadata: { from: draft.status, to: input.status, reasonCode: input.reasonCode ?? '', remember: input.remember === true },
  })
  const [updated] = await db.select().from(contentDrafts).where(eq(contentDrafts.id, draft.id)).limit(1)
  if (!updated) throw new AppError(500, 'draft_status_update_failed', 'Draftの状態更新結果を取得できませんでした。')
  return ok(c, toDraft(updated))
})

contentRoutes.post('/drafts/:id/archive', async (c) => {
  const session = c.get('session')
  requireRole(session, canWrite)
  const draft = await getDraft(c, c.req.param('id'))
  if (draft.status === 'published') throw new AppError(409, 'published_archive_blocked', '公開済みDraftは履歴として保持するためArchiveできません。')
  const timestamp = now()
  const db = createDb(c.env)
  await db.update(contentDrafts).set({ archivedAt: timestamp, updatedAt: timestamp }).where(and(eq(contentDrafts.id, draft.id), eq(contentDrafts.workspaceId, session.workspace.id)))
  await writeAudit(c.env, session, { action: 'draft.archived', entityType: 'content_draft', entityId: draft.id, accountId: draft.accountId })
  return ok(c, { archived: true })
})

contentRoutes.post('/drafts/:id/restore', async (c) => {
  const session = c.get('session')
  requireRole(session, canWrite)
  const draft = await getDraft(c, c.req.param('id'))
  const timestamp = now()
  const db = createDb(c.env)
  await db.update(contentDrafts).set({ archivedAt: null, updatedAt: timestamp }).where(and(eq(contentDrafts.id, draft.id), eq(contentDrafts.workspaceId, session.workspace.id)))
  await writeAudit(c.env, session, { action: 'draft.restored', entityType: 'content_draft', entityId: draft.id, accountId: draft.accountId })
  return ok(c, { archived: false })
})

contentRoutes.get('/voice-memory', async (c) => {
  const session = c.get('session')
  const db = createDb(c.env)
  const accountId = text(c.req.query('accountId'), 128)
  const conditions = [eq(voiceMemories.workspaceId, session.workspace.id), isNull(voiceMemories.archivedAt)]
  if (accountId) conditions.push(eq(voiceMemories.accountId, accountId))
  const rows = await db.select().from(voiceMemories).where(and(...conditions)).orderBy(desc(voiceMemories.createdAt))
  return ok(c, rows.map(toVoiceMemory))
})

contentRoutes.post('/voice-memory', async (c) => {
  const session = c.get('session')
  requireRole(session, canWrite)
  const body = await readJson<Record<string, unknown>>(c)
  const input: VoiceMemoryInput = {
    accountId: text(body.accountId, 128),
    kind: ['preference', 'avoidance', 'observation'].includes(String(body.kind)) ? body.kind as VoiceMemoryInput['kind'] : 'observation',
    content: text(body.content, 1000),
  }
  if (!input.accountId || !input.content) throw new AppError(422, 'validation_error', 'アカウントとMemory内容を入力してください。')
  await getAccount(c, input.accountId)
  const db = createDb(c.env)
  const timestamp = now()
  const memoryId = id('vmm')
  await db.insert(voiceMemories).values({
    id: memoryId,
    workspaceId: session.workspace.id,
    accountId: input.accountId,
    kind: input.kind,
    content: input.content,
    source: 'manual',
    sourceDraftId: null,
    createdByUserId: session.user.id,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
  })
  await writeAudit(c.env, session, { action: 'voice_memory.created', entityType: 'voice_memory', entityId: memoryId, accountId: input.accountId, metadata: { kind: input.kind } })
  const [created] = await db.select().from(voiceMemories).where(eq(voiceMemories.id, memoryId)).limit(1)
  if (!created) throw new AppError(500, 'voice_memory_create_failed', 'Voice Memoryの作成結果を取得できませんでした。')
  return ok(c, toVoiceMemory(created), 201)
})

contentRoutes.post('/voice-memory/:id/archive', async (c) => {
  const session = c.get('session')
  requireRole(session, canWrite)
  const db = createDb(c.env)
  const memoryId = c.req.param('id')
  const [memory] = await db.select().from(voiceMemories).where(and(eq(voiceMemories.id, memoryId), eq(voiceMemories.workspaceId, session.workspace.id))).limit(1)
  if (!memory) throw new AppError(404, 'voice_memory_not_found', 'Voice Memoryが見つかりません。')
  const timestamp = now()
  await db.update(voiceMemories).set({ archivedAt: timestamp, active: false, updatedAt: timestamp }).where(and(eq(voiceMemories.id, memoryId), eq(voiceMemories.workspaceId, session.workspace.id)))
  await writeAudit(c.env, session, { action: 'voice_memory.archived', entityType: 'voice_memory', entityId: memoryId, accountId: memory.accountId })
  return ok(c, { archived: true })
})
