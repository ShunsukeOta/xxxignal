# Phase 2 — Research & X Viewer

## Goal

X API課金やCookieログインに依存せず、公開情報を運用判断へ使えるResearch Poolへ保存する。

## Data model

### research_sources

RSS / Web / Manualの外部情報源。

### research_targets

競合、関係構築候補、参考アカウントをX handle単位で管理する。

### research_items

調査材料本体。`account_id` はnullableで、共通Poolまたは特定運用アカウントへ紐付けられる。

## RSS sync

RSS同期はユーザー操作時だけ実行する。Phase 2ではCronを使用しない。

Security:

- HTTP / HTTPS only
- URL credentials rejected
- localhost / private IPv4 / special-use IPv4 rejected
- literal IPv6 rejected
- redirect revalidation
- max 3 redirects
- 8 second timeout
- 2 MB streaming response limit
- DOCTYPE / ENTITY rejected
- max 50 feed entries per sync

Feed itemの`guid / id / URL / title+date`からSHA-256 external keyを作成し、同一Source内の二重取り込みを防ぐ。

## X Viewer

`platform.twitter.com/widgets.js` の公式Widgetを使用する。

xxxignalは以下を保持しない。

- X password
- X cookie
- Browser session
- unofficial GraphQL token

Phase 2ではViewerは公開情報確認専用。自動Like / Follow / Reply / Postは実装しない。

## Cost

- X API: 0
- AI API: 0
- RSS fetch: Cloudflare Worker通常実行範囲

## Completion criteria

- Research PoolをPC/SPで操作可能
- RSSを登録し手動同期可能
- Manual / Web / X Postを保存可能
- X Targetsを登録可能
- 公開X profile/postを公式Widgetで確認可能
- Archive / Restore可能
- Phase 1 Account isolationを壊さない
