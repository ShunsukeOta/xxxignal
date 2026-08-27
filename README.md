# xxxignal

個人向け・複数アカウント対応のX運用OS。

現在は **Phase 3 — Content Studio 完了**。最大3アカウントのStrategy / Voiceを分離し、Research Poolから投稿案を作成、Version管理、人間承認、Voice Memory、手動投稿アシストまで一連で運用できます。

## MVP進捗

**3 / 5 Phase 完了（60%）**

| Phase | 状態 | 内容 |
|---|---|---|
| Phase 1 — Core Foundation | ✅ 完了 | User / Workspace / 3 X Accounts / Strategy / Voice / Audit / PC・SP UI |
| Phase 2 — Research & X Viewer | ✅ 完了 | Shared Research Pool / RSS / Web / X Targets / X公式公開Embed Viewer |
| Phase 3 — Content Studio | ✅ 完了 | AI Provider / Draft Versioning / Duplicate Guard / Human Review / Voice Memory / Manual Publish Assist |
| Phase 4 — X OAuth, Analytics & Cost | ⏳ 未着手 | 公式X OAuth / Metrics / Cost Ledger / Budget Guard / API Cache |
| Phase 5 — Production MVP | ⏳ 未着手 | Opportunity / Calendar / Weekly Learning / Revenue Attribution / Export・Backup |

## Phase 3でできること

- Research Itemから投稿候補を生成
- **AI Provider Adapter**
  - `template`: 外部APIを使わない0円モード（既定）
  - `openai`: Secret設定時だけOpenAI Responses APIを利用
- アカウントごとのStrategy / Voice Profile / Voice Memoryを生成コンテキストへ反映
- Draft作成・編集・Archive / Restore
- 編集するたびに新Versionを保存し、本文を上書き消去しない
- 同一アカウント内のDuplicate Guard
  - SHA-256完全一致
  - ローカル3-gram類似度
  - 外部Embedding APIなし
- Human Review
  - Draft → Review → Approved / Rejected
  - Approved → Published（手動記録）
- Reject理由をFeedbackとして保存
- 明示的に選択したReject理由だけVoice Memoryへ追加
- 承認済み本文のコピー / X公式Web Intent起動
- Xへの自動投稿は行わない

## コスト方針

Phase 3の既定設定では外部AI APIを呼ばないため、**X API / AI APIともに0円で動作確認できます**。

OpenAIを使う場合のみ、`.dev.vars` またはCloudflare Secretへ以下を設定します。

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=...
```

`OPENAI_API_KEY` はGitへコミットしません。Phase 4でCost Ledger / Budget Guardを実装するまでは、外部AI Providerを不用意に常時有効化しない方針です。

## Phase 2でできること

- Shared Research Pool
- Manual URL / Web / X Post / Memo保存
- RSS / Atom Source登録と手動同期
- RSS重複取り込み防止
- Competitor / Target / Reference Xアカウント管理
- X公式Widgetsによる公開プロフィール・公開Post表示
- Source / Target / Research ItemのArchive / Restore
- X API / X Cookie / 非公式GraphQLを使わない

## Stack

- React 19 + Vite 8 + TypeScript
- React Router
- SCSS / Noto Sans JP
- Cloudflare Workers
- Hono
- Cloudflare D1
- Drizzle ORM
- X公式Widgets（Phase 2）
- AI Provider Adapter（Phase 3）

## Local setup

### Requirements

- Node.js 22.12+
- npm

### Install

```bash
npm install
cp .dev.vars.example .dev.vars
```

### D1 migration

```bash
npm run db:migrate:local
npm run test:db
```

`test:db` はPhase 1〜3のMigrationをインメモリSQLiteへ適用し、主要制約を検証します。

### Start

```bash
npm run dev
```

初回アクセスでLocal User / Workspace / Settingsを作成します。デモアカウント・デモResearch・デモDraftは作成しません。

## Production setup

### 1. D1を作成

```bash
npx wrangler login
npx wrangler d1 create xxxignal
```

取得したDatabase IDを `wrangler.jsonc` の `database_id` に設定してください。

### 2. Migration

```bash
npm run db:migrate:remote
```

### 3. Cloudflare Access

公開前にCloudflare Accessで利用者を制限してください。本番既定値は `cloudflare-access` です。

### 4. OpenAIを使う場合だけSecret登録

```bash
npx wrangler secret put OPENAI_API_KEY
```

`AI_PROVIDER` / `OPENAI_MODEL` は環境設定で指定してください。未設定時は0円の `template` Providerを使用します。

### 5. Build / deploy

```bash
npm run build
npm run deploy
```

> GitHub Actions / CI workflowはリポジトリに含めていません。デプロイは明示的に実行します。

## Phase 4 — X OAuth, Analytics & Cost

公式X APIを必要最小限だけ接続します。

- OAuth 2.0 PKCE / User Context
- 3アカウント接続
- Own Post / Metrics取得
- API Cache
- Cost Ledger
- 月額Budget / Hard Limit
- Account Health
- Engagement候補Inbox

## Phase 5 — Production MVP

3アカウントを1人で毎日運用できる完成形へ統合します。

- Opportunity Ranking
- Calendar / Queue
- Weekly Learning
- Cross-account Duplicate / Engagement Guard
- Click / Conversion / Revenue Attribution基盤
- Export / Backup
- 運用Dashboard完成

## Safety / architecture decisions

- Xのパスワード・Cookie・セッションを保存しない
- Xの自動Like / Follow / Replyを行わない
- Phase 3の投稿はHuman Approvalを必須にする
- Research由来の文章はAI Prompt内で未信頼データとして隔離する
- Draft / Research / Accountは物理削除よりArchiveを優先する
- 全運用データを `workspace_id` で分離する
- AI ProviderをAdapter化し、特定ベンダーへ密結合しない
- SecretをAudit Log / Draft Versionへ保存しない

詳細: [Architecture](docs/ARCHITECTURE.md) / [Phase 2](docs/PHASE2.md) / [Phase 3](docs/PHASE3.md) / [Design System](docs/DESIGN_SYSTEM.md) / [5 Phases](docs/PHASES.md)
