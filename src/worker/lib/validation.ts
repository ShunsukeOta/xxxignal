import type {
  AccountInput,
  AccountStatus,
  Assertiveness,
  EmojiUsage,
  MonetizationType,
  Politeness,
  PrimaryGoal,
  SentenceStyle,
  UiDensity,
} from '../../shared/contracts'
import { AppError } from './http'

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/
const accountStatuses = new Set<AccountStatus>(['draft', 'active', 'paused'])
const primaryGoals = new Set<PrimaryGoal>(['growth', 'traffic', 'sales', 'brand', 'community'])
const monetizationTypes = new Set<MonetizationType>(['none', 'affiliate', 'product', 'service', 'creator_rewards', 'other'])
const sentenceStyles = new Set<SentenceStyle>(['short', 'mixed', 'long'])
const politenessValues = new Set<Politeness>(['casual', 'neutral', 'polite'])
const emojiUsageValues = new Set<EmojiUsage>(['none', 'low', 'medium', 'high'])
const assertivenessValues = new Set<Assertiveness>(['soft', 'balanced', 'strong'])
const densityValues = new Set<UiDensity>(['comfortable', 'compact'])

const text = (value: unknown, maxLength: number) => typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
const list = (value: unknown, maxItems = 20, maxLength = 80) => {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxLength))
}

const enumValue = <T extends string>(value: unknown, values: Set<T>, fallback: T): T =>
  typeof value === 'string' && values.has(value as T) ? value as T : fallback

export function validateAccountInput(value: unknown): AccountInput {
  if (!value || typeof value !== 'object') {
    throw new AppError(422, 'validation_error', '入力内容を確認してください。')
  }

  const body = value as Record<string, unknown>
  const strategy = body.strategy && typeof body.strategy === 'object' ? body.strategy as Record<string, unknown> : {}
  const voice = body.voice && typeof body.voice === 'object' ? body.voice as Record<string, unknown> : {}
  const handle = text(body.handle, 15).replace(/^@/, '')
  const displayName = text(body.displayName, 80)
  const fields: Record<string, string> = {}

  if (!HANDLE_RE.test(handle)) fields.handle = 'Xユーザー名は英数字と_のみ、1〜15文字で入力してください。'
  if (!displayName) fields.displayName = '表示名を入力してください。'

  const postingTargetPerDayRaw = Number(strategy.postingTargetPerDay ?? 1)
  const postingTargetPerDay = Number.isFinite(postingTargetPerDayRaw)
    ? Math.max(0, Math.min(20, Math.round(postingTargetPerDayRaw)))
    : 1

  if (Object.keys(fields).length > 0) {
    throw new AppError(422, 'validation_error', '入力内容を確認してください。', fields)
  }

  return {
    handle: handle.toLowerCase(),
    displayName,
    niche: text(body.niche, 120),
    targetAudience: text(body.targetAudience, 500),
    purpose: text(body.purpose, 500),
    monetizationGoal: text(body.monetizationGoal, 500),
    timezone: text(body.timezone, 64) || 'Asia/Tokyo',
    notes: text(body.notes, 2000),
    status: enumValue(body.status, accountStatuses, 'draft'),
    strategy: {
      primaryGoal: enumValue(strategy.primaryGoal, primaryGoals, 'growth'),
      contentPillars: list(strategy.contentPillars, 12, 60),
      forbiddenTopics: list(strategy.forbiddenTopics, 20, 80),
      postingTargetPerDay,
      monetizationType: enumValue(strategy.monetizationType, monetizationTypes, 'none'),
      funnelNotes: text(strategy.funnelNotes, 2000),
      strategyMemo: text(strategy.strategyMemo, 4000),
    },
    voice: {
      toneKeywords: list(voice.toneKeywords, 12, 40),
      sentenceStyle: enumValue(voice.sentenceStyle, sentenceStyles, 'mixed'),
      politeness: enumValue(voice.politeness, politenessValues, 'neutral'),
      emojiUsage: enumValue(voice.emojiUsage, emojiUsageValues, 'low'),
      assertiveness: enumValue(voice.assertiveness, assertivenessValues, 'balanced'),
      preferredPhrases: list(voice.preferredPhrases, 30, 100),
      bannedPhrases: list(voice.bannedPhrases, 30, 100),
      samplePosts: text(voice.samplePosts, 12000),
    },
  }
}

export function validateSettingsInput(value: unknown) {
  if (!value || typeof value !== 'object') {
    throw new AppError(422, 'validation_error', '入力内容を確認してください。')
  }

  const body = value as Record<string, unknown>
  const userDisplayName = text(body.userDisplayName, 80)
  const workspaceName = text(body.workspaceName, 80)
  const defaultTimezone = text(body.defaultTimezone, 64) || 'Asia/Tokyo'
  const uiDensity = enumValue(body.uiDensity, densityValues, 'comfortable')
  const fields: Record<string, string> = {}

  if (!userDisplayName) fields.userDisplayName = '表示名を入力してください。'
  if (!workspaceName) fields.workspaceName = 'ワークスペース名を入力してください。'

  if (Object.keys(fields).length > 0) {
    throw new AppError(422, 'validation_error', '入力内容を確認してください。', fields)
  }

  return { userDisplayName, workspaceName, defaultTimezone, uiDensity }
}
