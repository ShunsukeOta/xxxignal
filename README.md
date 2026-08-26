# xxxignal

個人向け・複数アカウント対応のX運用OS。

現在は **Phase 2 — Research & X Viewer 完了**。最大3アカウントの運用基盤に加え、X APIを使わずに公開X情報・RSS・Web URL・手動メモをResearch Poolへ集約できます。

## MVP進捗

**2 / 5 Phase 完了（40%）**

| Phase | 状態 | 内容 |
|---|---|---|
| Phase 1 — Core Foundation | ✅ 完了 | User / Workspace / 3 X Accounts / Strategy / Voice / Audit / PC・SP UI |
| Phase 2 — Research & X Viewer | ✅ 完了 | Shared Research Pool / RSS / Web / X Targets / X公式公開Embed Viewer |
| Phase 3 — Content Studio | ⏳ 未着手 | AI Provider / Angle / Draft / Human Review / Voice Memory / Duplicate Guard |
| Phase 4 — X OAuth, Analytics & Cost | ⏳ 未着手 | 公式X OAuth / Metrics / Cost Ledger / Budget Guard / API Cache |
| Phase 5 — Production MVP | ⏳ 未着手 | Opportunity / Calendar / Learning / Revenue Attribution / Export・Backup |

## Phase 2でできること

- Shared Research Pool
- Manual URL / Web / X Post / Memoの保存
- RSS / Atom Source登録と手動同期
- RSSの重複取り込み防止（SHA-256 external key）
- Source / Target / Research ItemのArchive / Restore
- Competitor / Target / Reference Xアカウント管理
- X公式Widgetsによる公開プロフィール・公開Post表示
- Research Itemを運用Xアカウントへ任意で紐付け
- Topic保存と全文検索
- PC / SPレスポンシブUI
- X API / AI APIコスト **0円**

## Phase 2の安全設計

RSS取得はサーバーサイドで行うため、以下を実装しています。

- HTTP / HTTPSのみ許可
- URL内Credential拒否
- localhost / `.local` / private IPv4 / special-use IPv4拒否
- IPv6 literal拒否
- Redirect先も毎回再検証、最大3回
- 8秒Timeout
- Response bodyをstream読込し2MBで強制停止
- `DOCTYPE` / `ENTITY`を含むXML拒否
- 1同期最大50 item

X ViewerはX公式Widgetsだけを利用し、Xのパスワード、Cookie、セッション、非公式GraphQLをxxxignalへ保存しません。

## Stack

- React 19 + Vite 8 + TypeScript
- React Router
- SCSS
- Cloudflare Workers
- Hono
- Cloudflare D1
- Drizzle ORM
- Noto Sans JP

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

`test:db` はPhase 1 / Phase 2の全MigrationをインメモリSQLiteへ適用し、主要なUNIQUE制約も検証します。

### Start

```bash
npm run dev
```

初回アクセスでローカルUser / Workspace / Settingsを作成します。デモアカウント・デモResearch Itemは作成しません。

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

### 4. Build / deploy

```bash
npm run build
npm run deploy
```

> GitHub Actions / CI workflowはリポジトリに含めていません。デプロイは明示的に実行します。

## Phase 3 — Content Studio

Researchを投稿制作へ接続します。

- AI Provider Adapter（OpenAI / 他Provider差替可能）
- Research → Angle生成
- Draft生成・Versioning
- Account Voice Memory
- Hash + Semantic Duplicate Guard
- Human Edit / Approve / Reject
- Reject理由の学習材料化
- 手動投稿Assist

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
- Calendar / Publish Queue
- Weekly Learning
- Cross-account Duplicate Guard
- Cross-account Engagement Guard
- Click / Conversion / Revenue Attribution基盤
- Export / Backup
- 運用Dashboardの完成

詳細: [Architecture](docs/ARCHITECTURE.md) / [Phase 2](docs/PHASE2.md) / [Design System](docs/DESIGN_SYSTEM.md) / [5 Phases](docs/PHASES.md)
