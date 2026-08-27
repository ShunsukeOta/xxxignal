import { Archive, Bot, CheckCircle2, FilePenLine, History, Lightbulb, Plus, RefreshCw, RotateCcw, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AiProviderStatus, ContentDraft, ContentOverview, DraftDetail, DraftTargetAction, GenerateDraftResult, GeneratedDraftCandidate, ResearchOverview, VoiceMemoryKind, XAccount } from '../../shared/contracts'
import { api } from '../api'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { SelectField, TextAreaField, TextField } from '../components/Field'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'

const targetActionLabel: Record<DraftTargetAction, string> = {
  engagement: '反応', reply: '返信', profile_click: 'プロフィール遷移', share: '共有',
  dwell: '滞在', follow: 'フォロー', conversion: 'コンバージョン',
}
const memoryKindLabel: Record<VoiceMemoryKind, string> = { preference: '好み', avoidance: '避ける', observation: '観察' }

export function ContentStudioPage() {
  const { showToast } = useToast()
  const [overview, setOverview] = useState<ContentOverview>({ drafts: [], archivedDrafts: [], voiceMemories: [] })
  const [accounts, setAccounts] = useState<XAccount[]>([])
  const [research, setResearch] = useState<ResearchOverview>({ sources: [], targets: [], items: [] })
  const [provider, setProvider] = useState<AiProviderStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ContentDraft | null>(null)
  const [generationOpen, setGenerationOpen] = useState(false)
  const [generated, setGenerated] = useState<GenerateDraftResult | null>(null)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [detail, setDetail] = useState<DraftDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [editorForm, setEditorForm] = useState({ accountId: '', researchItemId: '', title: '', targetAction: 'engagement' as DraftTargetAction, hook: '', body: '', angle: '' })
  const [generateForm, setGenerateForm] = useState({ accountId: '', researchItemId: '', targetAction: 'engagement' as DraftTargetAction, instruction: '', count: 3 as 1 | 2 | 3 })
  const [memoryForm, setMemoryForm] = useState({ accountId: '', kind: 'observation' as VoiceMemoryKind, content: '' })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [contentData, accountData, researchData, providerData] = await Promise.all([
        api<ContentOverview>('/content/overview'),
        api<XAccount[]>('/accounts'),
        api<ResearchOverview>('/research/overview'),
        api<AiProviderStatus>('/content/ai/status'),
      ])
      setOverview(contentData); setAccounts(accountData); setResearch(researchData); setProvider(providerData)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Content Studioを読み込めませんでした。')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const drafts = useMemo(() => overview.drafts.filter((draft) => draft.status !== 'published'), [overview.drafts])
  const publishedCount = useMemo(() => overview.drafts.filter((draft) => draft.status === 'published').length, [overview.drafts])
  const accountName = (id: string) => accounts.find((account) => account.id === id)?.displayName ?? 'Unknown account'

  function resetEditor() {
    setEditing(null)
    setEditorForm({ accountId: accounts[0]?.id ?? '', researchItemId: '', title: '', targetAction: 'engagement', hook: '', body: '', angle: '' })
  }
  function openCreate() { resetEditor(); setEditorOpen(true) }
  function openEdit(draft: ContentDraft) {
    setEditing(draft)
    setEditorForm({ accountId: draft.accountId, researchItemId: draft.researchItemId ?? '', title: draft.title, targetAction: draft.targetAction, hook: draft.currentHook, body: draft.currentBody, angle: draft.currentAngle })
    setEditorOpen(true)
  }

  async function saveDraft() {
    setBusyId(editing?.id ?? 'new')
    try {
      if (editing) {
        await api(`/content/drafts/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ title: editorForm.title, targetAction: editorForm.targetAction, hook: editorForm.hook, body: editorForm.body, angle: editorForm.angle }) })
        showToast('新しいVersionとして保存しました')
      } else {
        await api('/content/drafts', { method: 'POST', body: JSON.stringify({ ...editorForm, researchItemId: editorForm.researchItemId || null, source: 'manual' }) })
        showToast('Draftを作成しました')
      }
      setEditorOpen(false); resetEditor(); await load()
    } catch (caught) { showToast(caught instanceof Error ? caught.message : 'Draftを保存できませんでした。', 'error') }
    finally { setBusyId(null) }
  }

  async function generateCandidates() {
    setBusyId('generate')
    try {
      const result = await api<GenerateDraftResult>('/content/generate', { method: 'POST', body: JSON.stringify({ ...generateForm, researchItemId: generateForm.researchItemId || null }) })
      setGenerated(result); showToast(`${result.candidates.length}件の候補を生成しました`)
    } catch (caught) { showToast(caught instanceof Error ? caught.message : '候補を生成できませんでした。', 'error') }
    finally { setBusyId(null) }
  }

  async function saveCandidate(candidate: GeneratedDraftCandidate, index: number) {
    const key = `candidate-${index}`; setBusyId(key)
    try {
      await api('/content/drafts', { method: 'POST', body: JSON.stringify({
        accountId: generateForm.accountId, researchItemId: generateForm.researchItemId || null, title: candidate.title,
        targetAction: candidate.targetAction, hook: candidate.hook, body: candidate.body, angle: candidate.angle, source: 'ai',
        aiProvider: generated?.provider ?? provider?.provider ?? '', aiModel: generated?.model ?? provider?.model ?? '',
        aiMetadata: { generatedAt: new Date().toISOString() },
      }) })
      showToast('候補をDraftとして保存しました'); await load()
    } catch (caught) { showToast(caught instanceof Error ? caught.message : '候補を保存できませんでした。', 'error') }
    finally { setBusyId(null) }
  }

  async function submitReview(draft: ContentDraft) {
    setBusyId(draft.id)
    try { await api(`/content/drafts/${draft.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'review' }) }); showToast('承認待ちへ送りました'); await load() }
    catch (caught) { showToast(caught instanceof Error ? caught.message : '承認待ちへ送れませんでした。', 'error') }
    finally { setBusyId(null) }
  }
  async function archiveDraft(draft: ContentDraft) {
    setBusyId(draft.id)
    try { await api(`/content/drafts/${draft.id}/archive`, { method: 'POST' }); showToast('Draftをアーカイブしました'); await load() }
    catch (caught) { showToast(caught instanceof Error ? caught.message : 'アーカイブできませんでした。', 'error') }
    finally { setBusyId(null) }
  }
  async function restoreDraft(draft: ContentDraft) {
    setBusyId(draft.id)
    try { await api(`/content/drafts/${draft.id}/restore`, { method: 'POST' }); showToast('Draftを復元しました'); await load() }
    catch (caught) { showToast(caught instanceof Error ? caught.message : '復元できませんでした。', 'error') }
    finally { setBusyId(null) }
  }
  async function openHistory(draft: ContentDraft) {
    setBusyId(draft.id)
    try { setDetail(await api<DraftDetail>(`/content/drafts/${draft.id}`)); setDetailOpen(true) }
    catch (caught) { showToast(caught instanceof Error ? caught.message : 'Version履歴を取得できませんでした。', 'error') }
    finally { setBusyId(null) }
  }
  async function createMemory() {
    setBusyId('memory')
    try {
      await api('/content/voice-memory', { method: 'POST', body: JSON.stringify(memoryForm) })
      showToast('Voice Memoryを追加しました'); setMemoryOpen(false)
      setMemoryForm({ accountId: '', kind: 'observation', content: '' }); await load()
    } catch (caught) { showToast(caught instanceof Error ? caught.message : 'Voice Memoryを追加できませんでした。', 'error') }
    finally { setBusyId(null) }
  }
  async function archiveMemory(id: string) {
    setBusyId(id)
    try { await api(`/content/voice-memory/${id}/archive`, { method: 'POST' }); showToast('Voice Memoryをアーカイブしました'); await load() }
    catch (caught) { showToast(caught instanceof Error ? caught.message : 'Voice Memoryをアーカイブできませんでした。', 'error') }
    finally { setBusyId(null) }
  }
  function openGenerator() {
    setGenerated(null)
    setGenerateForm({ accountId: accounts[0]?.id ?? '', researchItemId: '', targetAction: 'engagement', instruction: '', count: 3 })
    setGenerationOpen(true)
  }

  if (loading) return <div className="card-skeletons"><div className="skeleton skeleton--card" /><div className="skeleton skeleton--card" /></div>

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">CONTENT STUDIO</p><h1>投稿案</h1><p>ResearchとVoiceを投稿候補へ変換し、Versionを残しながら人間が仕上げます。</p></div>
      <div className="content-heading-actions"><Button variant="secondary" icon={<FilePenLine size={15} />} onClick={openCreate}>手動Draft</Button><Button icon={<Sparkles size={15} />} onClick={openGenerator}>候補を生成</Button></div>
    </div>

    <section className="stat-grid content-stats">
      <article className="stat-card"><div className="stat-card__top"><span>Drafts</span><FilePenLine size={18} /></div><strong>{drafts.length}</strong><p>公開前の投稿候補</p></article>
      <article className="stat-card"><div className="stat-card__top"><span>承認待ち</span><CheckCircle2 size={18} /></div><strong>{overview.drafts.filter((d) => d.status === 'review').length}</strong><p>Human Review待ち</p></article>
      <article className="stat-card"><div className="stat-card__top"><span>Voice Memory</span><Lightbulb size={18} /></div><strong>{overview.voiceMemories.length}</strong><p>アカウント別の追加ルール</p></article>
      <article className="stat-card"><div className="stat-card__top"><span>AI Provider</span><Bot size={18} /></div><strong>{provider?.provider ?? '-'}</strong><p>{provider?.external ? `外部API · ${provider.model ?? '-'}` : '外部APIコスト0円'}</p></article>
    </section>

    {error ? <EmptyState icon={<RefreshCw size={24} />} title="Content Studioを読み込めませんでした" description={error} action={<Button variant="secondary" onClick={() => void load()}>再試行</Button>} /> : null}
    {!error && accounts.length === 0 ? <EmptyState icon={<FilePenLine size={24} />} title="運用アカウントが必要です" description="先にアカウント画面で1件以上登録してください。" /> : null}

    {!error && accounts.length > 0 ? <div className="content-layout">
      <section className="panel">
        <div className="panel__heading"><div><h2>Draft Library</h2><p>編集するたびにVersionを追加し、過去本文を残します。</p></div></div>
        {drafts.length === 0 ? <EmptyState icon={<FilePenLine size={24} />} title="Draftがありません" description="Researchから候補を生成するか、手動Draftを作成してください。" /> :
          <div className="draft-list">{drafts.map((draft) => <article className="draft-card" key={draft.id}>
            <div className="draft-card__head"><div><span className="eyebrow">{accountName(draft.accountId)} · v{draft.currentVersion}</span><h3>{draft.title || 'Untitled Draft'}</h3></div><span className={`draft-status draft-status--${draft.status}`}>{draft.status}</span></div>
            {draft.currentHook ? <p className="draft-card__hook">{draft.currentHook}</p> : null}
            <p className="draft-card__body">{draft.currentBody}</p>
            <div className="draft-card__meta"><span>{targetActionLabel[draft.targetAction]}</span><span>{draft.currentBody.length}文字</span><span className={draft.duplicateScore >= 82 ? 'duplicate-text duplicate-text--high' : ''}>類似 {draft.duplicateScore}%</span></div>
            <div className="draft-card__actions">
              <Button size="sm" variant="ghost" disabled={busyId === draft.id} icon={<History size={13} />} onClick={() => void openHistory(draft)}>履歴</Button>
              <Button size="sm" variant="secondary" disabled={busyId === draft.id || draft.status === 'review' || draft.status === 'approved'} onClick={() => openEdit(draft)}>編集</Button>
              {['draft', 'rejected'].includes(draft.status) ? <Button size="sm" disabled={busyId === draft.id} onClick={() => void submitReview(draft)}>承認依頼</Button> : null}
              {draft.status !== 'approved' ? <Button size="sm" variant="ghost" disabled={busyId === draft.id} icon={<Archive size={13} />} onClick={() => void archiveDraft(draft)}>Archive</Button> : null}
            </div>
          </article>)}</div>}
      </section>

      <aside className="content-side">
        <section className="panel">
          <div className="panel__heading"><div><h2>Voice Memory</h2><p>明示的に保存した追加ルールだけを生成時に利用。</p></div><Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => setMemoryOpen(true)}>追加</Button></div>
          {overview.voiceMemories.length === 0 ? <EmptyState icon={<Lightbulb size={22} />} title="Memoryはありません" description="Reject理由または手動登録から蓄積します。" /> :
            <div className="memory-list">{overview.voiceMemories.slice(0, 20).map((memory) => <div className="memory-item" key={memory.id}><div><span>{memoryKindLabel[memory.kind]} · {accountName(memory.accountId)}</span><p>{memory.content}</p></div><button type="button" onClick={() => void archiveMemory(memory.id)} disabled={busyId === memory.id} aria-label="Voice Memoryをアーカイブ"><Archive size={14} /></button></div>)}</div>}
        </section>
        <section className="panel content-cost-note"><div className="panel__heading"><div><h2>Provider</h2><p>Phase 4のCost Guardian導入前は外部API利用を最小化します。</p></div></div><div className="provider-note"><strong>{provider?.provider ?? '-'}</strong><p>{provider?.note ?? 'Provider情報を取得できません。'}</p><small>公開済み: {publishedCount} Draft</small></div></section>
      </aside>
    </div> : null}

    {overview.archivedDrafts.length > 0 ? <section className="panel content-archive-panel"><div className="panel__heading"><div><h2>Archived Drafts</h2><p>必要なDraftだけ復元できます。</p></div></div><div className="research-list">{overview.archivedDrafts.map((draft) => <div className="research-row" key={draft.id}><div className="research-row__main"><strong>{draft.title || 'Untitled Draft'}</strong><p>{draft.currentBody}</p><small>{accountName(draft.accountId)} · v{draft.currentVersion}</small></div><div className="research-row__actions"><Button size="sm" variant="secondary" icon={<RotateCcw size={13} />} disabled={busyId === draft.id} onClick={() => void restoreDraft(draft)}>復元</Button></div></div>)}</div></section> : null}

    <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title={editing ? 'Draftを編集' : '手動Draftを作成'} description={editing ? '保存すると旧Versionを残したまま新Versionを作成します。' : 'AIを使わずに投稿案を作成します。'} footer={<><Button variant="secondary" onClick={() => setEditorOpen(false)}>キャンセル</Button><Button disabled={busyId === (editing?.id ?? 'new') || !editorForm.accountId || !editorForm.body.trim()} onClick={() => void saveDraft()}>{editing ? '新Versionを保存' : 'Draftを保存'}</Button></>}>
      <div className="form-grid form-grid--2">
        <SelectField label="運用アカウント" value={editorForm.accountId} disabled={Boolean(editing)} onChange={(e) => setEditorForm({ ...editorForm, accountId: e.target.value })}><option value="">選択してください</option>{accounts.map((a) => <option value={a.id} key={a.id}>{a.displayName} (@{a.handle})</option>)}</SelectField>
        <SelectField label="Target Action" value={editorForm.targetAction} onChange={(e) => setEditorForm({ ...editorForm, targetAction: e.target.value as DraftTargetAction })}>{Object.entries(targetActionLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</SelectField>
        {!editing ? <SelectField label="Research Item" value={editorForm.researchItemId} onChange={(e) => setEditorForm({ ...editorForm, researchItemId: e.target.value })}><option value="">紐付けなし</option>{research.items.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</SelectField> : null}
        <TextField label="管理タイトル" value={editorForm.title} onChange={(e) => setEditorForm({ ...editorForm, title: e.target.value })} />
        <TextField label="Hook" value={editorForm.hook} onChange={(e) => setEditorForm({ ...editorForm, hook: e.target.value })} />
        <TextField label="Angle" value={editorForm.angle} onChange={(e) => setEditorForm({ ...editorForm, angle: e.target.value })} />
        <div className="form-grid__full"><TextAreaField label="投稿本文" required value={editorForm.body} onChange={(e) => setEditorForm({ ...editorForm, body: e.target.value })} rows={8} hint={`${editorForm.body.length}文字`} /></div>
      </div>
    </Modal>

    <Modal open={generationOpen} onClose={() => setGenerationOpen(false)} title="投稿候補を生成" description="Account Strategy / Voice / Memory / ResearchをProviderへ渡します。生成結果は保存するまでDraftになりません。" footer={<><Button variant="secondary" onClick={() => setGenerationOpen(false)}>閉じる</Button><Button disabled={busyId === 'generate' || !generateForm.accountId} icon={<Sparkles size={14} />} onClick={() => void generateCandidates()}>生成</Button></>}>
      <div className="form-grid form-grid--2">
        <SelectField label="運用アカウント" value={generateForm.accountId} onChange={(e) => setGenerateForm({ ...generateForm, accountId: e.target.value })}><option value="">選択してください</option>{accounts.map((a) => <option value={a.id} key={a.id}>{a.displayName} (@{a.handle})</option>)}</SelectField>
        <SelectField label="Target Action" value={generateForm.targetAction} onChange={(e) => setGenerateForm({ ...generateForm, targetAction: e.target.value as DraftTargetAction })}>{Object.entries(targetActionLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</SelectField>
        <SelectField label="Research Item" value={generateForm.researchItemId} onChange={(e) => setGenerateForm({ ...generateForm, researchItemId: e.target.value })}><option value="">Researchなし</option>{research.items.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</SelectField>
        <SelectField label="候補数" value={generateForm.count} onChange={(e) => setGenerateForm({ ...generateForm, count: Number(e.target.value) as 1 | 2 | 3 })}><option value={1}>1件</option><option value={2}>2件</option><option value={3}>3件</option></SelectField>
        <div className="form-grid__full"><TextAreaField label="追加指示" value={generateForm.instruction} onChange={(e) => setGenerateForm({ ...generateForm, instruction: e.target.value })} placeholder="例：売り込み感を避け、体験ベースの切り口で。" /></div>
      </div>
      <div className="candidate-list">{(generated?.candidates ?? []).map((candidate, index) => <article className="candidate-card" key={`${candidate.title}-${index}`}><div className="candidate-card__head"><div><span className="eyebrow">CANDIDATE {index + 1}</span><h3>{candidate.title || `候補 ${index + 1}`}</h3></div><span className={`duplicate-badge duplicate-badge--${candidate.duplicate.level}`}>類似 {candidate.duplicate.score}%</span></div>{candidate.hook ? <p className="candidate-card__hook">{candidate.hook}</p> : null}<p>{candidate.body}</p><div className="candidate-card__meta"><span>{targetActionLabel[candidate.targetAction]}</span><span>{candidate.angle}</span><span>{candidate.body.length}文字</span></div><Button size="sm" variant="secondary" disabled={busyId === `candidate-${index}`} onClick={() => void saveCandidate(candidate, index)}>Draftとして保存</Button></article>)}</div>
    </Modal>

    <Modal open={memoryOpen} onClose={() => setMemoryOpen(false)} title="Voice Memoryを追加" description="生成時に参照させたい具体的なルールだけを保存してください。" size="md" footer={<><Button variant="secondary" onClick={() => setMemoryOpen(false)}>キャンセル</Button><Button disabled={busyId === 'memory' || !memoryForm.accountId || !memoryForm.content.trim()} onClick={() => void createMemory()}>保存</Button></>}>
      <div className="form-grid"><SelectField label="運用アカウント" value={memoryForm.accountId} onChange={(e) => setMemoryForm({ ...memoryForm, accountId: e.target.value })}><option value="">選択してください</option>{accounts.map((a) => <option value={a.id} key={a.id}>{a.displayName}</option>)}</SelectField><SelectField label="種別" value={memoryForm.kind} onChange={(e) => setMemoryForm({ ...memoryForm, kind: e.target.value as VoiceMemoryKind })}>{Object.entries(memoryKindLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</SelectField><TextAreaField label="Memory内容" value={memoryForm.content} onChange={(e) => setMemoryForm({ ...memoryForm, content: e.target.value })} placeholder="例：冒頭で「解説します」は使わない。" /></div>
    </Modal>

    <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Version History" description="過去Versionとレビュー履歴を確認します。" size="lg" footer={<Button variant="secondary" onClick={() => setDetailOpen(false)}>閉じる</Button>}>
      {detail ? <div className="history-grid"><section><h3>Versions</h3><div className="history-list">{detail.versions.map((version) => <article key={version.id}><strong>v{version.versionNumber} · {version.source}</strong><small>{new Date(version.createdAt).toLocaleString('ja-JP')}{version.aiProvider ? ` · ${version.aiProvider}${version.aiModel ? ` / ${version.aiModel}` : ''}` : ''}</small>{version.hook ? <p className="history-hook">{version.hook}</p> : null}<p>{version.body}</p></article>)}</div></section><section><h3>Review Log</h3><div className="history-list">{detail.feedback.length === 0 ? <p className="history-empty">まだレビュー履歴はありません。</p> : detail.feedback.map((feedback) => <article key={feedback.id}><strong>{feedback.decision}</strong><small>{new Date(feedback.createdAt).toLocaleString('ja-JP')}{feedback.reasonCode ? ` · ${feedback.reasonCode}` : ''}</small>{feedback.comment ? <p>{feedback.comment}</p> : null}</article>)}</div></section></div> : null}
    </Modal>
  </>
}
