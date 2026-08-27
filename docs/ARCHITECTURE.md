# xxxignal Architecture — Phase 3

## Runtime

- Frontend: React + Vite + TypeScript
- API: Cloudflare Workers + Hono
- Database: Cloudflare D1
- ORM: Drizzle ORM
- Auth: Cloudflare Access / local adapter
- X Viewer: Official X Widgets
- AI: Provider Adapter (`template` / optional `openai`)
- X API: not used until Phase 4

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
