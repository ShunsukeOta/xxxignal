import { AlertTriangle, Check, CheckCircle2, CopyCheck, MessageSquareWarning, RotateCcw, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ContentDraft, ContentOverview, DraftRejectReason, XAccount } from '../../shared/contracts'
import { api } from '../api'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { SelectField, TextAreaField } from '../components/Field'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'

const reasonLabel: Record<Exclude<DraftRejectReason, ''>, string> = {
  off_voice: 'Voiceと合わない',
  too_generic: '内容が一般的すぎる',
  too_salesy: '売り込み感が強い',
  fact_risk: '事実確認が必要',
  duplicate: '既存投稿と近すぎる',
  weak_hook: 'Hookが弱い',
  other: 'その他',
}

export function ApprovalQueuePage() {
  const { showToast } = useToast()
  const [overview, setOverview] = useState<ContentOverview>({ drafts: [], archivedDrafts: [], voiceMemories: [] })
  const [accounts, setAccounts] = useState<XAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<ContentDraft | null>(null)
  const [rejectForm, setRejectForm] = useState({ reasonCode: 'off_voice' as Exclude<DraftRejectReason, ''>, comment: '', remember: true })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [contentData, accountData] = await Promise.all([api<ContentOverview>('/content/overview'), api<XAccount[]>('/accounts')])
      setOverview(contentData)
      setAccounts(accountData)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '承認キューを読み込めませんでした。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const queue = useMemo(() => overview.drafts.filter((draft) => draft.status === 'review'), [overview.drafts])
  const approved = useMemo(() => overview.drafts.filter((draft) => draft.status === 'approved'), [overview.drafts])
  const rejected = useMemo(() => overview.drafts.filter((draft) => draft.status === 'rejected'), [overview.drafts])
  const accountName = (accountId: string) => accounts.find((account) => account.id === accountId)?.displayName ?? 'Unknown account'

  async function approve(draft: ContentDraft) {
    setBusyId(draft.id)
    try {
      await api(`/content/drafts/${draft.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'approved' }) })
      showToast('Draftを承認しました')
      await load()
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : '承認できませんでした。', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function reject() {
    if (!rejecting) return
    setBusyId(rejecting.id)
    try {
      await api(`/content/drafts/${rejecting.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: 'rejected', ...rejectForm }),
      })
      showToast(rejectForm.remember ? '却下理由をVoice Memoryへ反映しました' : 'Draftを却下しました')
      setRejecting(null)
      setRejectForm({ reasonCode: 'off_voice', comment: '', remember: true })
      await load()
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : '却下処理に失敗しました。', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function resubmit(draft: ContentDraft) {
    setBusyId(draft.id)
    try {
      await api(`/content/drafts/${draft.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'review' }) })
      showToast('再レビューへ送りました')
      await load()
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : '再レビューへ送れませんでした。', 'error')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <div className="card-skeletons"><div className="skeleton skeleton--card" /><div className="skeleton skeleton--card" /></div>

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">HUMAN REVIEW</p><h1>承認待ち</h1><p>AIやテンプレートが作った文章も、最終判断は必ず人間が行います。</p></div>
      </div>

      <section className="stat-grid content-stats">
        <article className="stat-card"><div className="stat-card__top"><span>承認待ち</span><MessageSquareWarning size={18} /></div><strong>{queue.length}</strong><p>今確認すべきDraft</p></article>
        <article className="stat-card"><div className="stat-card__top"><span>承認済み</span><CheckCircle2 size={18} /></div><strong>{approved.length}</strong><p>投稿アシスト待ち</p></article>
        <article className="stat-card"><div className="stat-card__top"><span>却下</span><XCircle size={18} /></div><strong>{rejected.length}</strong><p>編集後に再レビュー可能</p></article>
        <article className="stat-card"><div className="stat-card__top"><span>高類似</span><CopyCheck size={18} /></div><strong>{queue.filter((draft) => draft.duplicateScore >= 82).length}</strong><p>類似度82%以上</p></article>
      </section>

      {error ? <EmptyState icon={<AlertTriangle size={24} />} title="承認キューを読み込めませんでした" description={error} action={<Button variant="secondary" onClick={() => void load()}>再試行</Button>} /> : null}

      {!error ? (
        <section className="panel">
          <div className="panel__heading"><div><h2>Review Queue</h2><p>投稿本文・Hook・類似度を確認してから承認してください。</p></div></div>
          {queue.length === 0 ? <EmptyState icon={<Check size={24} />} title="承認待ちはありません" description="Content StudioからDraftを承認依頼すると、ここに表示されます。" /> : (
            <div className="approval-list">
              {queue.map((draft) => (
                <article className="approval-card" key={draft.id}>
                  <div className="approval-card__head">
                    <div><span className="eyebrow">{accountName(draft.accountId)} · v{draft.currentVersion}</span><h3>{draft.title || 'Untitled Draft'}</h3></div>
                    <span className={`duplicate-badge ${draft.duplicateScore >= 82 ? 'duplicate-badge--high' : draft.duplicateScore >= 65 ? 'duplicate-badge--medium' : 'duplicate-badge--none'}`}>類似 {draft.duplicateScore}%</span>
                  </div>
                  {draft.duplicateScore >= 82 ? <div className="approval-alert"><AlertTriangle size={14} />同一アカウントの既存Draftとかなり近い可能性があります。</div> : null}
                  {draft.currentHook ? <p className="approval-card__hook">{draft.currentHook}</p> : null}
                  <p className="approval-card__body">{draft.currentBody}</p>
                  <div className="approval-card__meta"><span>{draft.currentBody.length}文字</span><span>{draft.currentAngle || 'Angle未設定'}</span></div>
                  <div className="approval-card__actions">
                    <Button variant="secondary" disabled={busyId === draft.id} icon={<XCircle size={14} />} onClick={() => setRejecting(draft)}>却下</Button>
                    <Button disabled={busyId === draft.id} icon={<CheckCircle2 size={14} />} onClick={() => void approve(draft)}>承認</Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!error && rejected.length > 0 ? (
        <section className="panel approval-history-panel">
          <div className="panel__heading"><div><h2>Rejected</h2><p>却下DraftはContent Studioで編集するとVersionが増え、再レビューできます。</p></div></div>
          <div className="research-list">{rejected.map((draft) => <div className="research-row" key={draft.id}><div className="research-row__main"><strong>{draft.title}</strong><p>{draft.currentBody}</p><small>{accountName(draft.accountId)} · v{draft.currentVersion}</small></div><div className="research-row__actions"><Button size="sm" variant="secondary" disabled={busyId === draft.id} icon={<RotateCcw size={13} />} onClick={() => void resubmit(draft)}>再レビュー</Button></div></div>)}</div>
        </section>
      ) : null}

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Draftを却下"
        description="理由は次の生成品質を上げるための重要なデータです。"
        size="md"
        footer={<><Button variant="secondary" onClick={() => setRejecting(null)}>キャンセル</Button><Button variant="danger" disabled={busyId === rejecting?.id} onClick={() => void reject()}>却下する</Button></>}
      >
        <div className="form-grid">
          <SelectField label="却下理由" value={rejectForm.reasonCode} onChange={(event) => setRejectForm({ ...rejectForm, reasonCode: event.target.value as Exclude<DraftRejectReason, ''> })}>{Object.entries(reasonLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</SelectField>
          <TextAreaField label="具体的な理由" value={rejectForm.comment} onChange={(event) => setRejectForm({ ...rejectForm, comment: event.target.value })} placeholder="例：「解説します」は自分の文体では使わない。冒頭をもっと短くしたい。" hint={rejectForm.remember ? 'Voice Memoryへ保存する場合は必須です。' : '任意です。'} />
          <label className="review-memory-toggle"><input type="checkbox" checked={rejectForm.remember} onChange={(event) => setRejectForm({ ...rejectForm, remember: event.target.checked })} /><span><strong>Voice Memoryへ保存</strong><small>次回以降のAI生成コンテキストに反映します。</small></span></label>
        </div>
      </Modal>
    </>
  )
}
