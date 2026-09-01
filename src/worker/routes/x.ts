import { and, desc, eq, gte, isNull, lt } from 'drizzle-orm'
import { Hono } from 'hono'
import type { XAccountHealth, XAnalyticsOverview, XConnection, XInboxStatus, XMetricValues, XPostRecord, XSyncKind } from '../../shared/contracts'
import { createDb } from '../db/client'
import { xAccounts, xApiCache, xBudgetSettings, xConnections, xCostLedger, xEngagementInbox, xOauthStates, xPostMetricSnapshots, xPosts, xSyncRuns } from '../db/schema'
import { writeAudit } from '../lib/audit'
import { requireRole } from '../lib/authorization'
import { assertBudget, costSummary, ensureBudget, recordXCost, updateBudget } from '../lib/budget'
import { decryptSecret, encryptSecret, pkceChallenge, randomUrlSafe } from '../lib/crypto'
import { AppError, ok, readJson } from '../lib/http'
import { microsToUsd, X_PRICING_VERSION, X_UNIT_COST_MICROUSD } from '../lib/x-pricing'
import { exchangeAuthorizationCode, requireXConfig, xApiJson, xScopes } from '../lib/x-client'
import type { AppEnv } from '../types'

export const xRoutes = new Hono<AppEnv>()
const canWrite = ['owner', 'admin', 'editor'] as const
const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`
const safeJson = (value: string | null | undefined): Record<string, number> => {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)]))
  } catch { return {} }
}
const clampLimit = (value: unknown) => Math.max(5, Math.min(100, Math.round(Number(value) || 20)))

function connectionDto(row: typeof xConnections.$inferSelect): XConnection {
  return {
    id: row.id,
    accountId: row.accountId,
    xUserId: row.xUserId,
    username: row.username,
    displayName: row.displayName,
    scopes: row.scopes.split(/\s+/).filter(Boolean),
    status: row.status,
    tokenExpiresAt: row.tokenExpiresAt,
    connectedAt: row.connectedAt,
    lastRefreshedAt: row.lastRefreshedAt,
    lastSyncedAt: row.lastSyncedAt,
    lastError: row.lastError,
  }
}

function metricValues(publicMetrics: Record<string, number>, nonPublic: Record<string, number>, organic: Record<string, number>): XMetricValues {
  return {
    impressionCount: Number(nonPublic.impression_count ?? organic.impression_count ?? publicMetrics.impression_count ?? 0),
    likeCount: Number(publicMetrics.like_count ?? 0),
    replyCount: Number(publicMetrics.reply_count ?? 0),
    repostCount: Number(publicMetrics.retweet_count ?? publicMetrics.repost_count ?? 0),
    quoteCount: Number(publicMetrics.quote_count ?? 0),
    bookmarkCount: Number(publicMetrics.bookmark_count ?? 0),
    urlLinkClicks: Number(nonPublic.url_link_clicks ?? organic.url_link_clicks ?? 0),
    userProfileClicks: Number(nonPublic.user_profile_clicks ?? organic.user_profile_clicks ?? 0),
  }
}

function postDto(row: typeof xPosts.$inferSelect): XPostRecord {
  const publicMetrics = safeJson(row.publicMetricsJson)
  const nonPublicMetrics = safeJson(row.nonPublicMetricsJson)
  const organicMetrics = safeJson(row.organicMetricsJson)
  return {
    id: row.id, accountId: row.accountId, xPostId: row.xPostId, text: row.text,
    conversationId: row.conversationId, lang: row.lang, xCreatedAt: row.xCreatedAt,
    publicMetrics, nonPublicMetrics, organicMetrics,
    metrics: metricValues(publicMetrics, nonPublicMetrics, organicMetrics),
    fetchedAt: row.fetchedAt,
  }
}

async function accountFor(c: any, accountId: string) {
  const session = c.get('session')
  const db = createDb(c.env)
  const [account] = await db.select().from(xAccounts)
    .where(and(eq(xAccounts.id, accountId), eq(xAccounts.workspaceId, session.workspace.id), isNull(xAccounts.archivedAt))).limit(1)
  if (!account) throw new AppError(404, 'account_not_found', 'アカウントが見つかりません。')
  return account
}

async function connectionFor(c: any, accountId: string) {
  const session = c.get('session')
  const db = createDb(c.env)
  const [connection] = await db.select().from(xConnections)
    .where(and(eq(xConnections.accountId, accountId), eq(xConnections.workspaceId, session.workspace.id))).limit(1)
  if (!connection || connection.status === 'revoked') throw new AppError(409, 'x_not_connected', 'Xアカウントが接続されていません。')
  return connection
}

async function cacheGet<T>(c: any, key: string) {
  const session = c.get('session')
  const db = createDb(c.env)
  const [row] = await db.select().from(xApiCache)
    .where(and(eq(xApiCache.cacheKey, key), eq(xApiCache.workspaceId, session.workspace.id), gte(xApiCache.expiresAt, now()))).limit(1)
  if (!row) return null
  try { return JSON.parse(row.responseJson) as T } catch { return null }
}

async function cachePut(c: any, key: string, accountId: string | null, endpoint: string, value: unknown, ttlSeconds: number) {
  const session = c.get('session')
  const db = createDb(c.env)
  const timestamp = now()
  await db.insert(xApiCache).values({
    cacheKey: key, workspaceId: session.workspace.id, accountId, endpoint,
    responseJson: JSON.stringify(value), expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    createdAt: timestamp, updatedAt: timestamp,
  }).onConflictDoUpdate({ target: xApiCache.cacheKey, set: { responseJson: JSON.stringify(value), expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(), updatedAt: timestamp } })
}

async function syncRun(c: any, kind: XSyncKind, accountId: string, limit: number, work: () => Promise<{ returned: number; costMicros: number; cached: boolean }>) {
  const session = c.get('session')
  const db = createDb(c.env)
  const runId = id('xsr')
  const started = now()
  await db.insert(xSyncRuns).values({ id: runId, workspaceId: session.workspace.id, accountId, kind, status: 'running', requestedLimit: limit, returnedCount: 0, estimatedCostMicrousd: 0, errorMessage: '', startedAt: started, finishedAt: null })
  try {
    const result = await work()
    await db.update(xSyncRuns).set({ status: 'success', returnedCount: result.returned, estimatedCostMicrousd: result.costMicros, finishedAt: now() }).where(eq(xSyncRuns.id, runId))
    return result
  } catch (error) {
    await db.update(xSyncRuns).set({ status: error instanceof AppError && error.code === 'x_budget_exceeded' ? 'blocked' : 'error', errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'unknown', finishedAt: now() }).where(eq(xSyncRuns.id, runId))
    throw error
  }
}

xRoutes.get('/status', async (c) => {
  let configured = true
  let callbackUrl: string | null = null
  try { callbackUrl = requireXConfig(c.env).redirectUri } catch { configured = false }
  return ok(c, { configured, callbackUrl, scopes: xScopes(c.env), pricingVersion: X_PRICING_VERSION })
})

xRoutes.post('/oauth/start', async (c) => {
  const session = c.get('session')
  requireRole(session, canWrite)
  const body = await readJson<Record<string, unknown>>(c)
  const accountId = typeof body.accountId === 'string' ? body.accountId : ''
  await accountFor(c, accountId)
  const config = requireXConfig(c.env)
  const db = createDb(c.env)
  await db.delete(xOauthStates).where(lt(xOauthStates.expiresAt, now()))
  const state = randomUrlSafe(32)
  const verifier = randomUrlSafe(64)
  const challenge = await pkceChallenge(verifier)
  const timestamp = now()
  await db.insert(xOauthStates).values({
    state, workspaceId: session.workspace.id, userId: session.user.id, accountId,
    codeVerifierEnc: await encryptSecret(c.env, verifier), redirectUri: config.redirectUri,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), createdAt: timestamp,
  })
  const url = new URL('https://x.com/i/oauth2/authorize')
  url.search = new URLSearchParams({
    response_type: 'code', client_id: config.clientId, redirect_uri: config.redirectUri,
    scope: config.scopes.join(' '), state, code_challenge: challenge, code_challenge_method: 'S256',
  }).toString()
  await writeAudit(c.env, session, { action: 'x.oauth_started', entityType: 'x_connection', accountId })
  return ok(c, { authorizeUrl: url.toString() })
})

xRoutes.get('/oauth/callback', async (c) => {
  const session = c.get('session')
  const state = c.req.query('state') ?? ''
  const code = c.req.query('code') ?? ''
  const oauthError = c.req.query('error')
  if (oauthError) return c.redirect('/analytics?oauth=cancelled')
  if (!state || !code) throw new AppError(400, 'oauth_callback_invalid', 'X OAuth callbackが不正です。')
  const db = createDb(c.env)
  const [pending] = await db.select().from(xOauthStates).where(eq(xOauthStates.state, state)).limit(1)
  if (!pending || pending.workspaceId !== session.workspace.id || pending.userId !== session.user.id || Date.parse(pending.expiresAt) < Date.now()) {
    throw new AppError(400, 'oauth_state_invalid', 'X OAuth stateが無効または期限切れです。')
  }
  await db.delete(xOauthStates).where(eq(xOauthStates.state, state))
  const account = await accountFor(c, pending.accountId)
  const verifier = await decryptSecret(c.env, pending.codeVerifierEnc)
  const token = await exchangeAuthorizationCode(c.env, code, verifier, pending.redirectUri)

  await assertBudget(c.env, session, X_UNIT_COST_MICROUSD.user_read)
  const temporary = {
    id: 'oauth-temp', workspaceId: session.workspace.id, accountId: account.id, xUserId: '', username: '',
    displayName: '', accessTokenEnc: await encryptSecret(c.env, token.accessToken),
    refreshTokenEnc: await encryptSecret(c.env, token.refreshToken), tokenExpiresAt: new Date(Date.now() + token.expiresIn * 1000).toISOString(),
    scopes: token.scope, status: 'connected' as const, lastError: '', connectedAt: now(), lastRefreshedAt: null, lastSyncedAt: null, createdAt: now(), updatedAt: now(),
  }
  const meResult = await xApiJson<{ data?: { id?: string; username?: string; name?: string } }>(c.env, temporary as any, '/users/me?user.fields=name,username')
  const me = meResult.data.data
  if (!me?.id || !me.username) throw new AppError(502, 'x_identity_missing', 'Xアカウント情報を取得できませんでした。')
  await recordXCost(c.env, { workspaceId: session.workspace.id, accountId: account.id, operation: 'oauth_identity', endpoint: 'GET /2/users/me', resourceType: 'user', units: 1, priceKey: 'user_read', requestId: meResult.requestId })

  if (me.username.toLowerCase() !== account.handle.toLowerCase()) {
    throw new AppError(409, 'x_account_mismatch', `接続したXアカウント @${me.username} と登録済み @${account.handle} が一致しません。登録handleを確認してください。`)
  }

  const timestamp = now()
  const connectionId = id('xcn')
  const accessTokenEnc = await encryptSecret(c.env, token.accessToken)
  const refreshTokenEnc = token.refreshToken ? await encryptSecret(c.env, token.refreshToken) : ''
  await db.insert(xConnections).values({
    id: connectionId, workspaceId: session.workspace.id, accountId: account.id, xUserId: me.id,
    username: me.username.toLowerCase(), displayName: me.name ?? account.displayName,
    accessTokenEnc, refreshTokenEnc, tokenExpiresAt: new Date(Date.now() + token.expiresIn * 1000).toISOString(),
    scopes: token.scope, status: 'connected', lastError: '', connectedAt: timestamp, lastRefreshedAt: null, lastSyncedAt: null,
    createdAt: timestamp, updatedAt: timestamp,
  }).onConflictDoUpdate({
    target: [xConnections.workspaceId, xConnections.accountId],
    set: { xUserId: me.id, username: me.username.toLowerCase(), displayName: me.name ?? account.displayName, accessTokenEnc, refreshTokenEnc, tokenExpiresAt: new Date(Date.now() + token.expiresIn * 1000).toISOString(), scopes: token.scope, status: 'connected', lastError: '', connectedAt: timestamp, updatedAt: timestamp },
  })
  await writeAudit(c.env, session, { action: 'x.connected', entityType: 'x_connection', accountId: account.id, metadata: { xUserId: me.id, username: me.username } })
  return c.redirect('/analytics?oauth=connected')
})

xRoutes.get('/connections', async (c) => {
  const session = c.get('session')
  const db = createDb(c.env)
  const rows = await db.select().from(xConnections).where(eq(xConnections.workspaceId, session.workspace.id)).orderBy(desc(xConnections.updatedAt))
  return ok(c, rows.map(connectionDto))
})

xRoutes.post('/connections/:accountId/disconnect', async (c) => {
  const session = c.get('session'); requireRole(session, canWrite)
  const accountId = c.req.param('accountId')
  const db = createDb(c.env)
  const [connection] = await db.select().from(xConnections).where(and(eq(xConnections.workspaceId, session.workspace.id), eq(xConnections.accountId, accountId))).limit(1)
  if (!connection) throw new AppError(404, 'x_connection_not_found', 'X接続情報がありません。')
  await db.update(xConnections).set({ accessTokenEnc: '', refreshTokenEnc: '', tokenExpiresAt: null, status: 'revoked', lastError: '', updatedAt: now() }).where(eq(xConnections.id, connection.id))
  await writeAudit(c.env, session, { action: 'x.disconnected', entityType: 'x_connection', accountId })
  return ok(c, { disconnected: true })
})

xRoutes.post('/sync/posts/:accountId', async (c) => {
  const session = c.get('session'); requireRole(session, canWrite)
  const accountId = c.req.param('accountId'); const body: Record<string, unknown> = await readJson<Record<string, unknown>>(c).catch(() => ({} as Record<string, unknown>))
  const limit = clampLimit(body.limit); const force = body.force === true
  const connection = await connectionFor(c, accountId)
  return ok(c, await syncRun(c, 'posts', accountId, limit, async () => {
    const cacheKey = `x:posts:${session.workspace.id}:${accountId}:${limit}`
    if (!force) {
      const cached = await cacheGet<{ returned: number; syncedAt: string }>(c, cacheKey)
      if (cached) return { returned: cached.returned, costMicros: 0, cached: true }
    }
    await assertBudget(c.env, session, limit * X_UNIT_COST_MICROUSD.post_read)
    const path = `/users/${encodeURIComponent(connection.xUserId)}/tweets?max_results=${limit}&tweet.fields=created_at,conversation_id,lang,public_metrics,non_public_metrics,organic_metrics`
    const result = await xApiJson<{ data?: Array<any> }>(c.env, connection, path)
    const items = Array.isArray(result.data.data) ? result.data.data : []
    const db = createDb(c.env); const timestamp = now()
    for (const item of items) {
      const publicMetrics = item.public_metrics ?? {}; const nonPublic = item.non_public_metrics ?? {}; const organic = item.organic_metrics ?? {}
      const postId = `xps_${item.id}`
      await db.insert(xPosts).values({
        id: postId, workspaceId: session.workspace.id, accountId, xPostId: String(item.id), text: String(item.text ?? ''),
        conversationId: String(item.conversation_id ?? ''), lang: String(item.lang ?? ''), xCreatedAt: item.created_at ? String(item.created_at) : null,
        publicMetricsJson: JSON.stringify(publicMetrics), nonPublicMetricsJson: JSON.stringify(nonPublic), organicMetricsJson: JSON.stringify(organic),
        fetchedAt: timestamp, createdAt: timestamp, updatedAt: timestamp,
      }).onConflictDoUpdate({ target: [xPosts.workspaceId, xPosts.xPostId], set: {
        text: String(item.text ?? ''), conversationId: String(item.conversation_id ?? ''), lang: String(item.lang ?? ''),
        publicMetricsJson: JSON.stringify(publicMetrics), nonPublicMetricsJson: JSON.stringify(nonPublic), organicMetricsJson: JSON.stringify(organic),
        fetchedAt: timestamp, updatedAt: timestamp,
      }})
      const metrics = metricValues(publicMetrics, nonPublic, organic)
      await db.insert(xPostMetricSnapshots).values({ id: id('xms'), workspaceId: session.workspace.id, accountId, postId, capturedAt: timestamp, ...metrics })
    }
    const costMicros = await recordXCost(c.env, { workspaceId: session.workspace.id, accountId, operation: 'sync_posts', endpoint: 'GET /2/users/{id}/tweets', resourceType: 'post', units: items.length, priceKey: 'post_read', requestId: result.requestId, metadata: { requestedLimit: limit } })
    await db.update(xConnections).set({ lastSyncedAt: timestamp, status: 'connected', lastError: '', updatedAt: timestamp }).where(eq(xConnections.id, connection.id))
    await cachePut(c, cacheKey, accountId, 'GET /2/users/{id}/tweets', { returned: items.length, syncedAt: timestamp }, 600)
    return { returned: items.length, costMicros, cached: false }
  }).then((r) => ({ kind: 'posts', accountId, returned: r.returned, cached: r.cached, estimatedCostUsd: microsToUsd(r.costMicros), syncedAt: now() })))
})

xRoutes.post('/sync/mentions/:accountId', async (c) => {
  const session = c.get('session'); requireRole(session, canWrite)
  const accountId = c.req.param('accountId'); const body: Record<string, unknown> = await readJson<Record<string, unknown>>(c).catch(() => ({} as Record<string, unknown>))
  const limit = clampLimit(body.limit); const force = body.force === true
  const connection = await connectionFor(c, accountId)
  return ok(c, await syncRun(c, 'mentions', accountId, limit, async () => {
    const cacheKey = `x:mentions:${session.workspace.id}:${accountId}:${limit}`
    if (!force) {
      const cached = await cacheGet<{ returned: number }>(c, cacheKey)
      if (cached) return { returned: cached.returned, costMicros: 0, cached: true }
    }
    await assertBudget(c.env, session, limit * X_UNIT_COST_MICROUSD.post_read)
    const path = `/users/${encodeURIComponent(connection.xUserId)}/mentions?max_results=${limit}&tweet.fields=author_id,created_at,public_metrics`
    const result = await xApiJson<{ data?: Array<any> }>(c.env, connection, path)
    const items = Array.isArray(result.data.data) ? result.data.data : []
    const db = createDb(c.env); const timestamp = now()
    for (const item of items) {
      await db.insert(xEngagementInbox).values({
        id: id('xin'), workspaceId: session.workspace.id, accountId, xPostId: String(item.id),
        authorId: String(item.author_id ?? ''), text: String(item.text ?? ''), xCreatedAt: item.created_at ? String(item.created_at) : null,
        publicMetricsJson: JSON.stringify(item.public_metrics ?? {}), status: 'new', firstSeenAt: timestamp, updatedAt: timestamp,
      }).onConflictDoUpdate({ target: [xEngagementInbox.workspaceId, xEngagementInbox.accountId, xEngagementInbox.xPostId], set: {
        text: String(item.text ?? ''), authorId: String(item.author_id ?? ''), publicMetricsJson: JSON.stringify(item.public_metrics ?? {}), updatedAt: timestamp,
      }})
    }
    const costMicros = await recordXCost(c.env, { workspaceId: session.workspace.id, accountId, operation: 'sync_mentions', endpoint: 'GET /2/users/{id}/mentions', resourceType: 'post', units: items.length, priceKey: 'post_read', requestId: result.requestId, metadata: { requestedLimit: limit } })
    await cachePut(c, cacheKey, accountId, 'GET /2/users/{id}/mentions', { returned: items.length }, 600)
    return { returned: items.length, costMicros, cached: false }
  }).then((r) => ({ kind: 'mentions', accountId, returned: r.returned, cached: r.cached, estimatedCostUsd: microsToUsd(r.costMicros), syncedAt: now() })))
})

xRoutes.patch('/inbox/:id', async (c) => {
  const session = c.get('session'); requireRole(session, canWrite)
  const body = await readJson<Record<string, unknown>>(c); const status = String(body.status ?? '') as XInboxStatus
  if (!['new', 'read', 'acted', 'ignored'].includes(status)) throw new AppError(422, 'validation_error', 'Inbox statusが不正です。')
  const db = createDb(c.env)
  const [item] = await db.select().from(xEngagementInbox).where(and(eq(xEngagementInbox.id, c.req.param('id')), eq(xEngagementInbox.workspaceId, session.workspace.id))).limit(1)
  if (!item) throw new AppError(404, 'inbox_item_not_found', 'Inbox Itemが見つかりません。')
  await db.update(xEngagementInbox).set({ status, updatedAt: now() }).where(eq(xEngagementInbox.id, item.id))
  return ok(c, { status })
})

xRoutes.get('/cost', async (c) => ok(c, await costSummary(c.env, c.get('session'))))

xRoutes.patch('/budget', async (c) => {
  const session = c.get('session'); requireRole(session, ['owner', 'admin'])
  const budget = await updateBudget(c.env, session, await readJson<unknown>(c))
  await writeAudit(c.env, session, { action: 'x.budget_updated', entityType: 'x_budget', metadata: { monthlyBudgetMicrousd: budget.monthlyBudgetMicrousd, warningPercent: budget.warningPercent, hardLimitEnabled: budget.hardLimitEnabled } })
  return ok(c, { monthlyBudgetUsd: microsToUsd(budget.monthlyBudgetMicrousd), warningPercent: budget.warningPercent, hardLimitEnabled: Boolean(budget.hardLimitEnabled) })
})

xRoutes.get('/overview', async (c) => {
  const session = c.get('session'); const db = createDb(c.env)
  let configured = true; let callbackUrl: string | null = null
  try { callbackUrl = requireXConfig(c.env).redirectUri } catch { configured = false }
  const [connections, posts, inbox, cost, budget] = await Promise.all([
    db.select().from(xConnections).where(eq(xConnections.workspaceId, session.workspace.id)).orderBy(desc(xConnections.updatedAt)),
    db.select().from(xPosts).where(eq(xPosts.workspaceId, session.workspace.id)).orderBy(desc(xPosts.xCreatedAt)).limit(100),
    db.select().from(xEngagementInbox).where(eq(xEngagementInbox.workspaceId, session.workspace.id)).orderBy(desc(xEngagementInbox.xCreatedAt)).limit(100),
    costSummary(c.env, session),
    ensureBudget(c.env, session),
  ])
  const health = connections.map((connection) => {
    const expiry = connection.tokenExpiresAt ? Date.parse(connection.tokenExpiresAt) : 0
    const tokenState: XAccountHealth['tokenState'] = !connection.accessTokenEnc ? 'missing' : expiry <= Date.now() ? 'expired' : expiry - Date.now() < 15 * 60 * 1000 ? 'expiring' : 'valid'
    const status: XAccountHealth['status'] = connection.status === 'error' || tokenState === 'expired' || tokenState === 'missing' ? 'error' : tokenState === 'expiring' || !connection.lastSyncedAt ? 'warning' : 'healthy'
    return { accountId: connection.accountId, connected: connection.status === 'connected', status, tokenState, lastSyncedAt: connection.lastSyncedAt, lastError: connection.lastError }
  })
  const result: XAnalyticsOverview = {
    configured, callbackUrl, scopes: xScopes(c.env), connections: connections.map(connectionDto),
    posts: posts.map(postDto),
    inbox: inbox.map((row) => ({ id: row.id, accountId: row.accountId, xPostId: row.xPostId, authorId: row.authorId, text: row.text, xCreatedAt: row.xCreatedAt, publicMetrics: safeJson(row.publicMetricsJson), status: row.status, firstSeenAt: row.firstSeenAt, updatedAt: row.updatedAt })),
    cost,
    budget: { monthlyBudgetUsd: microsToUsd(budget.monthlyBudgetMicrousd), warningPercent: budget.warningPercent, hardLimitEnabled: Boolean(budget.hardLimitEnabled) },
    health,
  }
  return ok(c, result)
})
