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
export type DraftStatus = 'draft' | 'review' | 'approved' | 'rejected' | 'published'
export type DraftTargetAction = 'engagement' | 'reply' | 'profile_click' | 'share' | 'dwell' | 'follow' | 'conversion'
export type DraftVersionSource = 'manual' | 'ai' | 'edit'
export type DraftFeedbackDecision = 'submit' | 'approve' | 'reject' | 'publish' | 'note'
export type DraftRejectReason = '' | 'off_voice' | 'too_generic' | 'too_salesy' | 'fact_risk' | 'duplicate' | 'weak_hook' | 'other'
export type VoiceMemoryKind = 'preference' | 'avoidance' | 'observation'
export type AiProviderName = 'template' | 'openai'

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

export interface ContentDraft {
  id: string
  workspaceId: string
  accountId: string
  researchItemId: string | null
  title: string
  targetAction: DraftTargetAction
  status: DraftStatus
  currentVersion: number
  currentHook: string
  currentBody: string
  currentAngle: string
  contentHash: string
  duplicateScore: number
  duplicateDraftId: string | null
  createdByUserId: string
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  archivedAt: string | null
}
export interface DraftVersion {
  id: string
  workspaceId: string
  draftId: string
  versionNumber: number
  hook: string
  body: string
  angle: string
  source: DraftVersionSource
  aiProvider: string
  aiModel: string
  aiMetadata: Record<string, unknown>
  createdByUserId: string
  createdAt: string
}
export interface DraftFeedback {
  id: string
  workspaceId: string
  draftId: string
  versionId: string | null
  userId: string
  decision: DraftFeedbackDecision
  reasonCode: DraftRejectReason
  comment: string
  createdAt: string
}
export interface VoiceMemory {
  id: string
  workspaceId: string
  accountId: string
  kind: VoiceMemoryKind
  content: string
  source: 'manual' | 'feedback'
  sourceDraftId: string | null
  createdByUserId: string
  active: boolean
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}
export interface DraftCreateInput {
  accountId: string
  researchItemId: string | null
  title: string
  targetAction: DraftTargetAction
  hook: string
  body: string
  angle: string
  source?: DraftVersionSource
  aiProvider?: string
  aiModel?: string
  aiMetadata?: Record<string, unknown>
}
export interface DraftUpdateInput { title?: string; targetAction?: DraftTargetAction; hook: string; body: string; angle: string }
export interface DraftStatusInput { status: Extract<DraftStatus, 'review' | 'approved' | 'rejected' | 'published'>; reasonCode?: DraftRejectReason; comment?: string; remember?: boolean }
export interface DraftDetail { draft: ContentDraft; versions: DraftVersion[]; feedback: DraftFeedback[] }
export interface ContentOverview { drafts: ContentDraft[]; archivedDrafts: ContentDraft[]; voiceMemories: VoiceMemory[] }
export interface DuplicateMatch { draftId: string; title: string; score: number; exact: boolean }
export interface DuplicateCheckResult { score: number; level: 'none' | 'low' | 'medium' | 'high'; match: DuplicateMatch | null; contentHash: string }
export interface GeneratedDraftCandidate { title: string; hook: string; body: string; angle: string; targetAction: DraftTargetAction; duplicate: DuplicateCheckResult }
export interface AiProviderStatus { provider: AiProviderName; configured: boolean; external: boolean; model: string | null; note: string }
export interface GenerateDraftInput { accountId: string; researchItemId: string | null; targetAction: DraftTargetAction; instruction: string; count: 1 | 2 | 3 }
export interface GenerateDraftResult { candidates: GeneratedDraftCandidate[]; provider: AiProviderName; model: string | null; usage: { inputTokens: number | null; outputTokens: number | null } }
export interface VoiceMemoryInput { accountId: string; kind: VoiceMemoryKind; content: string }

export interface ApiEnvelope<T> { data: T }
export interface ApiErrorPayload { error: { code: string; message: string; requestId?: string; fields?: Record<string, string> } }
