export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer'
export type AccountStatus = 'draft' | 'active' | 'paused'
export type PrimaryGoal = 'growth' | 'traffic' | 'sales' | 'brand' | 'community'
export type MonetizationType = 'none' | 'affiliate' | 'product' | 'service' | 'creator_rewards' | 'other'
export type SentenceStyle = 'short' | 'mixed' | 'long'
export type Politeness = 'casual' | 'neutral' | 'polite'
export type EmojiUsage = 'none' | 'low' | 'medium' | 'high'
export type Assertiveness = 'soft' | 'balanced' | 'strong'
export type UiDensity = 'comfortable' | 'compact'
export type ResearchSourceKind = 'rss' | 'web' | 'manual'
export type ResearchTargetRole = 'competitor' | 'target' | 'reference'
export type ResearchItemKind = 'rss' | 'web' | 'x_post' | 'manual'

export interface SessionUser { id: string; email: string; displayName: string }
export interface SessionWorkspace { id: string; name: string; slug: string; plan: 'personal' | 'beta' | 'pro'; role: WorkspaceRole }
export interface SessionData { user: SessionUser; workspace: SessionWorkspace; limits: { accountLimit: number; activeAccountCount: number }; phase: 1 | 2 | 3 | 4 | 5 }

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
  id: string; workspaceId: string; handle: string; displayName: string; niche: string; targetAudience: string; purpose: string; monetizationGoal: string; timezone: string; notes: string; status: AccountStatus; sortOrder: number; createdAt: string; updatedAt: string; archivedAt: string | null; strategy: AccountStrategy; voice: VoiceProfile
}
export interface AccountInput {
  handle: string; displayName: string; niche: string; targetAudience: string; purpose: string; monetizationGoal: string; timezone: string; notes: string; status: AccountStatus; strategy: AccountStrategy; voice: VoiceProfile
}
export interface WorkspaceSettings { userDisplayName: string; workspaceName: string; defaultTimezone: string; uiDensity: UiDensity; authMode: 'local' | 'cloudflare-access'; accountLimit: number }

export interface ResearchSource { id: string; workspaceId: string; name: string; kind: ResearchSourceKind; url: string; notes: string; lastSyncedAt: string | null; createdAt: string; updatedAt: string; archivedAt: string | null }
export interface ResearchSourceInput { name: string; kind: ResearchSourceKind; url: string; notes: string }
export interface ResearchTarget { id: string; workspaceId: string; handle: string; displayName: string; role: ResearchTargetRole; notes: string; createdAt: string; updatedAt: string; archivedAt: string | null }
export interface ResearchTargetInput { handle: string; displayName: string; role: ResearchTargetRole; notes: string }
export interface ResearchItem { id: string; workspaceId: string; sourceId: string | null; accountId: string | null; title: string; url: string; summary: string; topic: string; kind: ResearchItemKind; externalKey: string; publishedAt: string | null; createdAt: string; updatedAt: string; archivedAt: string | null }
export interface ResearchItemInput { title: string; url: string; summary: string; topic: string; kind: ResearchItemKind; accountId: string | null }
export interface ResearchOverview { sources: ResearchSource[]; targets: ResearchTarget[]; items: ResearchItem[] }

export interface ApiEnvelope<T> { data: T }
export interface ApiErrorPayload { error: { code: string; message: string; requestId?: string; fields?: Record<string, string> } }
