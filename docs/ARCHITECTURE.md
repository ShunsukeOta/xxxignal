# xxxignal Architecture — Phase 4

## Runtime

- Frontend: React + Vite + TypeScript
- API: Cloudflare Workers + Hono
- Database: Cloudflare D1
- ORM: Drizzle ORM
- Auth: Cloudflare Access / local adapter
- X Viewer: Official X Widgets
- AI: Provider Adapter (`template` / optional `openai`)
- X API: Official OAuth 2.0 User Context / manual read sync only

## Tenant boundary

```text
User
└─ Workspace
   ├─ X Accounts
   │  ├─ Strategy
   │  ├─ Voice Profile
   │  ├─ Voice Memory
   │  └─ Content Drafts
   │      ├─ Versions
   │      └─ Feedback
   ├─ Research Sources
   ├─ Research Targets
   └─ Research Items
```

APIはクライアントから`workspace_id`を受け取らない。Sessionで解決したWorkspaceへ必ずscopeする。

## Content boundary

Draftは`account_id`必須。Research Itemは任意。

- Account Strategy / Voiceは他Accountと共有しない
- Draft Duplicate GuardはPhase 3では同一Accountのみ
- Cross-account GuardはPhase 5
- Published Draftは履歴保全のためArchiveを禁止

## AI boundary

Provider interfaceをContent Routeから分離する。

```text
Content Route
   ↓
AiProvider
├─ TemplateAiProvider
└─ OpenAiProvider
```

Provider secretはEnvのみ。DB、Audit Log、Frontendへ返さない。

### External content safety

Research ItemはPrompt Injectionを含む可能性があるため未信頼データとして扱う。System instructionとResearch blockを分離し、Research内の指示よりAccount Policyを優先する。

## Review boundary

AI生成結果を直接Publishedへ遷移できない。

```text
draft → review → approved → published
                ↘ rejected
```

人間の明示操作なしにApprove / Publishしない。

## Cost boundary

- Template Provider: 0円
- Duplicate Guard: 0円
- X Viewer: X API 0円
- OpenAI Provider: 呼び出した時だけ従量課金

Phase 4まではCost LedgerがないためOpenAIを既定にしない。

## Audit

以下をAudit対象にする。

- Draft create / edit / review / approve / reject / publish / archive / restore
- AI generation（Provider / Model / 件数のみ）
- Voice Memory create / archive

Prompt本文、API Key、SecretはAuditへ保存しない。


## X OAuth boundary

- Authorization Code + PKCE (S256)
- OAuth stateはD1へ10分だけ保存
- state / workspace / user / accountを照合
- Access / Refresh Token / PKCE verifierはAES-256-GCMで暗号化
- 暗号化Key未設定時に平文Fallbackしない
- TokenはFrontendへ返さない
- 登録handleとOAuth usernameの一致を必須化

## X API boundary

Phase 4で許可する有料Read:

- `GET /2/users/me` — OAuth identity確認
- `GET /2/users/{id}/tweets` — Own Posts
- `GET /2/users/{id}/mentions` — Engagement候補

初期版は手動同期のみ。Cron pollingなし。

禁止:

- 自動Like / Follow / Reply
- Cookie login
- unofficial GraphQL
- Headless Browser
- Proxy rotation

## Cost boundary

`x_cost_ledger` はresource数 × pricing snapshotの推定値を保存する。

API呼び出し前:
- 現在月の推定支出
- requestのworst-case resource数
- Workspace Hard Limit

を比較し、超過予測時はXへrequestを送らない。

API呼び出し後:
- 実際に返ったresource数でLedger記録
- Cache hitは$0
- Owned Read割引を既定では仮定しない

Developer Consoleの実請求を最終正とする。

## X storage boundary

```text
X Account
├─ x_connections
├─ x_posts
│  └─ x_post_metric_snapshots
├─ x_engagement_inbox
└─ x_sync_runs

Workspace
├─ x_budget_settings
├─ x_cost_ledger
└─ x_api_cache
```

Token値、Client Secret、暗号化KeyをAudit / Cost / Metricsへ保存しない。
