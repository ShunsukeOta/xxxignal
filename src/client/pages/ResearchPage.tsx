import { Archive, ExternalLink, Plus, RefreshCw, RotateCcw, Search, Target, Rss, Database, Eye } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ResearchItem, ResearchOverview, ResearchSource, ResearchTarget, XAccount } from '../../shared/contracts'
import { api } from '../api'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { SelectField, TextAreaField, TextField } from '../components/Field'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { XPostViewer, XProfileViewer } from '../components/XEmbed'

type Tab = 'pool' | 'sources' | 'targets' | 'viewer' | 'archive'
const roleLabel = { competitor: '競合', target: 'ターゲット', reference: '参考' } as const
const kindLabel = { rss: 'RSS', web: 'Web', x_post: 'X Post', manual: 'Manual' } as const

export function ResearchPage() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<Tab>('pool')
  const [overview, setOverview] = useState<ResearchOverview>({ sources: [], targets: [], items: [] })
  const [archived, setArchived] = useState<ResearchOverview>({ sources: [], targets: [], items: [] })
  const [accounts, setAccounts] = useState<XAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sourceOpen, setSourceOpen] = useState(false)
  const [targetOpen, setTargetOpen] = useState(false)
  const [itemOpen, setItemOpen] = useState(false)
  const [viewerHandle, setViewerHandle] = useState('')
  const [viewerPost, setViewerPost] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ type: 'source' | 'target' | 'item'; id: string; label: string } | null>(null)
  const [sourceForm, setSourceForm] = useState({ name: '', kind: 'rss' as 'rss' | 'web' | 'manual', url: '', notes: '' })
  const [targetForm, setTargetForm] = useState({ handle: '', displayName: '', role: 'competitor' as 'competitor' | 'target' | 'reference', notes: '' })
  const [itemForm, setItemForm] = useState({ title: '', url: '', summary: '', topic: '', kind: 'manual' as 'manual' | 'web' | 'x_post', accountId: '' })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [data, archivedData, accountData] = await Promise.all([
        api<ResearchOverview>('/research/overview'),
        api<ResearchOverview>('/research/archived'),
        api<XAccount[]>('/accounts'),
      ])
      setOverview(data); setArchived(archivedData); setAccounts(accountData)
    } catch (e) { setError(e instanceof Error ? e.message : 'Research情報を取得できませんでした。') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return overview.items
    return overview.items.filter((item) => [item.title, item.summary, item.topic, item.url].join(' ').toLowerCase().includes(q))
  }, [overview.items, query])

  async function createSource() {
    await api('/research/sources', { method: 'POST', body: JSON.stringify(sourceForm) })
    setSourceOpen(false); setSourceForm({ name: '', kind: 'rss', url: '', notes: '' }); showToast('Sourceを登録しました'); await load()
  }
  async function createTarget() {
    await api('/research/targets', { method: 'POST', body: JSON.stringify(targetForm) })
    setTargetOpen(false); setTargetForm({ handle: '', displayName: '', role: 'competitor', notes: '' }); showToast('Xアカウントを登録しました'); await load()
  }
  async function createItem() {
    await api('/research/items', { method: 'POST', body: JSON.stringify({ ...itemForm, accountId: itemForm.accountId || null }) })
    setItemOpen(false); setItemForm({ title: '', url: '', summary: '', topic: '', kind: 'manual', accountId: '' }); showToast('Research Itemを保存しました'); await load()
  }
  async function syncSource(source: ResearchSource) {
    setBusyId(source.id)
    try {
      const result = await api<{ fetched: number; inserted: number }>(`/research/sources/${source.id}/sync`, { method: 'POST' })
      showToast(`${result.inserted}件追加 / ${result.fetched}件取得`); await load()
    } catch (e) { showToast(e instanceof Error ? e.message : '同期に失敗しました', 'error') }
    finally { setBusyId(null) }
  }
  async function archiveEntity() {
    if (!confirm) return
    setBusyId(confirm.id)
    try { await api(`/research/${confirm.type}s/${confirm.id}/archive`, { method: 'POST' }); setConfirm(null); showToast('アーカイブしました'); await load() }
    finally { setBusyId(null) }
  }
  async function restore(type: 'source' | 'target' | 'item', id: string) {
    setBusyId(id)
    try { await api(`/research/${type}s/${id}/restore`, { method: 'POST' }); showToast('復元しました'); await load() }
    finally { setBusyId(null) }
  }

  if (loading) return <div className="card-skeletons"><div className="skeleton skeleton--card"/><div className="skeleton skeleton--card"/></div>

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">RESEARCH & X VIEWER</p><h1>リサーチ</h1><p>X APIを使わず、公開情報・RSS・手動URLをResearch Poolへ集約します。</p></div>
      <Button icon={<Plus size={16}/>} onClick={() => setItemOpen(true)}>Research Itemを追加</Button>
    </div>

    <section className="research-stats stat-grid">
      <article className="stat-card"><div className="stat-card__top"><span>Research Items</span><Database size={18}/></div><strong>{overview.items.length}</strong><p>保存済みの調査材料</p></article>
      <article className="stat-card"><div className="stat-card__top"><span>Sources</span><Rss size={18}/></div><strong>{overview.sources.length}</strong><p>RSS / Web / Manual</p></article>
      <article className="stat-card"><div className="stat-card__top"><span>Targets</span><Target size={18}/></div><strong>{overview.targets.length}</strong><p>競合・ターゲット・参考</p></article>
      <article className="stat-card"><div className="stat-card__top"><span>X API Cost</span><span className="phase-dot">0</span></div><strong>¥0</strong><p>Phase 2ではX API未使用</p></article>
    </section>

    <div className="research-tabs" role="tablist">
      {([['pool','Research Pool'],['sources','Sources'],['targets','X Targets'],['viewer','X Viewer'],['archive','Archive']] as const).map(([key,label]) => <button key={key} className={tab===key?'active':''} onClick={() => setTab(key)}>{label}</button>)}
    </div>

    {error ? <EmptyState icon={<Search size={24}/>} title="Research情報を取得できませんでした" description={error} action={<Button variant="secondary" onClick={() => void load()}>再試行</Button>}/> : null}

    {!error && tab === 'pool' && <section className="panel">
      <div className="panel__heading"><div><h2>Shared Research Pool</h2><p>全アカウント共通の調査材料。必要なら運用アカウントへ紐付けます。</p></div><div className="research-search"><Search size={15}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="タイトル・Topic・本文を検索"/></div></div>
      {filteredItems.length === 0 ? <EmptyState icon={<Database size={24}/>} title="Research Itemがありません" description="RSS同期または手動登録から始めてください。"/> : <div className="research-list">{filteredItems.map((item) => <ResearchItemRow key={item.id} item={item} accounts={accounts} onArchive={() => setConfirm({ type:'item', id:item.id, label:item.title })}/>)}</div>}
    </section>}

    {!error && tab === 'sources' && <section className="panel"><div className="panel__heading"><div><h2>Sources</h2><p>外部情報源を登録。RSSだけはサーバーから手動同期できます。</p></div><Button size="sm" icon={<Plus size={14}/>} onClick={()=>setSourceOpen(true)}>Source追加</Button></div>{overview.sources.length===0?<EmptyState icon={<Rss size={24}/>} title="Sourceがありません" description="RSS・Webページ・手動参照元を登録してください。"/>:<div className="research-list">{overview.sources.map((source)=><div className="research-row" key={source.id}><div className="research-row__main"><strong>{source.name}</strong><a href={source.url} target="_blank" rel="noreferrer">{source.url} <ExternalLink size={12}/></a><small>{source.kind.toUpperCase()}{source.lastSyncedAt?` · 最終同期 ${new Date(source.lastSyncedAt).toLocaleString('ja-JP')}`:''}</small></div><div className="research-row__actions">{source.kind==='rss'&&<Button size="sm" variant="secondary" disabled={busyId===source.id} icon={<RefreshCw size={13}/>} onClick={()=>void syncSource(source)}>同期</Button>}<Button size="sm" variant="ghost" icon={<Archive size={13}/>} onClick={()=>setConfirm({type:'source',id:source.id,label:source.name})}>Archive</Button></div></div>)}</div>}</section>}

    {!error && tab === 'targets' && <section className="panel"><div className="panel__heading"><div><h2>X Targets</h2><p>公開プロフィールを調査対象として登録します。</p></div><Button size="sm" icon={<Plus size={14}/>} onClick={()=>setTargetOpen(true)}>Target追加</Button></div>{overview.targets.length===0?<EmptyState icon={<Target size={24}/>} title="Targetがありません" description="競合・関係構築候補・参考アカウントを登録してください。"/>:<div className="research-list">{overview.targets.map((target)=><div className="research-row" key={target.id}><div className="research-row__main"><strong>{target.displayName||`@${target.handle}`}</strong><a href={`https://x.com/${target.handle}`} target="_blank" rel="noreferrer">@{target.handle} <ExternalLink size={12}/></a><small>{roleLabel[target.role]}{target.notes?` · ${target.notes}`:''}</small></div><div className="research-row__actions"><Button size="sm" variant="secondary" icon={<Eye size={13}/>} onClick={()=>{setViewerHandle(target.handle);setTab('viewer')}}>Viewer</Button><Button size="sm" variant="ghost" icon={<Archive size={13}/>} onClick={()=>setConfirm({type:'target',id:target.id,label:`@${target.handle}`})}>Archive</Button></div></div>)}</div>}</section>}

    {!error && tab === 'viewer' && <div className="viewer-grid"><section className="panel"><div className="panel__heading"><div><h2>公開プロフィール Viewer</h2><p>X公式Widgetsを利用。ログイン情報・Cookieはxxxignalへ渡しません。</p></div></div><div className="viewer-controls"><TextField label="Xユーザー名" value={viewerHandle} onChange={(e)=>setViewerHandle(e.target.value.replace(/^@/,''))} placeholder="example"/></div>{viewerHandle?<XProfileViewer handle={viewerHandle}/>:<EmptyState icon={<Eye size={24}/>} title="ユーザー名を入力してください" description="公開プロフィール/TimelineをX公式Widgetで表示します。"/>}</section><section className="panel"><div className="panel__heading"><div><h2>公開Post Viewer</h2><p>Post URLを貼るとX公式Embedで確認できます。</p></div></div><div className="viewer-controls"><TextField label="X Post URL" value={viewerPost} onChange={(e)=>setViewerPost(e.target.value)} placeholder="https://x.com/.../status/..."/></div>{viewerPost?<XPostViewer url={viewerPost}/>:<EmptyState icon={<Eye size={24}/>} title="Post URLを入力してください" description="公開Postだけを表示対象にします。"/>}</section></div>}

    {!error && tab === 'archive' && <section className="panel"><div className="panel__heading"><div><h2>Archive</h2><p>削除せず保管したResearchデータを復元できます。</p></div></div>{archived.sources.length+archived.targets.length+archived.items.length===0?<EmptyState icon={<Archive size={24}/>} title="Archiveは空です" description="アーカイブしたデータがここに表示されます。"/>:<div className="research-list">{archived.sources.map(x=><ArchiveRow key={x.id} label={`Source · ${x.name}`} busy={busyId===x.id} onRestore={()=>void restore('source',x.id)}/>)}{archived.targets.map(x=><ArchiveRow key={x.id} label={`Target · @${x.handle}`} busy={busyId===x.id} onRestore={()=>void restore('target',x.id)}/>)}{archived.items.map(x=><ArchiveRow key={x.id} label={`Item · ${x.title}`} busy={busyId===x.id} onRestore={()=>void restore('item',x.id)}/>)}</div>}</section>}

    <Modal open={sourceOpen} onClose={()=>setSourceOpen(false)} title="Sourceを追加" description="RSS / Web / Manual参照元を登録します。" size="md" footer={<><Button variant="secondary" onClick={()=>setSourceOpen(false)}>キャンセル</Button><Button onClick={()=>void createSource()}>登録</Button></>}><div className="form-grid"><TextField label="Source名" required value={sourceForm.name} onChange={(e)=>setSourceForm({...sourceForm,name:e.target.value})}/><SelectField label="種別" value={sourceForm.kind} onChange={(e)=>setSourceForm({...sourceForm,kind:e.target.value as typeof sourceForm.kind})}><option value="rss">RSS / Atom</option><option value="web">Web</option><option value="manual">Manual</option></SelectField><TextField label="URL" required type="url" value={sourceForm.url} onChange={(e)=>setSourceForm({...sourceForm,url:e.target.value})}/><TextAreaField label="メモ" value={sourceForm.notes} onChange={(e)=>setSourceForm({...sourceForm,notes:e.target.value})}/></div></Modal>
    <Modal open={targetOpen} onClose={()=>setTargetOpen(false)} title="X Targetを追加" size="md" footer={<><Button variant="secondary" onClick={()=>setTargetOpen(false)}>キャンセル</Button><Button onClick={()=>void createTarget()}>登録</Button></>}><div className="form-grid"><TextField label="Xユーザー名" required value={targetForm.handle} onChange={(e)=>setTargetForm({...targetForm,handle:e.target.value})} placeholder="@なし"/><TextField label="表示名" value={targetForm.displayName} onChange={(e)=>setTargetForm({...targetForm,displayName:e.target.value})}/><SelectField label="役割" value={targetForm.role} onChange={(e)=>setTargetForm({...targetForm,role:e.target.value as typeof targetForm.role})}><option value="competitor">競合</option><option value="target">ターゲット</option><option value="reference">参考</option></SelectField><TextAreaField label="メモ" value={targetForm.notes} onChange={(e)=>setTargetForm({...targetForm,notes:e.target.value})}/></div></Modal>
    <Modal open={itemOpen} onClose={()=>setItemOpen(false)} title="Research Itemを追加" size="md" footer={<><Button variant="secondary" onClick={()=>setItemOpen(false)}>キャンセル</Button><Button onClick={()=>void createItem()}>保存</Button></>}><div className="form-grid"><TextField label="タイトル" required value={itemForm.title} onChange={(e)=>setItemForm({...itemForm,title:e.target.value})}/><SelectField label="種別" value={itemForm.kind} onChange={(e)=>setItemForm({...itemForm,kind:e.target.value as typeof itemForm.kind})}><option value="manual">Manual</option><option value="web">Web</option><option value="x_post">X Post</option></SelectField><TextField label="URL" type="url" value={itemForm.url} onChange={(e)=>setItemForm({...itemForm,url:e.target.value})}/><TextField label="Topic" value={itemForm.topic} onChange={(e)=>setItemForm({...itemForm,topic:e.target.value})}/><SelectField label="運用アカウント" value={itemForm.accountId} onChange={(e)=>setItemForm({...itemForm,accountId:e.target.value})}><option value="">共通Pool</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.displayName} (@{a.handle})</option>)}</SelectField><TextAreaField label="メモ / 要約" value={itemForm.summary} onChange={(e)=>setItemForm({...itemForm,summary:e.target.value})}/></div></Modal>
    <Modal open={Boolean(confirm)} onClose={()=>setConfirm(null)} title="アーカイブしますか？" description={confirm?.label} size="md" footer={<><Button variant="secondary" onClick={()=>setConfirm(null)}>キャンセル</Button><Button variant="danger" disabled={busyId===confirm?.id} onClick={()=>void archiveEntity()}>アーカイブ</Button></>}><p>データは削除されません。Archiveタブからいつでも復元できます。</p></Modal>
  </>
}

function ResearchItemRow({ item, accounts, onArchive }: { item: ResearchItem; accounts: XAccount[]; onArchive: () => void }) {
  const account = accounts.find((a)=>a.id===item.accountId)
  return <div className="research-row"><div className="research-row__main"><strong>{item.title}</strong>{item.url?<a href={item.url} target="_blank" rel="noreferrer">{item.url} <ExternalLink size={12}/></a>:null}<small>{kindLabel[item.kind]}{item.topic?` · ${item.topic}`:''}{account?` · ${account.displayName}`:' · 共通Pool'}</small>{item.summary?<p>{item.summary}</p>:null}</div><div className="research-row__actions"><Button size="sm" variant="ghost" icon={<Archive size={13}/>} onClick={onArchive}>Archive</Button></div></div>
}
function ArchiveRow({ label, busy, onRestore }: { label: string; busy: boolean; onRestore: () => void }) { return <div className="research-row"><div className="research-row__main"><strong>{label}</strong></div><Button size="sm" variant="secondary" disabled={busy} icon={<RotateCcw size={13}/>} onClick={onRestore}>復元</Button></div> }
