import { and, desc, eq, isNull, ne } from 'drizzle-orm'
import type { DuplicateCheckResult } from '../../shared/contracts'
import type { Env } from '../env'
import { createDb } from '../db/client'
import { contentDrafts } from '../db/schema'

export function normalizeForDuplicate(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/https?:\/\/\S+/g, '[url]').replace(/[\s\u3000]+/g, '').replace(/[!-/:-@[-`{-~、。！？「」『』（）［］【】・…ー〜]/g, '').trim()
}
function ngrams(value: string, size = 3) { const result = new Set<string>(); if (!value) return result; if (value.length <= size) { result.add(value); return result } for (let index = 0; index <= value.length - size; index += 1) result.add(value.slice(index, index + size)); return result }
export function diceCoefficient(left: string, right: string) { if (!left || !right) return 0; if (left === right) return 1; const a = ngrams(left); const b = ngrams(right); if (!a.size || !b.size) return 0; let intersection = 0; for (const token of a) if (b.has(token)) intersection += 1; return (2 * intersection) / (a.size + b.size) }

export async function hashContent(body: string) {
  const normalized = normalizeForDuplicate(body)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function checkDuplicate(env: Env, workspaceId: string, accountId: string, body: string, excludeDraftId?: string): Promise<DuplicateCheckResult> {
  const db = createDb(env); const normalized = normalizeForDuplicate(body); const contentHash = await hashContent(body)
  if (!normalized) return { score: 0, level: 'none', match: null, contentHash }
  const conditions = [eq(contentDrafts.workspaceId, workspaceId), eq(contentDrafts.accountId, accountId), isNull(contentDrafts.archivedAt)]
  if (excludeDraftId) conditions.push(ne(contentDrafts.id, excludeDraftId))
  const candidates = await db.select({ id: contentDrafts.id, title: contentDrafts.title, body: contentDrafts.currentBody, hash: contentDrafts.contentHash }).from(contentDrafts).where(and(...conditions)).orderBy(desc(contentDrafts.updatedAt)).limit(200)
  let best: { id: string; title: string; score: number; exact: boolean } | null = null
  for (const candidate of candidates) { const exact = candidate.hash === contentHash; const score = exact ? 100 : Math.round(diceCoefficient(normalized, normalizeForDuplicate(candidate.body)) * 100); if (!best || score > best.score) best = { id: candidate.id, title: candidate.title, score, exact } }
  const score = best?.score ?? 0; const level = score >= 82 ? 'high' : score >= 65 ? 'medium' : score >= 35 ? 'low' : 'none'
  return { score, level, match: best && score >= 35 ? { draftId: best.id, title: best.title, score, exact: best.exact } : null, contentHash }
}


export function duplicateSimilarityScore(left: string, right: string) {
  return Math.round(diceCoefficient(normalizeForDuplicate(left), normalizeForDuplicate(right)) * 100)
}
