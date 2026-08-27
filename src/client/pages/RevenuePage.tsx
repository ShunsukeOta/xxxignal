import { CircleDollarSign, Clipboard, ExternalLink, Link2, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { RevenueOverview, XAccount } from '../../shared/contracts'
import { api } from '../api'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { SelectField, TextField } from '../components/Field'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'

export function RevenuePage() {
  const { showToast } = useToast()
  const [data, setData] = useState<RevenueOverview | null>(null)
  const [accounts, setAccounts] = useState<XAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [eventLinkId, setEventLinkId] = useState<string | null>(null)
  const [form, setForm] = useState({ accountId: '', label: '', destinationUrl: '' })
  const [eventForm, setEventForm] = useState({ kind: 'conversion', amount: '0', currency: 'JPY' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [overview, accountData] = await Promise.all([
        api<RevenueOverview>('/production/revenue'),
        api<XAccount[]>('/accounts'),
      ])
      setData(overview)
      setAccounts(accountData)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '収益データを読み込めませんでした。', 'error')
    } finally { setLoading(false) }
  }, [showToast])

  useEffect(() => { void load() }, [load])

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.displayName ?? 'Unknown'

  async function createLink() {
    setBusy('create')
    try {
      await api('/production/revenue/links', { method: 'POST', body: JSON.stringify(form) })
      showToast('Attribution Linkを作成しました')
      setCreateOpen(false)
      setForm({ accountId: '', label: '', destinationUrl: '' })
      await load()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Linkを作成できませんでした。', 'error')
    } finally { setBusy(null) }
  }

  async function recordEvent() {
    if (!eventLinkId) return
    setBusy('event')
    try {
      await api('/production/revenue/links/' + eventLinkId + '/event', {
        method: 'POST',
        body: JSON.stringify({
          kind: eventForm.kind,
          amount: eventForm.kind === 'revenue' ? Number(eventForm.amount) : 0,
          currency: eventForm.currency,
        }),
      })
      showToast(eventForm.kind === 'revenue' ? '売上を記録しました' : 'Conversionを記録しました')
      setEventLinkId(null)
      setEventForm({ kind: 'conversion', amount: '0', currency: 'JPY' })
      await load()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '成果を記録できませんでした。', 'error')
    } finally { setBusy(null) }
  }

  async function toggleLink(id: string, active: boolean) {
    setBusy(id)
    try {
      await api('/production/revenue/links/' + id, { method: 'PATCH', body: JSON.stringify({ active }) })
      await load()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Linkを更新できませんでした。', 'error')
    } finally { setBusy(null) }
  }

  async function copyTracking(key: string) {
    const url = window.location.origin + '/r/' + key
    try {
      await navigator.clipboard.writeText(url)
      showToast('Tracking URLをコピーしました')
    } catch {
      showToast('コピーできませんでした。ブラウザ権限を確認してください。', 'error')
    }
  }

  if (loading || !data) return <div className="card-skeletons"><div className="skeleton skeleton--card" /><div className="skeleton skeleton--card" /></div>

  const currencies = Object.entries(data.totalsByCurrency)

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">REVENUE ATTRIBUTION</p><h1>収益</h1><p>アカウント・導線ごとのClick / Conversion / Revenueを紐付けます。成果は手動入力にも対応します。</p></div>
      <Button icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>Tracking Link</Button>
    </div>

    <section className="stat-grid">
      <article className="stat-card"><div className="stat-card__top"><span>Tracking Links</span><Link2 size={18}/></div><strong>{data.links.length}</strong><p>{data.links.filter((x)=>x.active).length} active</p></article>
      <article className="stat-card"><div className="stat-card__top"><span>Clicks</span><ExternalLink size={18}/></div><strong>{data.totalClicks}</strong><p>Redirect経由</p></article>
      <article className="stat-card"><div className="stat-card__top"><span>Conversions</span><CircleDollarSign size={18}/></div><strong>{data.totalConversions}</strong><p>手動/将来連携</p></article>
      <article className="stat-card"><div className="stat-card__top"><span>Revenue</span><CircleDollarSign size={18}/></div><strong>{currencies.length ? currencies.map(([currency,amount]) => currency + ' ' + amount.toLocaleString()).join(' / ') : '-'}</strong><p>通貨別集計</p></article>
    </section>

    <section className="panel">
      <div className="panel__heading"><div><h2>Attribution Links</h2><p>ランダムTracking Keyを経由してClickを記録し、元URLへ302 Redirectします。</p></div></div>
      {data.links.length === 0 ? <EmptyState icon={<Link2 size={24}/>} title="Tracking Linkはありません" description="収益導線を登録するとClickから成果まで追跡できます。" /> :
        <div className="revenue-list">{data.links.map((link) => <article className="revenue-card" key={link.id}>
          <div className="revenue-card__head"><div><span>{accountName(link.accountId)}</span><h3>{link.label}</h3></div><span className={link.active ? 'production-status production-status--active' : 'production-status'}>{link.active ? 'active' : 'paused'}</span></div>
          <p>{link.destinationUrl}</p>
          <div className="revenue-metrics"><span><strong>{link.clicks}</strong> clicks</span><span><strong>{link.conversions}</strong> conversions</span><span><strong>{Object.entries(link.revenueByCurrency).map(([c,v])=>c+' '+v.toLocaleString()).join(' / ') || '-'}</strong> revenue</span></div>
          <div className="revenue-card__actions">
            <Button size="sm" variant="secondary" icon={<Clipboard size={13}/>} onClick={() => void copyTracking(link.trackingKey)}>URLコピー</Button>
            <Button size="sm" variant="secondary" onClick={() => { setEventLinkId(link.id); setEventForm({kind:'conversion',amount:'0',currency:'JPY'}) }}>成果記録</Button>
            <Button size="sm" variant="ghost" disabled={busy===link.id} onClick={() => void toggleLink(link.id,!link.active)}>{link.active ? '停止' : '再開'}</Button>
          </div>
        </article>)}</div>}
    </section>

    <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Tracking Linkを作成" description="遷移先URLはそのまま保持し、xxxignalの/r/{key}を経由してClickだけ記録します。" footer={<><Button variant="secondary" onClick={() => setCreateOpen(false)}>キャンセル</Button><Button disabled={busy==='create' || !form.accountId || !form.label || !form.destinationUrl} onClick={() => void createLink()}>作成</Button></>}>
      <div className="form-grid">
        <SelectField label="アカウント" value={form.accountId} onChange={(e)=>setForm({...form,accountId:e.target.value})}><option value="">選択</option>{accounts.map((a)=><option key={a.id} value={a.id}>{a.displayName} (@{a.handle})</option>)}</SelectField>
        <TextField label="ラベル" value={form.label} onChange={(e)=>setForm({...form,label:e.target.value})} placeholder="例：プロフィール固定リンク"/>
        <TextField label="遷移先URL" type="url" value={form.destinationUrl} onChange={(e)=>setForm({...form,destinationUrl:e.target.value})} placeholder="https://example.com/..."/>
      </div>
    </Modal>

    <Modal open={Boolean(eventLinkId)} onClose={() => setEventLinkId(null)} title="成果を記録" description="外部ASP/API連携前でも、ConversionとRevenueを手動で紐付けできます。" size="md" footer={<><Button variant="secondary" onClick={() => setEventLinkId(null)}>キャンセル</Button><Button disabled={busy==='event'} onClick={() => void recordEvent()}>記録</Button></>}>
      <div className="form-grid">
        <SelectField label="種別" value={eventForm.kind} onChange={(e)=>setEventForm({...eventForm,kind:e.target.value})}><option value="conversion">Conversion</option><option value="revenue">Revenue</option></SelectField>
        {eventForm.kind === 'revenue' ? <><TextField label="金額" type="number" min="0" step="1" value={eventForm.amount} onChange={(e)=>setEventForm({...eventForm,amount:e.target.value})}/><TextField label="通貨" value={eventForm.currency} onChange={(e)=>setEventForm({...eventForm,currency:e.target.value.toUpperCase().slice(0,8)})}/></> : null}
      </div>
    </Modal>
  </>
}
