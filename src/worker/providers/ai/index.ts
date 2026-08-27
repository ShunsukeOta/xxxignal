import type { Env } from '../../env'
import type { AiProvider } from './types'
import { OpenAiProvider } from './openai'
import { TemplateAiProvider } from './template'

export function createAiProvider(env: Env): AiProvider {
  const provider = env.AI_PROVIDER ?? 'template'
  if (provider === 'openai') return new OpenAiProvider(env)
  return new TemplateAiProvider()
}
