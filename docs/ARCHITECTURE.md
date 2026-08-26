# xxxignal Architecture — Phase 1

## 目的

Phase 1では「個人3アカウント運用」を実現する前に、将来の配布・販売で作り直さない境界を固定する。

## Runtime

- Frontend: React + Vite + TypeScript
- API: Cloudflare Workers + Hono
- Database: Cloudflare D1
- ORM: Drizzle ORM
- Auth boundary: Cloudflare Access / local dev adapter
- Font: Noto Sans JP
- X API: Phase 1では未使用

## Multi-tenant boundary

```text
User
  └─ Workspace
      ├─ Workspace Member
      ├─ X Account A
      │   ├─ Strategy
      │   └─ Voice Profile
      ├─ X Account B
      └─ X Account C
```

全ての運用データは `workspace_id` で分離する。将来SaaS化しても、ユーザーごとのDBを分ける前提にはしない。

## Authentication

本番は `AUTH_MODE` 未指定時に `cloudflare-access` へフォールバックする。`wrangler.jsonc` にはLocal認証モードを定義しない。

- Worker APIは `Cf-Access-Authenticated-User-Email` を受け取り、ユーザーを解決する。
- 初回アクセス時に User / Workspace / Workspace Member / 基本Settingを自動作成する。
- ローカル開発のみ `.dev.vars` の `AUTH_MODE=local` を許可する。
- Xのパスワード・Cookie・セッションは保存しない。

## Account isolation

アカウント単位で以下を分離する。

- Persona / basic profile
- Target audience
- Purpose
- Monetization goal
- Content pillars
- Forbidden topics
- Posting target
- Voice profile
- Preferred / banned phrases
- Sample posts

Phase 2以降のResearch、Draft、Analyticsも必ず `workspace_id` と `account_id` に紐づける。

## Authorization

- Accountの作成・更新・アーカイブ・復元: owner / admin / editor
- Workspace設定変更: owner / admin
- viewerは読み取り専用

Phase 1は個人ownerのみだが、販売時に権限制御を後付けしなくて済むようAPI境界で最初から強制する。

## Audit

作成・更新・アーカイブ・復元・Workspace設定変更は `audit_logs` に記録する。APIトークン等の秘密情報はAuditに保存しない。監査ログ書き込み失敗はサーバーログへ残し、成功済みユーザー操作を500として再実行させない。

## Archive policy

X Accountは物理削除せず `archived_at` を使う。将来の投稿履歴・収益データとの参照切れを防ぐため。

## Cost policy

Phase 1の外部APIコストは0円。

Phase 4以降は `cost_ledger` を追加し、X API / AI APIの利用前後でコストを記録する。
