import type { DraftTargetAction, GeneratedDraftCandidate, VoiceMemory } from '../../../shared/contracts'
import type { XAccount } from '../../../shared/contracts'
import type { ResearchItem } from '../../../shared/contracts'

export interface AiGenerationContext {
  account: XAccount
  researchItem: ResearchItem | null
  voiceMemories: VoiceMemory[]
  targetAction: DraftTargetAction
  instruction: string
  count: 1 | 2 | 3
}

export interface AiCandidateBase extends Omit<GeneratedDraftCandidate, 'duplicate'> {}

export interface AiGenerationResponse {
  candidates: AiCandidateBase[]
  provider: 'template' | 'openai'
  model: string | null
  usage: {
    inputTokens: number | null
    outputTokens: number | null
  }
}

export interface AiProvider {
  readonly name: 'template' | 'openai'
  readonly model: string | null
  readonly external: boolean
  readonly configured: boolean
  readonly note: string
  generate(context: AiGenerationContext): Promise<AiGenerationResponse>
}
