# xxxignal Design System

## Principles

- Monochrome first
- Noto Sans JP
- 操作状態を色だけに依存しない
- PCは情報密度、SPは片手操作を優先
- 同じButton / Field / Modal / Empty Stateを全Phaseで再利用

## Phase 3 patterns

### Content Studio

- Desktop: Compose 2-column
  - AI Assist
  - Manual Draft
- Mobile: 1-column
- Candidate Cardは`Angle / Title / Hook / Body / Duplicate / Action`の順序を固定

### Duplicate state

色だけでなく必ず数値を表示する。

- None: `類似 0%`
- Low: `類似 35%+`
- Medium: `類似 65%+`
- High: `類似 82%+`

Highは承認禁止にはせず、人間判断を促す。

### Human Review

Review Cardは本文が最も大きい情報。

Primary action: 承認
Secondary action: 却下

却下は理由Modalを必ず経由する。

### Voice Memory

種類は3つ。

- preference
- avoidance
- observation

自動学習に見えないよう、Reject時の`Voice Memoryへ保存`は明示Toggleにする。

### Publish Assist

Approvedだけを表示。

- コピー
- Xで開く
- 投稿済みにする

`投稿済みにする`前に「Xへ自動投稿する操作ではない」ことを確認Modalで示す。

## Responsive

### >= 1100px

- Compose / Voice Memoryは2-column

### 761–1099px

- 主要フォームを1-columnへ
- Draft / Approval Cardは必要に応じ2-column

### <= 760px

- Bottom navigation
- Card 1-column
- Modal full screen
- Footer actionsは横幅を最大利用
- safe-areaを考慮


## Phase 4 patterns

### OAuth Connection Card

- Account名 / @handle
- Health badge
- Token state
- Last sync
- Primary: Xを接続
- Connected時: Posts同期 / Mentions同期 / 解除

Healthは色だけでなくtext labelを必ず表示する。

### Analytics Table

PCは横スクロール可能なtable。
SPでもcolumnを無理に潰さず、横スクロールで数値を維持する。

表示:
- Post
- Account
- Impression
- Like
- Reply
- Repost
- Profile Click
- Link Click

### Cost Ledger

- 今月推定Cost
- Budget
- Progress meter
- Pricing snapshot
- resource count
- endpoint

Dollar表示は小数4桁まで出し、$0.0000と$0.0050を区別できるようにする。

### Budget Guard

Danger操作ではなくProtection設定として扱う。

- Monthly Budget
- Warning %
- Hard Limit toggle

Hard Limit有効時はAPI requestを送る前に停止する旨を明記する。

### Engagement Inbox

自動返信UIにしない。

- Post本文
- Account
- Xで開く
- 確認済み
- 無視

人間操作をPrimary workflowとする。
