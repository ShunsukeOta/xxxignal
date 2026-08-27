# Phase 5 — Production MVP

## Goal

最大3アカウントを1人で毎日運用できる状態へ、Phase 1〜4の機能を統合する。

Phase 5では新しい外部API依存を増やさず、すでに保存しているResearch / Draft / X Metrics / Mention / Costデータを再利用する。

## Daily flow

```text
Research / Mentions
        ↓
Opportunity Ranking
        ↓
Calendar / Queue
        ↓
Draft / Review / Publish Assist
        ↓
X Metrics / Attribution
        ↓
Weekly Learning
        ↓
次週のOpportunity / Draftへ反映
```

## Opportunity Ranking

対象:

- Research Items
- Engagement Inbox Mentions
- Manual Opportunity

外部AI APIは使わない。

### Research score

主な要素:

- Recency / urgency
- Account binding
- Topicの有無
- Source kind

### Mention score

主な要素:

- Recency
- Account fit
- Public interaction count

Score / Urgency / Fitは0〜100で保存する。

Opportunityは自動実行しない。

- new
- planned
- done
- dismissed

の人間管理。

## Calendar / Queue

自動投稿予約ではなく、実行予定を管理する。

Kinds:

- publish
- followup
- research
- manual

Draft / Opportunityを任意で紐付ける。

Status:

- planned
- done
- cancelled

Opportunityから予定化した場合はplannedへ同期し、Calendar完了時はOpportunityもdoneへ更新する。

## Weekly Learning

保存済みOwn Post Metricsだけを使い、直近7日をローカル集計する。

Accountごとに保存:

- sample size
- top posts
- observations
- recommendations

Phase 5初期版ではAIによる解釈を行わず、ルールベースで生成する。

データが少ない場合は推定値を作らず「data不足」と明示する。

## Cross-account Duplicate Guard

Phase 3の同一Account Duplicate Guardに加えて、Workspace内の別Account Draftを比較する。

- NFKC normalize
- URL normalize
- 3-gram Dice
- 65%以上をGuard候補

自動削除・自動ブロックはしない。

## Engagement Overlap Guard

Engagement Inbox内で、複数Accountに同一X Postが候補として存在する場合を警告する。

目的:

同じPostへ複数運用Accountから不自然に接触する事故を防止する。

自動Like / Reply / Followは引き続き行わない。

## Revenue Attribution

### Attribution Link

Account単位で以下を保存:

- label
- destination URL
- optional Draft
- random tracking key

公開route:

```text
/r/{tracking_key}
```

アクセス時:

1. Linkがactiveか確認
2. Click Eventを記録
3. destination URLへ302 Redirect

元URLを改変しない。

### Events

- click: redirect経由で自動記録
- conversion: 手動記録
- revenue: 手動記録

Revenueはmicrounitsで保存し、通貨を別fieldで保持する。

異なる通貨を勝手に換算しない。

将来ASP APIを追加する場合も同じAttribution Eventへ流し込める構造にする。

## Export / Backup

Workspaceの主要データをJSONへExportする。

含む:

- Account / Strategy / Voice
- Research
- Content Draft / Version / Feedback / Voice Memory
- X Post / Metrics / Inbox
- Cost Ledger / Budget
- Opportunity / Calendar / Learning
- Attribution
- Audit / Settings
- X Connectionの安全なmetadata

含めない:

- X Access Token
- X Refresh Token
- PKCE verifier
- X Client Secret
- Token encryption key
- OpenAI API Key

Format:

```json
{
  "version": 1,
  "generatedAt": "...",
  "checksumSha256": "...",
  "data": {}
}
```

Import互換のためversionを固定する。

## Production Dashboard

起動後に確認する情報:

- Human Review
- Calendar
- Opportunity
- Cross-account Guard
- X API estimated cost
- Revenue

「どこが詰まっているか」を先に見せる。

## Phase 4 integration hardening

Phase 5実装時に、Phase 4の`xRoutes`がWorkerへimportされている一方で`/api/x`へroute登録されていない問題を修正する。

Phase 5では以下を明示登録する。

```text
/api/x
/api/production
/r/{tracking_key}
```

## Phase 5 completion

- [x] Opportunity Ranking
- [x] Calendar / Queue
- [x] Weekly Learning
- [x] Cross-account Duplicate Guard
- [x] Engagement Overlap Guard
- [x] Click / Conversion / Revenue Attribution
- [x] Secret-safe Export / Backup
- [x] Production Dashboard
- [x] Phase 4 X route registration hardening
- [x] PC / SP UI
- [x] Phase 5 D1 Migration / Smoke Test

## Cost

Phase 5固有機能の追加外部APIコストは0円。

- Opportunity: D1 local calculation
- Calendar: D1
- Weekly Learning: saved Metrics
- Cross Guard: local text similarity
- Revenue Attribution: D1
- Backup: D1 + Web Crypto

X API CostはPhase 4の明示同期操作のみ。
