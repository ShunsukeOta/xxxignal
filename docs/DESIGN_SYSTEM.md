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
