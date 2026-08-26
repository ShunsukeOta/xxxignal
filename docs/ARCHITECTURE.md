# xxxignal Architecture — Phase 2

## Runtime

- Frontend: React + Vite + TypeScript
- API: Cloudflare Workers + Hono
- Database: Cloudflare D1
- ORM: Drizzle ORM
- Auth: Cloudflare Access / local adapter
- X Viewer: Official X Widgets
- X API: not used in Phase 2
- AI API: not used in Phase 2

## Tenant boundary

```text
User
└─ Workspace
   ├─ X Accounts
   │  ├─ Strategy
   │  └─ Voice Profile
   ├─ Research Sources
   ├─ Research Targets
   └─ Research Items
      └─ optional Account binding
```

すべてのResearch APIはSessionの`workspace_id`でscopeし、他Workspace IDを入力値として受け取らない。

## Research boundary

Research Itemは共通Poolを基本とし、必要な場合だけ`account_id`へ紐付ける。これにより同じニュース・RSSを複数アカウントごとに再取得しない。

## Authentication

本番はCloudflare Accessを既定値とする。X認証とは独立したxxxignal自体のアクセス境界。

## X integration policy

Phase 2で許可:

- x.comへの通常リンク
- X公式WidgetsによるPublic Embed

Phase 2で禁止:

- X Cookie保存
- Headless Browser login
- unofficial GraphQL
- automated engagement
- X API

Phase 4で公式OAuth Providerを追加する。

## Audit / Archive

Research Source / Target / Itemの作成・同期・Archive / RestoreをAudit対象にする。物理削除はしない。

## Cost policy

Phase 2まで外部APIコスト0円。Phase 4以降は`cost_ledger`でX API利用を記録する。
