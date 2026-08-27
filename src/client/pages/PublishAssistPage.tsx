import { CheckCircle2, Clipboard, ExternalLink, Send, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ContentDraft, ContentOverview, XAccount } from '../../shared/contracts'
import { api } from '../api'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'

export function PublishAssistPage() {
  const { showToast } = useToast()
  const [overview, setOverview] = useState<ContentOverview>({ drafts: [], archivedDrafts: [], voiceMemories: [] })
  const [accounts, setAccounts] = useState<XAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmPublish, setConfirmPublish] = useState<ContentDraft | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [contentData, accountData] = await Promise.all([api<ContentOverview>('/content/overview'), api<XAccount[]>('/accounts')])
      setOverview(contentData); setAccounts(accountData)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '投稿アシストを読み込めませんでした。')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const approved = useMemo(() => overview.drafts.filter((draft) => draft.status === 'approved'), [overview.drafts])
  const published = useMemo(() => overview.drafts.filter((draft) => draft.status === 'published'), [overview.drafts])
  const accountName = (id: string) => accounts.find((account) => account.id === id)?.displayName ?? 'Unknown account'

  async function copyText(draft: ContentDraft) {
    try { await navigator.clipboard.writeText(draft.currentBody); showToast('本文をコピーしました') }
    catch { showToast('クリップボードへコピーできませんでした。ブラウザ権限を確認してください。', 'error') }
  }
  function openX(draft: ContentDraft) {
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(draft.currentBody)}`, '_blank', 'noopener,noreferrer')
  }
  async function markPublished() {
    if (!confirmPublish) return
    setBusyId(confirmPublish.id)
    try {
      await api(`/content/drafts/${confirmPublish.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'published' }) })
      showToast('投稿済みとして記録しました'); setConfirmPublish(null); await load()
    } catch (caught) { showToast(caught instanceof Error ? caught.message : '投稿済みに更新できませんでした。', 'error') }
    finally { setBusyId(null) }
  }

  if (loading) return <div className="card-skeletons"><div className="skeleton skeleton--card" /><div className="skeleton skeleton--card" /></div>

  return <>
    <div className="page-heading"><div><p className="eyebrow">MANUAL PUBLISH ASSIST</p><h1>投稿アシスト</h1><p>承認済みDraftだけをX公式画面へ渡します。xxxignalから自動投稿はしません。</p></div></div>

    <section className="stat-grid content-stats">
      <article className="stat-card"><div className="stat-card__top"><span>投稿待ち</span><Send size={18} /></div><strong>{approved.length}</strong><p>Approved Draft</p></article>
      <article className="stat-card"><div className="stat-card__top"><span>投稿済み</span><CheckCircle2 size={18} /></div><strong>{published.length}</strong><p>手動で完了記録</p></article>
      <article className="stat-card"><div className="stat-card__top"><span>X API投稿</span><ShieldCheck size={18} /></div><strong>OFF</strong><p>Phase 3では自動投稿なし</p></article>
      <article className="stat-card"><div className="stat-card__top"><span>投稿コスト</span><Clipboard size={18} /></div><strong>¥0</strong><p>Web Intent / Clipboardのみ</p></article>
    </section>

    {error ? <EmptyState icon={<Send size={24} />} title="投稿アシストを読み込めませんでした" description={error} action={<Button variant="secondary" onClick={() => void load()}>再試行</Button>} /> : null}

    {!error ? <section className="panel">
      <div className="panel__heading"><div><h2>Ready to Publish</h2><p>X側で内容・メディア・公開アカウントを最後に確認して投稿してください。</p></div></div>
      {approved.length === 0 ? <EmptyState icon={<CheckCircle2 size={24} />} title="投稿待ちはありません" description="承認キューでDraftをApprovedにするとここへ表示されます。" /> :
        <div className="publish-list">{approved.map((draft) => <article className="publish-card" key={draft.id}>
          <div className="publish-card__head"><div><span className="eyebrow">{accountName(draft.accountId)} · v{draft.currentVersion}</span><h3>{draft.title || 'Untitled Draft'}</h3></div><span className="draft-status draft-status--approved">approved</span></div>
          {draft.currentHook ? <p className="publish-card__hook">{draft.currentHook}</p> : null}
          <p className="publish-card__body">{draft.currentBody}</p>
          <div className="publish-card__meta"><span>{draft.currentBody.length}文字</span><span>類似 {draft.duplicateScore}%</span><span>最終更新 {new Date(draft.updatedAt).toLocaleString('ja-JP')}</span></div>
          <div className="publish-card__actions"><Button variant="secondary" icon={<Clipboard size={14} />} onClick={() => void copyText(draft)}>本文をコピー</Button><Button variant="secondary" icon={<ExternalLink size={14} />} onClick={() => openX(draft)}>Xで開く</Button><Button disabled={busyId === draft.id} icon={<CheckCircle2 size={14} />} onClick={() => setConfirmPublish(draft)}>投稿済みにする</Button></div>
        </article>)}</div>}
    </section> : null}

    {!error && published.length > 0 ? <section className="panel content-archive-panel">
      <div className="panel__heading"><div><h2>Published History</h2><p>Phase 4まではX APIで照合せず、人間が完了記録した履歴です。</p></div></div>
      <div className="research-list">{published.slice(0, 30).map((draft) => <div className="research-row" key={draft.id}><div className="research-row__main"><strong>{draft.title || 'Untitled Draft'}</strong><p>{draft.currentBody}</p><small>{accountName(draft.accountId)} · {draft.publishedAt ? new Date(draft.publishedAt).toLocaleString('ja-JP') : '日時不明'}</small></div></div>)}</div>
    </section> : null}

    <Modal open={Boolean(confirmPublish)} onClose={() => setConfirmPublish(null)} title="投稿済みにしますか？" description="X APIで投稿成功を確認する処理はPhase 3にはありません。X側で実際に投稿できたことを確認してから実行してください。" size="md" footer={<><Button variant="secondary" onClick={() => setConfirmPublish(null)}>キャンセル</Button><Button disabled={busyId === confirmPublish?.id} onClick={() => void markPublished()}>投稿済みにする</Button></>}>
      {confirmPublish ? <div className="publish-confirm"><strong>{accountName(confirmPublish.accountId)}</strong><p>{confirmPublish.currentBody}</p></div> : null}
    </Modal>
  </>
}
