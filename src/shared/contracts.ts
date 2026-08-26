export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer'
export type AccountStatus = 'draft' | 'active' | 'paused'
export type PrimaryGoal = 'growth' | 'traffic' | 'sales' | 'brand' | 'community'
export type MonetizationType = 'none' | 'affiliate' | 'product' | 'service' | 'creator_rewards' | 'other'
export type SentenceStyle = 'short' | 'mixed' | 'long'
export type Politeness = 'casual' | 'neutral' | 'polite'
export type EmojiUsage = 'none' | 'low' | 'medium' | 'high'
export type Assertiveness = 'soft' | 'balanced' | 'strong'
export type UiDensity = 'comfortable' | 'compact'

export interface SessionUser {
  id: string
  email: string
  displayName: string
}

export interface SessionWorkspace {
  id: string
  name: string
  slug: string
  plan: 'personal' | 'beta' | 'pro'
  role: WorkspaceRole
}

export interface SessionData {
  user: SessionUser
  workspace: SessionWorkspace
  limits: {
    accountLimit: number
    activeAccountCount: number
  }
  phase: 1
}

export interface AccountStrategy {
  primaryGoal: PrimaryGoal
  contentPillars: string[]
  forbiddenTopics: string[]
  postingTargetPerDay: number
  monetizationType: MonetizationType
  funnelNotes: string
  strategyMemo: string
}

export interface VoiceProfile {
  toneKeywords: string[]
  sentenceStyle: SentenceStyle
  politeness: Politeness
  emojiUsage: EmojiUsage
  assertiveness: Assertiveness
  preferredPhrases: string[]
  bannedPhrases: string[]
  samplePosts: string
}

export interface XAccount {
  id: string
  workspaceId: string
  handle: string
  displayName: string
  niche: string
  targetAudience: string
  purpose: string
  monetizationGoal: string
  timezone: string
  notes: string
  status: AccountStatus
  sortOrder: number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  strategy: AccountStrategy
  voice: VoiceProfile
}

export interface AccountInput {
  handle: string
  displayName: string
  niche: string
  targetAudience: string
  purpose: string
  monetizationGoal: string
  timezone: string
  notes: string
  status: AccountStatus
  strategy: AccountStrategy
  voice: VoiceProfile
}

export interface WorkspaceSettings {
  userDisplayName: string
  workspaceName: string
  defaultTimezone: string
  uiDensity: UiDensity
  authMode: 'local' | 'cloudflare-access'
  accountLimit: number
}

export interface ApiEnvelope<T> {
  data: T
}

export interface ApiErrorPayload {
  error: {
    code: string
    message: string
    requestId?: string
    fields?: Record<string, string>
  }
}
