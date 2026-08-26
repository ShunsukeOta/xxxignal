import { and, desc, eq, isNull } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import type { ResearchItemInput, ResearchSourceInput, ResearchTargetInput } from '../../shared/contracts'
import { createDb } from '../db/client'
import { researchItems, researchSources, researchTargets, xAccounts } from '../db/schema'
import { writeAudit } from '../lib/audit'
import { requireRole } from '../lib/authorization'
import { AppError, ok, readJson } from '../lib/http'
import type { AppEnv } from '../types'

export const researchRoutes = new Hono<AppEnv>()
const canWrite = ['owner', 'admin', 'editor'] as const
const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`

function normalizeHandle(value: string) {
  return value.trim().replace(/^@/, '').toLowerCase()
}

function cleanText(value: unknown, max = 5000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function safeHttpUrl(raw: string) {
  let url: URL
  try { url = new URL(raw) } catch { throw new AppError(400, 'invalid_url', '有効なURLを入力してください。') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new AppError(400, 'invalid_url_protocol', 'HTTP / HTTPS URLのみ利用できます。')
  if (url.username || url.password) throw new AppError(400, 'url_credentials_not_allowed', '認証情報を含むURLは利用できません。')
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new AppError(400, 'private_url_not_allowed', 'ローカルネットワークのURLは利用できません。')
  if (host.includes(':')) throw new AppError(400, 'ipv6_literal_not_allowed', 'IPv6リテラルURLはRSS Sourceに利用できません。')
  const parts = host.split('.').map(Number)
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [a, b] = parts
    if (a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
      throw new AppError(400, 'private_url_not_allowed', 'プライベート/特殊用途IPは利用できません。')
    }
  }
  return url
}

function validateSource(input: unknown): ResearchSourceInput {
  if (!input || typeof input !== 'object') throw new AppError(400, 'invalid_input', '入力内容が正しくありません。')
  const value = input as Record<string, unknown>
  const kind = value.kind
  if (!['rss', 'web', 'manual'].includes(String(kind))) throw new AppError(400, 'invalid_source_kind', 'Source種別が正しくありません。')
  const name = cleanText(value.name, 120)
  const url = cleanText(value.url, 2000)
  if (!name) throw new AppError(400, 'name_required', 'Source名を入力してください。')
  if (!url) throw new AppError(400, 'url_required', 'URLを入力してください。')
  safeHttpUrl(url)
  return { name, kind: kind as ResearchSourceInput['kind'], url, notes: cleanText(value.notes, 2000) }
}

function validateTarget(input: unknown): ResearchTargetInput {
  if (!input || typeof input !== 'object') throw new AppError(400, 'invalid_input', '入力内容が正しくありません。')
  const value = input as Record<string, unknown>
  const handle = normalizeHandle(cleanText(value.handle, 50))
  const role = String(value.role ?? 'competitor')
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new AppError(400, 'invalid_handle', 'Xユーザー名は英数字と_の15文字以内で入力してください。')
  if (!['competitor', 'target', 'reference'].includes(role)) throw new AppError(400, 'invalid_target_role', 'Target種別が正しくありません。')
  return { handle, displayName: cleanText(value.displayName, 120), role: role as ResearchTargetInput['role'], notes: cleanText(value.notes, 2000) }
}

async function validateItem(c: Context<AppEnv>, input: unknown): Promise<ResearchItemInput> {
  if (!input || typeof input !== 'object') throw new AppError(400, 'invalid_input', '入力内容が正しくありません。')
  const value = input as Record<string, unknown>
  const title = cleanText(value.title, 300)
  if (!title) throw new AppError(400, 'title_required', 'タイトルを入力してください。')
  const url = cleanText(value.url, 2000)
  if (url) safeHttpUrl(url)
  const kind = String(value.kind ?? 'manual')
  if (!['rss', 'web', 'x_post', 'manual'].includes(kind)) throw new AppError(400, 'invalid_item_kind', 'Research種別が正しくありません。')
  const accountId = cleanText(value.accountId, 120) || null
  if (accountId) {
    const session = c.get('session')
    const db = createDb(c.env)
    const [account] = await db.select({ id: xAccounts.id }).from(xAccounts)
      .where(and(eq(xAccounts.id, accountId), eq(xAccounts.workspaceId, session.workspace.id), isNull(xAccounts.archivedAt))).limit(1)
    if (!account) throw new AppError(400, 'invalid_account', '紐付け先アカウントが見つかりません。')
  }
  return { title, url, summary: cleanText(value.summary, 10000), topic: cleanText(value.topic, 120), kind: kind as ResearchItemInput['kind'], accountId }
}

async function fetchFeed(rawUrl: string) {
  let current = safeHttpUrl(rawUrl)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      const response = await fetch(current, { redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'xxxignal-research/1.0' } })
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirect === 3) throw new AppError(400, 'too_many_redirects', 'RSSのリダイレクト回数が多すぎます。')
        const location = response.headers.get('location')
        if (!location) throw new AppError(400, 'invalid_redirect', 'RSSのリダイレクト先を取得できません。')
        current = safeHttpUrl(new URL(location, current).toString())
        continue
      }
      if (!response.ok) throw new AppError(400, 'rss_fetch_failed', `RSS取得に失敗しました (${response.status})。`)
      const reader = response.body?.getReader()
      if (!reader) throw new AppError(400, 'rss_body_missing', 'RSS本文を取得できません。')
      const chunks: Uint8Array[] = []
      let total = 0
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > 2 * 1024 * 1024) {
          await reader.cancel()
          throw new AppError(400, 'rss_too_large', 'RSS本文が2MBを超えています。')
        }
        chunks.push(value)
      }
      const bytes = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      const xml = new TextDecoder().decode(bytes)
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new AppError(400, 'unsafe_xml', 'DOCTYPE / ENTITYを含むXMLは利用できません。')
      return xml
    }
    throw new AppError(400, 'rss_fetch_failed', 'RSSを取得できませんでした。')
  } catch (error) {
    if (error instanceof AppError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') throw new AppError(408, 'rss_timeout', 'RSS取得がタイムアウトしました。')
    throw new AppError(400, 'rss_fetch_failed', 'RSSを取得できませんでした。')
  } finally { clearTimeout(timer) }
}

function decodeXml(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
}

function firstTag(block: string, names: string[]) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))
    if (match?.[1]) return decodeXml(match[1])
  }
  return ''
}

function parseFeed(xml: string) {
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].slice(0, 50).map((match) => match[2])
  return blocks.map((block) => {
    const title = firstTag(block, ['title']) || '無題'
    let url = firstTag(block, ['link'])
    if (!url) url = block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] ?? ''
    const summary = firstTag(block, ['description', 'summary', 'content'])
    const publishedAt = firstTag(block, ['pubDate', 'published', 'updated'])
    const key = firstTag(block, ['guid', 'id']) || url || `${title}:${publishedAt}`
    return { title: title.slice(0, 300), url: url.slice(0, 2000), summary: summary.slice(0, 10000), publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null, key }
  })
}

async function hashKey(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

researchRoutes.get('/overview', async (c) => {
  const session = c.get('session'); const db = createDb(c.env)
  const [sources, targets, items] = await Promise.all([
    db.select().from(researchSources).where(and(eq(researchSources.workspaceId, session.workspace.id), isNull(researchSources.archivedAt))).orderBy(desc(researchSources.createdAt)),
    db.select().from(researchTargets).where(and(eq(researchTargets.workspaceId, session.workspace.id), isNull(researchTargets.archivedAt))).orderBy(desc(researchTargets.createdAt)),
    db.select().from(researchItems).where(and(eq(researchItems.workspaceId, session.workspace.id), isNull(researchItems.archivedAt))).orderBy(desc(researchItems.createdAt)).limit(200),
  ])
  return ok(c, { sources, targets, items })
})

researchRoutes.get('/archived', async (c) => {
  const session = c.get('session'); const db = createDb(c.env)
  const [sources, targets, items] = await Promise.all([
    db.select().from(researchSources).where(eq(researchSources.workspaceId, session.workspace.id)).orderBy(desc(researchSources.createdAt)),
    db.select().from(researchTargets).where(eq(researchTargets.workspaceId, session.workspace.id)).orderBy(desc(researchTargets.createdAt)),
    db.select().from(researchItems).where(eq(researchItems.workspaceId, session.workspace.id)).orderBy(desc(researchItems.createdAt)).limit(500),
  ])
  return ok(c, { sources: sources.filter((x) => x.archivedAt), targets: targets.filter((x) => x.archivedAt), items: items.filter((x) => x.archivedAt) })
})

researchRoutes.post('/sources', async (c) => {
  const session = c.get('session'); requireRole(session, canWrite); const db = createDb(c.env); const input = validateSource(await readJson(c)); const timestamp = now(); const sourceId = id('src')
  try { await db.insert(researchSources).values({ id: sourceId, workspaceId: session.workspace.id, ...input, lastSyncedAt: null, createdAt: timestamp, updatedAt: timestamp, archivedAt: null }) }
  catch { throw new AppError(409, 'duplicate_source', '同じURLのSourceがすでに登録されています。') }
  await writeAudit(c.env, session, { action: 'research_source.created', entityType: 'research_source', entityId: sourceId, metadata: { kind: input.kind, url: input.url } })
  return ok(c, { id: sourceId }, 201)
})

researchRoutes.post('/targets', async (c) => {
  const session = c.get('session'); requireRole(session, canWrite); const db = createDb(c.env); const input = validateTarget(await readJson(c)); const timestamp = now(); const targetId = id('tgt')
  try { await db.insert(researchTargets).values({ id: targetId, workspaceId: session.workspace.id, ...input, createdAt: timestamp, updatedAt: timestamp, archivedAt: null }) }
  catch { throw new AppError(409, 'duplicate_target', '同じXユーザー名はすでに登録されています。') }
  await writeAudit(c.env, session, { action: 'research_target.created', entityType: 'research_target', entityId: targetId, metadata: { handle: input.handle, role: input.role } })
  return ok(c, { id: targetId }, 201)
})

researchRoutes.post('/items', async (c) => {
  const session = c.get('session'); requireRole(session, canWrite); const db = createDb(c.env); const input = await validateItem(c, await readJson(c)); const timestamp = now(); const itemId = id('rsi')
  await db.insert(researchItems).values({ id: itemId, workspaceId: session.workspace.id, sourceId: null, externalKey: '', publishedAt: null, ...input, createdAt: timestamp, updatedAt: timestamp, archivedAt: null })
  await writeAudit(c.env, session, { action: 'research_item.created', entityType: 'research_item', entityId: itemId, accountId: input.accountId, metadata: { kind: input.kind, url: input.url } })
  return ok(c, { id: itemId }, 201)
})

researchRoutes.post('/sources/:id/sync', async (c) => {
  const session = c.get('session'); requireRole(session, canWrite); const db = createDb(c.env); const sourceId = c.req.param('id')
  const [source] = await db.select().from(researchSources).where(and(eq(researchSources.id, sourceId), eq(researchSources.workspaceId, session.workspace.id), isNull(researchSources.archivedAt))).limit(1)
  if (!source) throw new AppError(404, 'source_not_found', 'Sourceが見つかりません。')
  if (source.kind !== 'rss') throw new AppError(400, 'source_not_rss', 'RSS Sourceのみ同期できます。')
  const feed = parseFeed(await fetchFeed(source.url)); let inserted = 0
  for (const entry of feed) {
    const externalKey = await hashKey(entry.key)
    const exists = await db.select({ id: researchItems.id }).from(researchItems).where(and(eq(researchItems.workspaceId, session.workspace.id), eq(researchItems.sourceId, sourceId), eq(researchItems.externalKey, externalKey))).limit(1)
    if (exists.length) continue
    const timestamp = now()
    await db.insert(researchItems).values({ id: id('rsi'), workspaceId: session.workspace.id, sourceId, accountId: null, title: entry.title, url: entry.url, summary: entry.summary, topic: '', kind: 'rss', externalKey, publishedAt: entry.publishedAt, createdAt: timestamp, updatedAt: timestamp, archivedAt: null })
    inserted += 1
  }
  const timestamp = now(); await db.update(researchSources).set({ lastSyncedAt: timestamp, updatedAt: timestamp }).where(eq(researchSources.id, sourceId))
  await writeAudit(c.env, session, { action: 'research_source.synced', entityType: 'research_source', entityId: sourceId, metadata: { fetched: feed.length, inserted } })
  return ok(c, { fetched: feed.length, inserted, syncedAt: timestamp })
})

async function archiveEntity(c: Context<AppEnv>, type: 'source' | 'target' | 'item', restore: boolean) {
  const session = c.get('session'); requireRole(session, canWrite); const db = createDb(c.env); const timestamp = now(); const entityId = c.req.param('id')
  const table = type === 'source' ? researchSources : type === 'target' ? researchTargets : researchItems
  const [existing] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, entityId), eq(table.workspaceId, session.workspace.id))).limit(1)
  if (!existing) throw new AppError(404, 'research_entity_not_found', '対象データが見つかりません。')
  await db.update(table).set({ archivedAt: restore ? null : timestamp, updatedAt: timestamp }).where(and(eq(table.id, entityId), eq(table.workspaceId, session.workspace.id)))
  await writeAudit(c.env, session, { action: `research_${type}.${restore ? 'restored' : 'archived'}`, entityType: `research_${type}`, entityId })
  return ok(c, { archived: !restore })
}

for (const type of ['source', 'target', 'item'] as const) {
  researchRoutes.post(`/${type}s/:id/archive`, (c) => archiveEntity(c, type, false))
  researchRoutes.post(`/${type}s/:id/restore`, (c) => archiveEntity(c, type, true))
}
