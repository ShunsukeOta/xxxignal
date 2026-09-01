import { and, desc, eq, gte, isNull, ne } from 'drizzle-orm'
import { Hono } from 'hono'
import type {
  AttributionEventKind,
  CalendarItem,
  CalendarItemKind,
  CalendarItemStatus,
  EngagementOverlapIssue,
  Opportunity,
  OpportunityStatus,
  OperationsOverview,
  RevenueOverview,
  WeeklyLearning,
} from '../../shared/contracts'
import { createDb } from '../db/client'
import {
  accountStrategies,
  attributionEvents,
  attributionLinks,
  auditLogs,
  calendarItems,
  contentDrafts,
  draftFeedback,
  draftVersions,
  opportunities,
  researchItems,
  researchSources,
  researchTargets,
  settings,
  voiceMemories,
  voiceProfiles,
  weeklyLearnings,
  workspaceMembers,
  workspaces,
  xAccounts,
  xBudgetSettings,
  xConnections,
  xCostLedger,
  xEngagementInbox,
  xPostMetricSnapshots,
  xPosts,
  xSyncRuns,
} from '../db/schema'
import { writeAudit } from '../lib/audit'
import { requireRole } from '../lib/authorization'
import { duplicateSimilarityScore } from '../lib/duplicate'
import { AppError, ok, readJson } from '../lib/http'
import type { AppEnv } from '../types'

