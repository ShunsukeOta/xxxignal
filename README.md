# xxxignal

個人向け・複数アカウント対応のX運用OS。

現在は **Phase 1 — Core Foundation**。X APIやCookieログインはまだ使用せず、最大3アカウントの基本情報・Strategy・Voice Profileを完全分離して管理する基盤まで実装しています。

## Phase 1でできること

- PC / SP完全レスポンシブ管理画面
- User / Workspace単位のデータ分離
- 最大3 Xアカウントの登録・編集・アーカイブ・復元
- アカウントごとのTarget / Purpose / Monetization Goal
- Content Pillars / Forbidden Topics
- 投稿目標・収益モデル・Funnel・戦略メモ
- Voice Profile（トーン、丁寧さ、絵文字量、断定度、禁止表現、投稿サンプル）
- Workspace / User設定
- Audit Log
- Cloudflare Accessを前提にした認証境界
- X API / AI API未使用（Phase 1の外部APIコスト0円）

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

### 1. Requirements

- Node.js 22.12+
- npm

### 2. Install

```bash
npm install
cp .dev.vars.example .dev.vars
```

### 3. D1 migration

`wrangler.jsonc` の `database_id` はリポジトリ用のプレースホルダーです。ローカル開発は `preview_database_id` を使います。

```bash
npm run db:migrate:local
```

### 4. Smoke test / Start

```bash
npm run test:db
npm run dev
```

初回アクセスで、ローカルユーザー・Workspace・基本Settingsが自動作成されます。デモアカウントは作成しません。

## Production setup

### 1. Create D1

```bash
npx wrangler login
npx wrangler d1 create xxxignal
```

表示されたD1 Database IDで `wrangler.jsonc` の以下を置き換えます。

```json
"database_id": "00000000-0000-0000-0000-000000000000"
```

### 2. Remote migration

```bash
npm run db:migrate:remote
```

### 3. Cloudflare Access

本番は `AUTH_MODE` 未指定時でもコード側で `cloudflare-access` を既定値にします。xxxignalを公開する前にCloudflare Accessで自分のメールアドレスだけを許可してください。

Worker APIは `Cf-Access-Authenticated-User-Email` をユーザー識別に利用します。Xのパスワード・Cookieは保存しません。

### 4. Build / deploy

```bash
npm run build
npm run deploy
```

> リポジトリにGitHub Actions / CIは含めていません。デプロイは明示的にローカルから実行します。

## Safety / architecture decisions

- Xアカウントは物理削除せずアーカイブする
- 全運用データは `workspace_id` で分離する
- Account Strategy / Voice Profileは `account_id` ごとに分離する
- 本番既定認証をLocalモードにしない
- Phase 1ではX API、AI API、ブラウザCookie、自動操作を使用しない
- 将来のX接続は公式OAuth Provider Adapterとして追加する

詳細: [Architecture](docs/ARCHITECTURE.md) / [Design System](docs/DESIGN_SYSTEM.md) / [5 Phases](docs/PHASES.md)
