import type { DraftTargetAction } from '../../../shared/contracts'
import type { AiGenerationContext, AiGenerationResponse, AiProvider } from './types'

const actionEnding: Record<DraftTargetAction, string> = {
  engagement: 'あなたはどう見ますか？',
  reply: '別の見方があれば知りたいです。',
  profile_click: 'このテーマは今後も追います。',
  share: '必要な人に届けば十分です。',
  dwell: '結論だけでなく、背景まで見る価値があります。',
  follow: '同じテーマを継続して追っています。',
  conversion: '必要な方はプロフィールの導線から確認できます。',
}

function trimText(value: string, max: number) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}…`
}

function sourceTopic(context: AiGenerationContext) {
  const item = context.researchItem
  if (item?.title) return item.title
  if (context.instruction.trim()) return context.instruction.trim()
  if (context.account.strategy.contentPillars.length) return context.account.strategy.contentPillars[0]
  return context.account.niche || 'このテーマ'
}

export class TemplateAiProvider implements AiProvider {
  readonly name = 'template' as const
  readonly model = null
  readonly external = false
  readonly configured = true
  readonly note = '外部APIを使わない0円テンプレート生成。OpenAI設定前でもContent Studioを検証できます。'

  async generate(context: AiGenerationContext): Promise<AiGenerationResponse> {
    const topic = trimText(sourceTopic(context), 80)
    const summary = trimText(context.researchItem?.summary ?? '', 150)
    const instruction = trimText(context.instruction, 120)
    const memoryAvoid = context.voiceMemories.filter((memory) => memory.kind === 'avoidance').slice(0, 3).map((memory) => memory.content)
    const preferred = context.account.voice.preferredPhrases[0] ?? ''
    const base = summary || instruction || context.account.strategy.strategyMemo || `${topic}について、自分の視点を一つ足す。`
    const endings = actionEnding[context.targetAction]
    const patterns = [
      {
        angle: '結論先出し',
        hook: `${topic}、ここだけは見落としたくない。`,
        body: `${topic}。${base}\n\n大事なのは、情報をそのまま流すのではなく「自分の運用で何が変わるか」まで落とすこと。${preferred ? `\n${preferred}` : ''}\n\n${endings}`,
      },
      {
        angle: '観察・違和感',
        hook: `${topic}を見ていて、少し気になったこと。`,
        body: `${topic}について話題になっていますが、${base}\n\n表面の数字だけで判断せず、誰にとって意味がある変化なのかを分けて考えたいです。\n\n${endings}`,
      },
      {
        angle: '実務への変換',
        hook: `${topic}を実務に落とすなら、まずここ。`,
        body: `${topic}。${base}\n\n自分なら「今すぐ変えること」と「まだ様子を見ること」を分けます。反応だけを追わず、次の行動につながるかで判断します。\n\n${endings}`,
      },
    ]

    const candidates = patterns.slice(0, context.count).map((pattern, index) => {
      let body = pattern.body
      for (const avoid of memoryAvoid) {
        if (avoid && body.includes(avoid)) body = body.replaceAll(avoid, '')
      }
      return {
        title: `${topic} / 案${index + 1}`,
        hook: trimText(pattern.hook, 140),
        body: trimText(body, 1200),
        angle: pattern.angle,
        targetAction: context.targetAction,
      }
    })

    return {
      candidates,
      provider: this.name,
      model: null,
      usage: { inputTokens: null, outputTokens: null },
    }
  }
}
