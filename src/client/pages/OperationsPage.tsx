import { AlertTriangle, CalendarClock, CheckCircle2, Download, RefreshCw, ShieldCheck, Sparkles, Target } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CalendarItemKind, Opportunity, OperationsOverview, WorkspaceBackup, XAccount } from '../../shared/contracts'
import { api } from '../api'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { SelectField, TextAreaField, TextField } from '../components/Field'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'

type Tab = 'opportunities' | 'calendar' | 'learning' | 'guards' | 'backup'

export function OperationsPage() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<Tab>('opportunities')
  const [data, setData] = useState<OperationsOverview | null>(null)
  const [accounts, setAccounts] = useState<XAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarForm, setCalendarForm] = useState({
    accountId: '',
    draftId: '',
    opportunityId: '',
    kind: 'manual' as CalendarItemKind,
    title: '',
    scheduledFor: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
    notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [overview, accountData] = await Promise.all([
        api<OperationsOverview>('/production/overview'),
        api<XAccount[]>('/accounts'),
      ])
      setData(overview)
      setAccounts(accountData)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '運用データを読み込めませんでした。', 'error')
    } finally { setLoading(false) }
  }, [showToast])

  useEffect(() => { void load() }, [load])

  const accountName = (id: string | null) => id ? accounts.find((a) => a.id === id)?.displayName ?? 'Unknown' : '共通'
  const activeOpportunities = useMemo(() => (data?.opportunities ?? []).filter((item) => !['done', 'dismissed'].includes(item.status)), [data])

  async function rebuild() {
    setBusy('rebuild')
    try {
      const result = await api<{ research: number; mentions: number }>('/production/opportunities/rebuild', { method: 'POST', body: '{}' })
      showToast('Opportunityを再計算しました（Research ' + result.research + ' / Mentions ' + result.mentions + '）')
      await load()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '再計算できませんでした。', 'error')
    } finally { setBusy(null) }
  }

  async function setOpportunityStatus(id: string, status: 'new' | 'planned' | 'done' | 'dismissed') {
    setBusy(id)
    try {
      await api('/production/opportunities/' + id, { method: 'PATCH', body: JSON.stringify({ status }) })
      await load()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Opportunityを更新できませんでした。', 'error')
    } finally { setBusy(null) }
  }

  function openSchedule(opportunity?: Opportunity) {
    setCalendarForm({
      accountId: opportunity?.accountId ?? accounts[0]?.id ?? '',
      draftId: '',
      opportunityId: opportunity?.id ?? '',
      kind: opportunity ? 'followup' : 'manual',
      title: opportunity?.title ?? '',
      scheduledFor: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
      notes: opportunity?.summary ?? '',
    })
    setCalendarOpen(true)
  }

  async function saveCalendar() {
    setBusy('calendar')
    try {
      await api('/production/calendar', {
        method: 'POST',
        body: JSON.stringify({
          ...calendarForm,
          draftId: calendarForm.draftId || null,
          opportunityId: calendarForm.opportunityId || null,
          scheduledFor: new Date(calendarForm.scheduledFor).toISOString(),
        }),
      })
      showToast('Calendarへ追加しました')
      setCalendarOpen(false)
      await load()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Calendarへ追加できませんでした。', 'error')
    } finally { setBusy(null) }
  }

  async function updateCalendar(id: string, status: 'done' | 'cancelled') {
    setBusy(id)
    try {
      await api('/production/calendar/' + id, { method: 'PATCH', body: JSON.stringify({ status }) })
      await load()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Calendarを更新できませんでした。', 'error')
    } finally { setBusy(null) }
  }

  async function generateLearning() {
    setBusy('learning')
    try {
      const result = await api<{ posts: number; accounts: number }>('/production/learning/generate', { method: 'POST', body: '{}' })
      showToast('週次学習を更新しました（' + result.posts + ' posts / ' + result.accounts + ' accounts）')
      await load()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '週次学習を生成できませんでした。', 'error')
    } finally { setBusy(null) }
  }

  async function downloadBackup() {
    setBusy('backup')
    try {
      const backup = await api<WorkspaceBackup>('/production/export')
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'xxxignal-backup-' + backup.generatedAt.slice(0, 10) + '.json'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      showToast('Secretを除外したBackupを作成しました')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Backupを作成できませんでした。', 'error')
    } finally { setBusy(null) }
  }

  if (loading || !data) return <div className="card-skeletons"><div className="skeleton skeleton--card" /><div className="skeleton skeleton--card" /></div>

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">PHASE 5 · PRODUCTION MVP</p><h1>運用</h1><p>3アカウントの「次にやること・予定・学習・重複リスク」を一画面で管理します。</p></div>
      <Button icon={<CalendarClock size={15} />} onClick={() => openSchedule()}>予定を追加</Button>
    </div>

    <section className="stat-grid">
      <article className="stat-card"><div className="stat-card__top"><span>Opportunity</span><Target size={18} /></div><strong>{activeOpportunities.length}</strong><p>未完了の候補</p></article>
      <article className="stat-card"><div className="stat-card__top"><span>予定</span><CalendarClock size={18} /></div><strong>{data.calendar.filter((x) => x.status === 'planned').length}</strong><p>Calendar Queue</p></article>
      <article className="stat-card"><div className="stat-card__top"><span>Cross Guard</span><ShieldCheck size={18} /></div><strong>{data.duplicateIssues.length + data.engagementIssues.length}</strong><p>要確認の重複</p></article>
      <article className="stat-card"><div className="stat-card__top"><span>Learning</span><Sparkles size={18} /></div><strong>{data.learnings.length}</strong><p>保存済み週次学習</p></article>
    </section>

    <div className="production-tabs">
      {([['opportunities','Opportunity'],['calendar','Calendar'],['learning','Weekly Learning'],['guards','Cross Guard'],['backup','Backup']] as const).map(([key,label]) =>
        <button type="button" key={key} className={tab===key?'active':''} onClick={() => setTab(key)}>{label}</button>
      )}
    </div>

    {tab === 'opportunities' ? <section className="panel">
      <div className="panel__heading"><div><h2>Opportunity Ranking</h2><p>Research / Mentionの鮮度とAccount Fitからローカル計算します。外部AI APIは使いません。</p></div><Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} disabled={busy==='rebuild'} onClick={() => void rebuild()}>再計算</Button></div>
      {activeOpportunities.length === 0 ? <EmptyState icon={<Target size={24} />} title="Opportunityはありません" description="ResearchやMentionsを蓄積してから再計算してください。" /> :
        <div className="opportunity-list">{activeOpportunities.map((item) => <article className="opportunity-card" key={item.id}>
          <div className="opportunity-card__score"><strong>{item.score}</strong><span>score</span></div>
          <div className="opportunity-card__main"><div className="opportunity-card__head"><span>{item.sourceType} · {accountName(item.accountId)}</span><span>{item.status}</span></div><h3>{item.title}</h3><p>{item.summary || '概要なし'}</p><small>Urgency {item.urgency} / Fit {item.fit}</small></div>
          <div className="opportunity-card__actions"><Button size="sm" onClick={() => openSchedule(item)}>予定化</Button><Button size="sm" variant="ghost" disabled={busy===item.id} onClick={() => void setOpportunityStatus(item.id,'done')}>完了</Button><Button size="sm" variant="ghost" disabled={busy===item.id} onClick={() => void setOpportunityStatus(item.id,'dismissed')}>除外</Button></div>
        </article>)}</div>}
    </section> : null}

    {tab === 'calendar' ? <section className="panel">
      <div className="panel__heading"><div><h2>Calendar / Queue</h2><p>自動投稿予約ではなく、何を・どのアカウントで・いつ処理するかを管理します。</p></div><Button size="sm" onClick={() => openSchedule()}>追加</Button></div>
      {data.calendar.length === 0 ? <EmptyState icon={<CalendarClock size={24} />} title="予定はありません" description="Opportunityや承認済みDraftを予定へ入れてください。" /> :
        <div className="calendar-list">{data.calendar.map((item) => <article className={'calendar-row calendar-row--' + item.status} key={item.id}><div className="calendar-row__time"><strong>{new Date(item.scheduledFor).toLocaleDateString('ja-JP')}</strong><span>{new Date(item.scheduledFor).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}</span></div><div className="calendar-row__main"><span>{item.kind} · {accountName(item.accountId)}</span><h3>{item.title}</h3>{item.notes ? <p>{item.notes}</p> : null}</div><div className="calendar-row__actions">{item.status === 'planned' ? <><Button size="sm" disabled={busy===item.id} onClick={() => void updateCalendar(item.id,'done')}>完了</Button><Button size="sm" variant="ghost" disabled={busy===item.id} onClick={() => void updateCalendar(item.id,'cancelled')}>取消</Button></> : <span className="production-status">{item.status}</span>}</div></article>)}</div>}
    </section> : null}

    {tab === 'learning' ? <section className="panel">
      <div className="panel__heading"><div><h2>Weekly Learning</h2><p>直近7日間の保存済みX Metricsをローカル集計し、勝ち筋候補を残します。</p></div><Button size="sm" variant="secondary" icon={<Sparkles size={13} />} disabled={busy==='learning'} onClick={() => void generateLearning()}>今週を生成</Button></div>
      {data.learnings.length === 0 ? <EmptyState icon={<Sparkles size={24} />} title="学習データはありません" description="Posts同期後に「今週を生成」を実行してください。" /> :
        <div className="learning-list">{data.learnings.map((learning) => <article className="learning-card" key={learning.id}><div className="learning-card__head"><div><strong>{accountName(learning.accountId)}</strong><span>{learning.weekStart} · {learning.sampleSize} posts</span></div></div><p>{learning.summary}</p><div className="learning-columns"><div><h4>Observations</h4>{learning.observations.map((x,i)=><p key={i}>{x}</p>)}</div><div><h4>Next actions</h4>{learning.recommendations.map((x,i)=><p key={i}>{x}</p>)}</div></div>{learning.winners[0] ? <div className="learning-winner"><span>TOP</span><p>{learning.winners[0].text}</p><strong>{learning.winners[0].score}</strong></div> : null}</article>)}</div>}
    </section> : null}

    {tab === 'guards' ? <div className="production-guard-grid">
      <section className="panel"><div className="panel__heading"><div><h2>Cross-account Duplicate</h2><p>別アカウント間で65%以上類似するDraftを検出。</p></div></div>{data.duplicateIssues.length === 0 ? <EmptyState icon={<ShieldCheck size={22} />} title="高類似Draftはありません" description="現時点のCross-account重複は検出されていません。" /> : <div className="guard-list">{data.duplicateIssues.map((issue) => <div className="guard-row" key={issue.leftDraftId + '-' + issue.rightDraftId}><AlertTriangle size={16}/><div><strong>{issue.score}%</strong><p>{issue.leftTitle} ↔ {issue.rightTitle}</p><small>{accountName(issue.leftAccountId)} / {accountName(issue.rightAccountId)}</small></div></div>)}</div>}</section>
      <section className="panel"><div className="panel__heading"><div><h2>Engagement Overlap</h2><p>複数アカウントで同一Post候補を触る事故を防ぎます。</p></div></div>{data.engagementIssues.length === 0 ? <EmptyState icon={<CheckCircle2 size={22} />} title="接触重複はありません" description="同一Mentionへの複数アカウント接触候補はありません。" /> : <div className="guard-list">{data.engagementIssues.map((issue) => <div className="guard-row" key={issue.key}><AlertTriangle size={16}/><div><strong>{issue.accountIds.length} accounts</strong><p>{issue.text}</p><small>{issue.accountIds.map(accountName).join(' / ')}</small></div></div>)}</div>}</section>
    </div> : null}

    {tab === 'backup' ? <section className="panel">
      <div className="panel__heading"><div><h2>Export / Backup</h2><p>WorkspaceデータをJSONへまとめます。X Access/Refresh Token、Client Secret、暗号化Keyは含めません。</p></div></div>
      <div className="backup-card"><Download size={28}/><div><strong>Secret-safe Workspace Backup</strong><p>{data.exportSummary.accounts} accounts / {data.exportSummary.researchItems} research / {data.exportSummary.drafts} drafts / {data.exportSummary.xPosts} posts / {data.exportSummary.attributionLinks} links</p><small>SHA-256 checksum付き。version=1で固定。</small></div><Button disabled={busy==='backup'} onClick={() => void downloadBackup()}>JSONを作成</Button></div>
    </section> : null}

    <Modal open={calendarOpen} onClose={() => setCalendarOpen(false)} title="Calendarへ追加" description="自動投稿ではありません。実行予定をxxxignal内へ登録します。" footer={<><Button variant="secondary" onClick={() => setCalendarOpen(false)}>キャンセル</Button><Button disabled={busy==='calendar' || !calendarForm.accountId || !calendarForm.title || !calendarForm.scheduledFor} onClick={() => void saveCalendar()}>追加</Button></>}>
      <div className="form-grid form-grid--2">
        <SelectField label="アカウント" value={calendarForm.accountId} onChange={(e)=>setCalendarForm({...calendarForm,accountId:e.target.value})}><option value="">選択</option>{accounts.map((a)=><option key={a.id} value={a.id}>{a.displayName} (@{a.handle})</option>)}</SelectField>
        <SelectField label="種別" value={calendarForm.kind} onChange={(e)=>setCalendarForm({...calendarForm,kind:e.target.value as CalendarItemKind})}><option value="publish">Publish</option><option value="followup">Follow-up</option><option value="research">Research</option><option value="manual">Manual</option></SelectField>
        <TextField label="タイトル" value={calendarForm.title} onChange={(e)=>setCalendarForm({...calendarForm,title:e.target.value})}/>
        <TextField label="予定日時" type="datetime-local" value={calendarForm.scheduledFor} onChange={(e)=>setCalendarForm({...calendarForm,scheduledFor:e.target.value})}/>
        <SelectField label="承認済みDraft" value={calendarForm.draftId} onChange={(e)=>setCalendarForm({...calendarForm,draftId:e.target.value})}><option value="">紐付けなし</option>{data.approvedDrafts.filter((d)=>!calendarForm.accountId||d.accountId===calendarForm.accountId).map((d)=><option key={d.id} value={d.id}>{d.title}</option>)}</SelectField>
        <div className="form-grid__full"><TextAreaField label="メモ" value={calendarForm.notes} onChange={(e)=>setCalendarForm({...calendarForm,notes:e.target.value})}/></div>
      </div>
    </Modal>
  </>
}
