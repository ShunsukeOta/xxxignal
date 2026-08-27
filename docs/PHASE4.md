# Phase 4 — X OAuth, Analytics & Cost

## Goal

公式X OAuth 2.0 User Contextだけを使い、最大3アカウントのOwn Posts / Mentionsを必要時だけ取得し、APIコストを取得前・取得後の両方で制御する。

ブラウザCookie、非公式GraphQL、Headless Browser、Proxy rotationは使わない。

## OAuth

- Authorization Code Flow + PKCE (S256)
- scopes: `tweet.read users.read offline.access`
- Access Tokenは通常2時間を前提にRefresh Tokenで更新
- OAuth stateはD1へ10分だけ保存
- state / workspace / user / accountを照合
- 登録済みhandleとOAuthで認証したusernameが一致する場合だけ接続
- 1 Workspace内で同一X userを複数Accountへ接続しない

## Token storage

Access Token / Refresh Token / PKCE verifierはAES-256-GCMで暗号化する。

必須Secret:

```env
X_CLIENT_ID=...
X_CLIENT_SECRET=...
X_REDIRECT_URI=https://your-domain.example/api/x/oauth/callback
X_TOKEN_ENCRYPTION_KEY=<32 byte random key encoded as Base64>
```

暗号化キー未設定時に平文へFallbackしない。

`X_CLIENT_SECRET` はWeb App / confidential clientで使用。Secretがないpublic client構成もToken helper側では扱えるが、本番xxxignalはWeb Appを推奨する。

## Data model

- `x_connections`
  - internal Account ↔ X User
  - encrypted tokens / expiry / scopes / health
- `x_oauth_states`
  - short-lived state / PKCE verifier
- `x_posts`
  - own post current snapshot
- `x_post_metric_snapshots`
  - sync時点のmetric history
- `x_engagement_inbox`
  - Mentions候補。自動返信しない
- `x_api_cache`
  - 同じ画面操作による不要なAPI再取得を抑止
- `x_cost_ledger`
  - resource数 × pricing snapshotの推定コスト
- `x_budget_settings`
  - Workspace monthly budget / warning / hard limit
- `x_sync_runs`
  - posts / mentions sync execution history

## Cost Guardian

Phase 4のCost Ledgerは請求書ではなく**推定**。

2026-08-27時点の公式公開価格スナップショット:

- Post Read: $0.005 / resource
- User Read: $0.010 / resource
- Like Read: $0.001 / resource
- Post Create: $0.015 / request
- URL入りPost Create: $0.200 / request

Developer Consoleの実請求を最終正とする。

### Preflight

例えばPostsを20件取得する前に、

```text
current estimated spend
+
20 × $0.005 worst case
>
monthly hard limit
```

ならX APIへrequestを送る前に停止する。

### Actual estimate

responseで実際に返ったresource数だけCost Ledgerへ記録する。

Cache hit時はX APIを呼ばないため$0として扱う。

## Owned Reads

X公式には条件付きで$0.001/resourceのOwned Readsがあるが、Developer App owner条件がある。

xxxignal Phase 4では誤って安く見積もらないため、**標準Post Read単価を使った保守的見積もり**を既定とする。

## Sync policy

初期版では自動Cron同期をしない。

ユーザー操作:

- Posts同期
- Mentions同期

だけがX API readを発生させる。

初期limitは20件。5〜100件へserver side clampする。

同条件の結果は10分Cacheし、通常の再クリックでは再課金しない。強制refreshはAPI側で明示可能だがUI標準操作では使わない。

## Post Analytics

取得・保存:

- public_metrics
- non_public_metrics（Xが返した場合）
- organic_metrics（Xが返した場合）
- created_at
- conversation_id
- lang

主要UI:

- Impression
- Like
- Reply
- Repost
- Profile Click
- URL Link Click

metricが返らない場合は0として表示し、存在しない数値を推定しない。

## Engagement Inbox

`GET /2/users/{id}/mentions` の結果を候補として保存する。

できること:

- Xで開く
- 確認済み
- 無視

しないこと:

- 自動Reply
- 自動Like
- 自動Follow

## Account Health

内部Healthのみ。

- OAuth connection status
- Token expiry
- Last sync
- Last API error

「X内部アカウントスコア」など、取得できない値は推定表示しない。

## Phase 4 completion

- [x] OAuth 2.0 PKCE
- [x] AES-256-GCM Token storage
- [x] Token refresh
- [x] 3 account connection boundary
- [x] Own Posts manual sync
- [x] Metric snapshots
- [x] Mentions manual sync
- [x] Engagement Inbox
- [x] API cache
- [x] Cost Ledger
- [x] Monthly Budget Guard
- [x] Account Health
- [x] PC / SP Analytics UI
- [x] Phase 4 D1 Migration / Smoke Test
