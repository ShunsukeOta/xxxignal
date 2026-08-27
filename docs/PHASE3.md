# Phase 3 — Content Studio

## Goal

Researchを「投稿候補」に変換し、人間が編集・承認してX公式画面へ渡すところまでを完成させる。

自動投稿botにはしない。AIは制作補助、人間は最終判断という境界を固定する。

## Data model

- `content_drafts`
  - 現在の本文 / Hook / Angle / Status / Duplicate情報を保持
- `draft_versions`
  - 編集履歴。`draft_id + version_number` をUnique化
- `draft_feedback`
  - submit / approve / reject / publishの意思決定履歴
- `voice_memories`
  - アカウントごとの追加Voiceルール

Draftは原則Archiveし、Version履歴を物理削除しない。

## Draft lifecycle

```text
draft
  ↓
review
  ├─ approved ──→ published
  └─ rejected ──→ review

approved ──→ review  // 再レビュー
```

本文を編集すると新Versionを作成し、Statusを`draft`へ戻す。

## AI Provider Adapter

### template

- デフォルト
- 外部APIなし
- コスト0円
- Phase 3の画面・Draft運用をAPI Keyなしで検証可能

### openai

- `AI_PROVIDER=openai` の時だけ利用
- `OPENAI_API_KEY` / `OPENAI_MODEL` 必須
- Responses APIを利用
- SecretはDB / Audit / Draftへ保存しない
- 25秒Timeout / 512KB response上限

AI Providerは`src/worker/providers/ai`配下へ隔離し、Phase 4以降の他Provider追加でもContent Routeを書き直さない。

## Prompt boundary

Research ItemはRSS / Webなど外部由来なので、Prompt Injectionを前提に扱う。

- Research本文を「UNTRUSTED DATA」として区切る
- Research内の命令へ従わないようSystem instructionで明示
- Account Strategy / Voice / Forbidden TopicsをResearchより優先
- 不確かな事実・数値の捏造を禁止

## Duplicate Guard

Phase 3では同一アカウント内を対象にする。

1. NFKC / lowercase / URL置換 / 空白・記号除去
2. SHA-256で完全一致判定
3. 3-gram Dice coefficientで近似判定
4. 最近200 Draftまで比較

目安:

- 82%以上: High
- 65〜81: Medium
- 35〜64: Low
- 34以下: None

Embedding APIは使わないためDuplicate Guard自体の外部APIコストは0円。

Cross-account GuardはPhase 5で追加する。

## Human Review / Voice Memory

Reject時は理由コードとコメントを保存する。

Voice Memoryへの追加は自動強制せず、ユーザーが`Voice Memoryへ保存`を選んだ場合だけ行う。

例:

```text
Reject reason: off_voice
Comment: 「解説します」は使わない。冒頭をもっと短くする。
Remember: true

→ voice_memories(kind=avoidance)
```

次のAI生成ではVoice Profileに加えてActive Voice Memoryを最大50件参照する。

## Manual Publish Assist

Approved Draftだけ表示する。

- Clipboard copy
- `https://x.com/intent/post?text=...` を新しいタブで開く
- X側で投稿後にユーザーが「投稿済みにする」を押す

Phase 3ではX APIで投稿確認をしない。自動投稿もしない。

## Phase 3 completion

- [x] AI Provider Adapter
- [x] 0円Template Provider
- [x] Optional OpenAI Provider
- [x] Draft Versioning
- [x] Duplicate Guard
- [x] Human Review
- [x] Reject Feedback
- [x] Voice Memory
- [x] Manual Publish Assist
- [x] PC / SP UI
- [x] Phase 3 D1 Migration / Smoke Test