export const productionRoutes = new Hono<AppEnv>()
const canWrite = ['owner', 'admin', 'editor'] as const
const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`
const text = (value: unknown, max = 2000) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)))
const parseObject = (value: string | null | undefined) => {
  if (!value) return {} as Record<string, unknown>
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch { return {} as Record<string, unknown> }
}
const parseArray = <T = unknown>(value: string | null | undefined): T[] => {
  if (!value) return []
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed as T[] : [] } catch { return [] }
}
const safeUrl = (raw: string) => {
  let url: URL
  try { url = new URL(raw) } catch { throw new AppError(422, 'invalid_url', '有効なURLを入力してください。') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new AppError(422, 'invalid_url', 'HTTP / HTTPS URLのみ利用できます。')
  return url.toString()
}
const recencyScore = (date: string | null | undefined) => {
  const timestamp = date ? Date.parse(date) : NaN
  if (!Number.isFinite(timestamp)) return 20
  const ageHours = Math.max(0, (Date.now() - timestamp) / 3_600_000)
  if (ageHours <= 12) return 100
  if (ageHours <= 24) return 90
  if (ageHours <= 72) return 75
  if (ageHours <= 168) return 55
  if (ageHours <= 336) return 35
  return 15
}
const weekStartIso = (date = new Date()) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

function opportunityDto(row: typeof opportunities.$inferSelect): Opportunity {
  return {
    id: row.id,
    accountId: row.accountId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    title: row.title,
    summary: row.summary,
    score: row.score,
    urgency: row.urgency,
    fit: row.fit,
    evidence: parseObject(row.evidenceJson),
    status: row.status,
    scheduledAt: row.scheduledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function calendarDto(row: typeof calendarItems.$inferSelect): CalendarItem {
  return {
    id: row.id,
    accountId: row.accountId,
    draftId: row.draftId,
    opportunityId: row.opportunityId,
    kind: row.kind,
    title: row.title,
    scheduledFor: row.scheduledFor,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function learningDto(row: typeof weeklyLearnings.$inferSelect): WeeklyLearning {
  return {
    id: row.id,
    accountId: row.accountId,
    weekStart: row.weekStart,
    scope: row.scope,
    summary: row.summary,
    winners: parseArray<WeeklyLearning['winners'][number]>(row.winnersJson),
    observations: parseArray<string>(row.observationsJson),
    recommendations: parseArray<string>(row.recommendationsJson),
    sampleSize: row.sampleSize,
    generatedAt: row.generatedAt,
  }
}

async function assertAccount(env: AppEnv['Bindings'], workspaceId: string, accountId: string) {
  const db = createDb(env)
  const [account] = await db.select({ id: xAccounts.id }).from(xAccounts)
    .where(and(eq(xAccounts.id, accountId), eq(xAccounts.workspaceId, workspaceId), isNull(xAccounts.archivedAt))).limit(1)
  if (!account) throw new AppError(404, 'account_not_found', 'アカウントが見つかりません。')
}

async function upsertOpportunity(env: AppEnv['Bindings'], input: {
  workspaceId: string
  accountId: string | null
  sourceType: 'research' | 'mention'
  sourceId: string
  title: string
  summary: string
  score: number
  urgency: number
  fit: number
  evidence: Record<string, unknown>
}) {
  const db = createDb(env)
  const [existing] = await db.select().from(opportunities).where(and(
    eq(opportunities.workspaceId, input.workspaceId),
    eq(opportunities.sourceType, input.sourceType),
    eq(opportunities.sourceId, input.sourceId),
  )).limit(1)
  const timestamp = now()
  if (existing) {
    if (existing.status === 'dismissed' || existing.status === 'done') return
    await db.update(opportunities).set({
      accountId: input.accountId,
      title: input.title,
      summary: input.summary,
      score: input.score,
      urgency: input.urgency,
      fit: input.fit,
      evidenceJson: JSON.stringify(input.evidence),
      updatedAt: timestamp,
    }).where(eq(opportunities.id, existing.id))
    return
  }
  await db.insert(opportunities).values({
    id: id('opp'),
    workspaceId: input.workspaceId,
    accountId: input.accountId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    title: input.title,
    summary: input.summary,
    score: input.score,
    urgency: input.urgency,
    fit: input.fit,
    evidenceJson: JSON.stringify(input.evidence),
    status: 'new',
    scheduledAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

async function buildGuardIssues(env: AppEnv['Bindings'], workspaceId: string) {
  const db = createDb(env)
  const drafts = await db.select({
    id: contentDrafts.id,
    accountId: contentDrafts.accountId,
    title: contentDrafts.title,
    body: contentDrafts.currentBody,
    updatedAt: contentDrafts.updatedAt,
  }).from(contentDrafts).where(and(eq(contentDrafts.workspaceId, workspaceId), isNull(contentDrafts.archivedAt)))
    .orderBy(desc(contentDrafts.updatedAt)).limit(120)

  const duplicateIssues: OperationsOverview['duplicateIssues'] = []
  for (let i = 0; i < drafts.length; i += 1) {
    const left = drafts[i]
    if (!left) continue
    for (let j = i + 1; j < drafts.length; j += 1) {
      const right = drafts[j]
      if (!right || left.accountId === right.accountId) continue
      const score = duplicateSimilarityScore(left.body, right.body)
      if (score >= 65) duplicateIssues.push({
        leftDraftId: left.id,
        leftAccountId: left.accountId,
        leftTitle: left.title,
        rightDraftId: right.id,
        rightAccountId: right.accountId,
        rightTitle: right.title,
        score,
      })
    }
  }
  duplicateIssues.sort((a, b) => b.score - a.score)

  const inbox = await db.select().from(xEngagementInbox)
    .where(and(eq(xEngagementInbox.workspaceId, workspaceId), ne(xEngagementInbox.status, 'ignored')))
    .orderBy(desc(xEngagementInbox.updatedAt)).limit(200)
  const grouped = new Map<string, typeof inbox>()
  for (const item of inbox) {
    const key = item.xPostId || (item.authorId ? `author:${item.authorId}` : '')
    if (!key) continue
    const current = grouped.get(key) ?? []
    current.push(item)
    grouped.set(key, current)
  }
  const engagementIssues: EngagementOverlapIssue[] = []
  for (const [key, items] of grouped) {
    const accountIds = [...new Set(items.map((item) => item.accountId))]
    if (accountIds.length < 2) continue
    const first = items[0]
    if (!first) continue
    engagementIssues.push({
      key,
      authorId: first.authorId,
      xPostId: first.xPostId,
      accountIds,
      text: first.text,
    })
  }

  return { duplicateIssues: duplicateIssues.slice(0, 30), engagementIssues: engagementIssues.slice(0, 30) }
}

productionRoutes.get('/overview', async (c) => {
  const session = c.get('session')
  const db = createDb(c.env)
  const [opps, calendar, learnings, approvedDrafts, accountRows, researchRows, draftRows, xPostRows, linkRows, guards] = await Promise.all([
    db.select().from(opportunities).where(eq(opportunities.workspaceId, session.workspace.id)).orderBy(desc(opportunities.score), desc(opportunities.updatedAt)).limit(100),
    db.select().from(calendarItems).where(eq(calendarItems.workspaceId, session.workspace.id)).orderBy(calendarItems.scheduledFor).limit(150),
    db.select().from(weeklyLearnings).where(eq(weeklyLearnings.workspaceId, session.workspace.id)).orderBy(desc(weeklyLearnings.weekStart), desc(weeklyLearnings.generatedAt)).limit(30),
    db.select().from(contentDrafts).where(and(eq(contentDrafts.workspaceId, session.workspace.id), eq(contentDrafts.status, 'approved'), isNull(contentDrafts.archivedAt))).orderBy(desc(contentDrafts.updatedAt)).limit(100),
    db.select({ id: xAccounts.id }).from(xAccounts).where(and(eq(xAccounts.workspaceId, session.workspace.id), isNull(xAccounts.archivedAt))),
    db.select({ id: researchItems.id }).from(researchItems).where(eq(researchItems.workspaceId, session.workspace.id)),
    db.select({ id: contentDrafts.id }).from(contentDrafts).where(eq(contentDrafts.workspaceId, session.workspace.id)),
    db.select({ id: xPosts.id }).from(xPosts).where(eq(xPosts.workspaceId, session.workspace.id)),
    db.select({ id: attributionLinks.id }).from(attributionLinks).where(eq(attributionLinks.workspaceId, session.workspace.id)),
    buildGuardIssues(c.env, session.workspace.id),
  ])

  const result: OperationsOverview = {
    opportunities: opps.map(opportunityDto),
    calendar: calendar.map(calendarDto),
    learnings: learnings.map(learningDto),
    duplicateIssues: guards.duplicateIssues,
    engagementIssues: guards.engagementIssues,
    approvedDrafts: approvedDrafts.map((row) => ({
      ...row,
      duplicateScore: row.duplicateScore,
      duplicateDraftId: row.duplicateDraftId,
    })),
    exportSummary: {
      accounts: accountRows.length,
      researchItems: researchRows.length,
      drafts: draftRows.length,
      xPosts: xPostRows.length,
      attributionLinks: linkRows.length,
    },
  }
  return ok(c, result)
})

productionRoutes.post('/opportunities/rebuild', async (c) => {
  const session = c.get('session')
  requireRole(session, canWrite)
  const db = createDb(c.env)
  const [research, mentions] = await Promise.all([
    db.select().from(researchItems).where(and(eq(researchItems.workspaceId, session.workspace.id), isNull(researchItems.archivedAt)))
      .orderBy(desc(researchItems.publishedAt), desc(researchItems.createdAt)).limit(120),
    db.select().from(xEngagementInbox).where(and(eq(xEngagementInbox.workspaceId, session.workspace.id), ne(xEngagementInbox.status, 'ignored')))
      .orderBy(desc(xEngagementInbox.xCreatedAt), desc(xEngagementInbox.updatedAt)).limit(120),
  ])

  for (const item of research) {
    const urgency = recencyScore(item.publishedAt ?? item.createdAt)
    const fit = item.accountId ? 80 : item.topic ? 65 : 50
    const sourceBonus = item.kind === 'x_post' ? 8 : item.kind === 'rss' ? 4 : 0
    const score = clamp(urgency * 0.45 + fit * 0.45 + sourceBonus)
    await upsertOpportunity(c.env, {
      workspaceId: session.workspace.id,
      accountId: item.accountId,
      sourceType: 'research',
      sourceId: item.id,
      title: item.title,
      summary: item.summary.slice(0, 1000),
      score,
      urgency,
      fit,
      evidence: { kind: item.kind, topic: item.topic, url: item.url, publishedAt: item.publishedAt },
    })
  }

  for (const item of mentions) {
    const metrics = parseObject(item.publicMetricsJson)
    const interactionCount = ['like_count', 'reply_count', 'retweet_count', 'repost_count', 'quote_count']
      .reduce((sum, key) => sum + Number(metrics[key] ?? 0), 0)
    const urgency = recencyScore(item.xCreatedAt ?? item.firstSeenAt)
    const fit = 85
    const score = clamp(urgency * 0.55 + fit * 0.35 + Math.min(10, interactionCount))
    await upsertOpportunity(c.env, {
      workspaceId: session.workspace.id,
      accountId: item.accountId,
      sourceType: 'mention',
      sourceId: item.id,
      title: `Mention: ${item.text.slice(0, 80) || item.xPostId}`,
      summary: item.text.slice(0, 1000),
      score,
      urgency,
      fit,
      evidence: { xPostId: item.xPostId, authorId: item.authorId, publicMetrics: metrics },
    })
  }

  await writeAudit(c.env, session, {
    action: 'opportunities.rebuilt',
    entityType: 'opportunity',
    metadata: { research: research.length, mentions: mentions.length },
  })
  return ok(c, { research: research.length, mentions: mentions.length })
})

productionRoutes.post('/opportunities', async (c) => {
  const session = c.get('session')
  requireRole(session, canWrite)
  const body = await readJson<Record<string, unknown>>(c)
  const title = text(body.title, 200)
  const summary = text(body.summary, 2000)
  const accountId = text(body.accountId, 128) || null
  if (!title) throw new AppError(422, 'validation_error', 'タイトルを入力してください。')
  if (accountId) await assertAccount(c.env, session.workspace.id, accountId)
  const score = clamp(Number(body.score ?? 50))
  const timestamp = now()
  const opportunityId = id('opp')
  const db = createDb(c.env)
  await db.insert(opportunities).values({
    id: opportunityId,
    workspaceId: session.workspace.id,
    accountId,
    sourceType: 'manual',
    sourceId: opportunityId,
    title,
    summary,
    score,
    urgency: clamp(Number(body.urgency ?? score)),
    fit: clamp(Number(body.fit ?? score)),
    evidenceJson: '{}',
    status: 'new',
    scheduledAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await writeAudit(c.env, session, { action: 'opportunity.created', entityType: 'opportunity', entityId: opportunityId, accountId })
  return ok(c, { id: opportunityId }, 201)
})

productionRoutes.patch('/opportunities/:id', async (c) => {
  const session = c.get('session')
  requireRole(session, canWrite)
  const body = await readJson<Record<string, unknown>>(c)
  const status = String(body.status ?? '') as OpportunityStatus
  if (!['new', 'planned', 'done', 'dismissed'].includes(status)) throw new AppError(422, 'validation_error', 'Opportunity statusが不正です。')
  const db = createDb(c.env)
  const [item] = await db.select().from(opportunities).where(and(eq(opportunities.id, c.req.param('id')), eq(opportunities.workspaceId, session.workspace.id))).limit(1)
  if (!item) throw new AppError(404, 'opportunity_not_found', 'Opportunityが見つかりません。')
  const scheduledAt = body.scheduledAt === null ? null : text(body.scheduledAt, 64) || item.scheduledAt
  await db.update(opportunities).set({ status, scheduledAt, updatedAt: now() }).where(eq(opportunities.id, item.id))
  return ok(c, { status, scheduledAt })
})

productionRoutes.post('/calendar', async (c) => {
  const session = c.get('session')
  requireRole(session, canWrite)
  const body = await readJson<Record<string, unknown>>(c)
  const accountId = text(body.accountId, 128)
  const title = text(body.title, 200)
  const scheduledFor = text(body.scheduledFor, 64)
  const kind = String(body.kind ?? 'manual') as CalendarItemKind
  const draftId = text(body.draftId, 128) || null
  const opportunityId = text(body.opportunityId, 128) || null
  if (!accountId || !title || !scheduledFor || !['publish', 'followup', 'research', 'manual'].includes(kind)) throw new AppError(422, 'validation_error', 'Calendar入力を確認してください。')
  if (!Number.isFinite(Date.parse(scheduledFor))) throw new AppError(422, 'validation_error', '日時が正しくありません。')
  await assertAccount(c.env, session.workspace.id, accountId)
  const db = createDb(c.env)
  if (draftId) {
    const [draft] = await db.select({ id: contentDrafts.id }).from(contentDrafts).where(and(eq(contentDrafts.id, draftId), eq(contentDrafts.workspaceId, session.workspace.id), eq(contentDrafts.accountId, accountId))).limit(1)
    if (!draft) throw new AppError(422, 'invalid_draft', '選択したDraftが見つかりません。')
  }
  if (opportunityId) {
    const [opp] = await db.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.id, opportunityId), eq(opportunities.workspaceId, session.workspace.id))).limit(1)
    if (!opp) throw new AppError(422, 'invalid_opportunity', '選択したOpportunityが見つかりません。')
  }
  const timestamp = now()
  const calendarId = id('cal')
  await db.insert(calendarItems).values({
    id: calendarId,
    workspaceId: session.workspace.id,
    accountId,
    draftId,
    opportunityId,
    kind,
    title,
    scheduledFor: new Date(scheduledFor).toISOString(),
    status: 'planned',
    notes: text(body.notes, 2000),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  if (opportunityId) await db.update(opportunities).set({ status: 'planned', scheduledAt: new Date(scheduledFor).toISOString(), updatedAt: timestamp }).where(eq(opportunities.id, opportunityId))
  await writeAudit(c.env, session, { action: 'calendar.created', entityType: 'calendar_item', entityId: calendarId, accountId })
  return ok(c, { id: calendarId }, 201)
})

productionRoutes.patch('/calendar/:id', async (c) => {
  const session = c.get('session')
  requireRole(session, canWrite)
  const body = await readJson<Record<string, unknown>>(c)
  const status = String(body.status ?? '') as CalendarItemStatus
  if (!['planned', 'done', 'cancelled'].includes(status)) throw new AppError(422, 'validation_error', 'Calendar statusが不正です。')
  const db = createDb(c.env)
  const [item] = await db.select().from(calendarItems).where(and(eq(calendarItems.id, c.req.param('id')), eq(calendarItems.workspaceId, session.workspace.id))).limit(1)
  if (!item) throw new AppError(404, 'calendar_item_not_found', 'Calendar Itemが見つかりません。')
  await db.update(calendarItems).set({ status, updatedAt: now() }).where(eq(calendarItems.id, item.id))
  if (item.opportunityId && status === 'done') await db.update(opportunities).set({ status: 'done', updatedAt: now() }).where(eq(opportunities.id, item.opportunityId))
  return ok(c, { status })
})

productionRoutes.post('/learning/generate', async (c) => {
  const session = c.get('session')
  requireRole(session, canWrite)
  const db = createDb(c.env)
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const posts = await db.select().from(xPosts)
    .where(and(eq(xPosts.workspaceId, session.workspace.id), gte(xPosts.xCreatedAt, since)))
    .orderBy(desc(xPosts.xCreatedAt)).limit(300)
  const accounts = await db.select({ id: xAccounts.id, displayName: xAccounts.displayName }).from(xAccounts)
    .where(and(eq(xAccounts.workspaceId, session.workspace.id), isNull(xAccounts.archivedAt)))

  const generatedAt = now()
  const weekStart = weekStartIso()
  for (const account of accounts) {
    const items = posts.filter((post) => post.accountId === account.id)
    const scored = items.map((post) => {
      const metrics = parseObject(post.publicMetricsJson)
      const impressions = Number(metrics.impression_count ?? 0)
      const interactions = ['like_count', 'reply_count', 'retweet_count', 'repost_count', 'quote_count']
        .reduce((sum, key) => sum + Number(metrics[key] ?? 0), 0)
      const score = impressions > 0 ? Math.round((interactions / impressions) * 100_000) / 1000 : interactions
      return { xPostId: post.xPostId, text: post.text.slice(0, 300), score, impressions, interactions }
    }).sort((a, b) => b.score - a.score)
    const winners = scored.slice(0, 3)
    const observations: string[] = []
    const recommendations: string[] = []
    if (items.length === 0) {
      observations.push('直近7日間のPostデータがありません。')
      recommendations.push('Posts同期後に再生成してください。')
    } else {
      observations.push(`直近7日間に${items.length}件のPostデータがあります。`)
      const avgInteractions = scored.reduce((sum, item) => sum + item.interactions, 0) / Math.max(1, scored.length)
      observations.push(`平均Interactionは${avgInteractions.toFixed(1)}件です。`)
      if (items.length < 3) recommendations.push('学習精度を上げるため、最低3件以上の実測Postを蓄積してください。')
      if (winners[0]) recommendations.push(`上位Post「${winners[0].text.slice(0, 40)}」のHook・Angleを次のDraftで再利用候補にしてください。`)
      const zeroImpressions = scored.filter((item) => item.impressions === 0).length
      if (zeroImpressions > 0) recommendations.push('Impressionが取得できないPostがあるため、率ベース評価だけで判断しないでください。')
    }
    await db.delete(weeklyLearnings).where(and(
      eq(weeklyLearnings.workspaceId, session.workspace.id),
      eq(weeklyLearnings.scope, 'account'),
      eq(weeklyLearnings.accountId, account.id),
      eq(weeklyLearnings.weekStart, weekStart),
    ))
    await db.insert(weeklyLearnings).values({
      id: id('wkl'),
      workspaceId: session.workspace.id,
      accountId: account.id,
      weekStart,
      scope: 'account',
      summary: items.length ? `${account.displayName}: ${items.length} posts / top score ${winners[0]?.score ?? 0}` : `${account.displayName}: data不足`,
      winnersJson: JSON.stringify(winners),
      observationsJson: JSON.stringify(observations),
      recommendationsJson: JSON.stringify(recommendations),
      sampleSize: items.length,
      generatedAt,
    })
  }
  await writeAudit(c.env, session, { action: 'weekly_learning.generated', entityType: 'weekly_learning', metadata: { posts: posts.length, accounts: accounts.length } })
  return ok(c, { weekStart, posts: posts.length, accounts: accounts.length })
})

productionRoutes.get('/revenue', async (c) => {
  const session = c.get('session')
  const db = createDb(c.env)
  const [links, events] = await Promise.all([
    db.select().from(attributionLinks).where(eq(attributionLinks.workspaceId, session.workspace.id)).orderBy(desc(attributionLinks.createdAt)),
    db.select().from(attributionEvents).where(eq(attributionEvents.workspaceId, session.workspace.id)).orderBy(desc(attributionEvents.occurredAt)).limit(1000),
  ])
  const totalsByCurrency: Record<string, number> = {}
  let totalClicks = 0
  let totalConversions = 0
  const mapped = links.map((link) => {
    const linked = events.filter((event) => event.linkId === link.id)
    const revenueByCurrency: Record<string, number> = {}
    for (const event of linked) {
      if (event.kind === 'click') totalClicks += 1
      if (event.kind === 'conversion') totalConversions += 1
      if (event.kind === 'revenue') {
        const amount = event.amountMicros / 1_000_000
        revenueByCurrency[event.currency] = (revenueByCurrency[event.currency] ?? 0) + amount
        totalsByCurrency[event.currency] = (totalsByCurrency[event.currency] ?? 0) + amount
      }
    }
    return {
      id: link.id,
      accountId: link.accountId,
      draftId: link.draftId,
      label: link.label,
      destinationUrl: link.destinationUrl,
      trackingKey: link.trackingKey,
      active: Boolean(link.active),
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
      clicks: linked.filter((event) => event.kind === 'click').length,
      conversions: linked.filter((event) => event.kind === 'conversion').length,
      revenueByCurrency,
    }
  })
  const result: RevenueOverview = { links: mapped, totalsByCurrency, totalClicks, totalConversions }
  return ok(c, result)
})

productionRoutes.post('/revenue/links', async (c) => {
  const session = c.get('session')
  requireRole(session, canWrite)
  const body = await readJson<Record<string, unknown>>(c)
  const accountId = text(body.accountId, 128)
  const draftId = text(body.draftId, 128) || null
  const label = text(body.label, 160)
  const destinationUrl = safeUrl(text(body.destinationUrl, 3000))
  if (!accountId || !label) throw new AppError(422, 'validation_error', 'アカウント・ラベル・遷移先URLを入力してください。')
  await assertAccount(c.env, session.workspace.id, accountId)
  const db = createDb(c.env)
  if (draftId) {
    const [draft] = await db.select({ id: contentDrafts.id }).from(contentDrafts).where(and(eq(contentDrafts.id, draftId), eq(contentDrafts.workspaceId, session.workspace.id), eq(contentDrafts.accountId, accountId))).limit(1)
    if (!draft) throw new AppError(422, 'invalid_draft', '選択したDraftが見つかりません。')
  }
  const timestamp = now()
  const linkId = id('atl')
  const trackingKey = crypto.randomUUID().replaceAll('-', '')
  await db.insert(attributionLinks).values({
    id: linkId,
    workspaceId: session.workspace.id,
    accountId,
    draftId,
    label,
    destinationUrl,
    trackingKey,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await writeAudit(c.env, session, { action: 'attribution_link.created', entityType: 'attribution_link', entityId: linkId, accountId })
  return ok(c, { id: linkId, trackingKey, path: `/r/${trackingKey}` }, 201)
})

productionRoutes.patch('/revenue/links/:id', async (c) => {
  const session = c.get('session')
  requireRole(session, canWrite)
  const body = await readJson<Record<string, unknown>>(c)
  const db = createDb(c.env)
  const [link] = await db.select().from(attributionLinks).where(and(eq(attributionLinks.id, c.req.param('id')), eq(attributionLinks.workspaceId, session.workspace.id))).limit(1)
  if (!link) throw new AppError(404, 'attribution_link_not_found', 'Attribution Linkが見つかりません。')
  const active = body.active !== false
  await db.update(attributionLinks).set({ active, updatedAt: now() }).where(eq(attributionLinks.id, link.id))
  return ok(c, { active })
})

productionRoutes.post('/revenue/links/:id/event', async (c) => {
  const session = c.get('session')
  requireRole(session, canWrite)
  const body = await readJson<Record<string, unknown>>(c)
  const kind = String(body.kind ?? '') as AttributionEventKind
  if (!['conversion', 'revenue'].includes(kind)) throw new AppError(422, 'validation_error', 'conversion / revenueのみ手動記録できます。')
  const db = createDb(c.env)
  const [link] = await db.select().from(attributionLinks).where(and(eq(attributionLinks.id, c.req.param('id')), eq(attributionLinks.workspaceId, session.workspace.id))).limit(1)
  if (!link) throw new AppError(404, 'attribution_link_not_found', 'Attribution Linkが見つかりません。')
  const amount = kind === 'revenue' ? Number(body.amount ?? 0) : 0
  if (kind === 'revenue' && (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000)) throw new AppError(422, 'validation_error', '売上金額を確認してください。')
  const currency = (text(body.currency, 8) || 'JPY').toUpperCase()
  const timestamp = body.occurredAt && Number.isFinite(Date.parse(String(body.occurredAt))) ? new Date(String(body.occurredAt)).toISOString() : now()
  await db.insert(attributionEvents).values({
    id: id('ate'),
    workspaceId: session.workspace.id,
    linkId: link.id,
    accountId: link.accountId,
    kind,
    amountMicros: Math.round(amount * 1_000_000),
    currency,
    occurredAt: timestamp,
    source: 'manual',
    metadataJson: JSON.stringify({ note: text(body.note, 1000) }),
    createdAt: now(),
  })
  await writeAudit(c.env, session, { action: `attribution.${kind}`, entityType: 'attribution_event', entityId: link.id, accountId: link.accountId, metadata: { amount, currency } })
  return ok(c, { recorded: true })
})

productionRoutes.get('/export', async (c) => {
  const session = c.get('session')
  const db = createDb(c.env)
  const workspaceId = session.workspace.id
  const [
    workspace, members, accounts, strategies, voices, sourceRows, targetRows, researchRows,
    drafts, versions, feedback, memories, posts, snapshots, inbox, costs, budget, syncs,
    opportunityRows, calendarRows, learningRows, linkRows, eventRows, audits, settingRows, safeConnections,
  ] = await Promise.all([
    db.select().from(workspaces).where(eq(workspaces.id, workspaceId)),
    db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId)),
    db.select().from(xAccounts).where(eq(xAccounts.workspaceId, workspaceId)),
    db.select().from(accountStrategies).where(eq(accountStrategies.workspaceId, workspaceId)),
    db.select().from(voiceProfiles).where(eq(voiceProfiles.workspaceId, workspaceId)),
    db.select().from(researchSources).where(eq(researchSources.workspaceId, workspaceId)),
    db.select().from(researchTargets).where(eq(researchTargets.workspaceId, workspaceId)),
    db.select().from(researchItems).where(eq(researchItems.workspaceId, workspaceId)),
    db.select().from(contentDrafts).where(eq(contentDrafts.workspaceId, workspaceId)),
    db.select().from(draftVersions).where(eq(draftVersions.workspaceId, workspaceId)),
    db.select().from(draftFeedback).where(eq(draftFeedback.workspaceId, workspaceId)),
    db.select().from(voiceMemories).where(eq(voiceMemories.workspaceId, workspaceId)),
    db.select().from(xPosts).where(eq(xPosts.workspaceId, workspaceId)),
    db.select().from(xPostMetricSnapshots).where(eq(xPostMetricSnapshots.workspaceId, workspaceId)),
    db.select().from(xEngagementInbox).where(eq(xEngagementInbox.workspaceId, workspaceId)),
    db.select().from(xCostLedger).where(eq(xCostLedger.workspaceId, workspaceId)),
    db.select().from(xBudgetSettings).where(eq(xBudgetSettings.workspaceId, workspaceId)),
    db.select().from(xSyncRuns).where(eq(xSyncRuns.workspaceId, workspaceId)),
    db.select().from(opportunities).where(eq(opportunities.workspaceId, workspaceId)),
    db.select().from(calendarItems).where(eq(calendarItems.workspaceId, workspaceId)),
    db.select().from(weeklyLearnings).where(eq(weeklyLearnings.workspaceId, workspaceId)),
    db.select().from(attributionLinks).where(eq(attributionLinks.workspaceId, workspaceId)),
    db.select().from(attributionEvents).where(eq(attributionEvents.workspaceId, workspaceId)),
    db.select().from(auditLogs).where(eq(auditLogs.workspaceId, workspaceId)),
    db.select().from(settings).where(eq(settings.workspaceId, workspaceId)),
    db.select({
      id: xConnections.id,
      accountId: xConnections.accountId,
      xUserId: xConnections.xUserId,
      username: xConnections.username,
      displayName: xConnections.displayName,
      scopes: xConnections.scopes,
      status: xConnections.status,
      tokenExpiresAt: xConnections.tokenExpiresAt,
      connectedAt: xConnections.connectedAt,
      lastRefreshedAt: xConnections.lastRefreshedAt,
      lastSyncedAt: xConnections.lastSyncedAt,
      lastError: xConnections.lastError,
      updatedAt: xConnections.updatedAt,
    }).from(xConnections).where(eq(xConnections.workspaceId, workspaceId)),
  ])

  const data = {
    workspace, members, accounts, strategies, voices,
    research: { sources: sourceRows, targets: targetRows, items: researchRows },
    content: { drafts, versions, feedback, voiceMemories: memories },
    x: { connections: safeConnections, posts, metricSnapshots: snapshots, inbox, costs, budget, syncs },
    production: { opportunities: opportunityRows, calendar: calendarRows, learnings: learningRows, attributionLinks: linkRows, attributionEvents: eventRows },
    audits, settings: settingRows,
  }
  const generatedAt = now()
  const serialized = JSON.stringify({ version: 1, generatedAt, data })
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized))
  const checksumSha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  await writeAudit(c.env, session, { action: 'workspace.exported', entityType: 'workspace', entityId: workspaceId, metadata: { checksumSha256 } })
  return ok(c, { version: 1, generatedAt, checksumSha256, data })
})
