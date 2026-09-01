import { AlertTriangle, BarChart3, CircleDollarSign, ExternalLink, Link2, MessageSquareReply, RefreshCw, ShieldCheck, Unlink, Wallet } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { XAnalyticsOverview, XInboxStatus, XAccount, XBudgetSettings } from '../../shared/contracts'
import { api } from '../api'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { TextField } from '../components/Field'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'

type Tab = 'connections' | 'posts' | 'inbox' | 'cost'

export function AnalyticsPage() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<Tab>('connections')
  const [data, setData] = useState<XAnalyticsOverview | null>(null)
  const [accounts, setAccounts] = useState<XAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [budgetForm, setBudgetForm] = useState<XBudgetSettings>({ monthlyBudgetUsd: 5, warningPercent: 80, hardLimitEnabled: true })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [overview, accountData] = await Promise.all([api<XAnalyticsOverview>('/x/overview'), api<XAccount[]>('/accounts')])
      setData(overview); setAccounts(accountData); setBudgetForm(overview.budget)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'X Analyticsを読み込めませんでした。', 'error')
    } finally { setLoading(false) }
  }, [showToast])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('oauth') === 'connected') {
      showToast('Xアカウントを接続しました')
      history.replaceState(null, '', window.location.pathname)
    } else if (params.get('oauth') === 'cancelled') {
      showToast('X接続をキャンセルしました', 'error')
      history.replaceState(null, '', window.location.pathname)
    }
  }, [showToast])

  const connectionByAccount = useMemo(() => new Map((data?.connections ?? []).map((item) => [item.accountId, item])), [data?.connections])
  const accountName = (id: string) => accounts.find((account) => account.id === id)?.displayName ?? 'Unknown account'
  const healthByAccount = useMemo(() => new Map((data?.health ?? []).map((item) => [item.accountId, item])), [data?.health])

  async function connect(accountId: string) {
    setBusyId(accountId)
    try {
      const result = await api<{ authorizeUrl: string }>('/x/oauth/start', { method: 'POST', body: JSON.stringify({ accountId }) })
      window.location.assign(result.authorizeUrl)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'X接続を開始できませんでした。', 'error'); setBusyId(null)
    }
  }

  async function disconnect(accountId: string) {
    setBusyId(accountId)
    try {
      await api(`/x/connections/${accountId}/disconnect`, { method: 'POST' })
      showToast('xxxignal側のX接続情報を解除しました'); await load()
    } catch (error) { showToast(error instanceof Error ? error.message : '接続解除に失敗しました。', 'error') }
    finally { setBusyId(null) }
  }

  async function sync(kind: 'posts' | 'mentions', accountId: string, force = false) {
    const key = `${kind}:${accountId}`; setBusyId(key)
    try {
      const result = await api<{ returned: number; cached: boolean; estimatedCostUsd: number }>(`/x/sync/${kind}/${accountId}`, { method: 'POST', body: JSON.stringify({ limit: 20, force }) })
      showToast(result.cached ? `Cacheを使用しました（${result.returned}件 / API費用$0）` : `${result.returned}件同期 / 推定 $${result.estimatedCostUsd.toFixed(4)}`)
      await load()
    } catch (error) { showToast(error instanceof Error ? error.message : '同期に失敗しました。', 'error') }
    finally { setBusyId(null) }
  }

  async function updateInbox(id: string, status: XInboxStatus) {
    setBusyId(id)
    try { await api(`/x/inbox/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load() }
    catch (error) { showToast(error instanceof Error ? error.message : 'Inboxを更新できませんでした。', 'error') }
    finally { setBusyId(null) }
  }

  async function saveBudget() {
    setBusyId('budget')
    try {
      await api('/x/budget', { method: 'PATCH', body: JSON.stringify(budgetForm) })
      showToast('X API予算を更新しました'); setBudgetOpen(false); await load()
    } catch (error) { showToast(error instanceof Error ? error.message : '予算を更新できませんでした。', 'error') }
    finally { setBusyId(null) }
  }

  if (loading || !data) return <div className="card-skeletons"><div className="skeleton skeleton--card" /><div className="skeleton skeleton--card" /></div>

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">PHASE 4 · X OAUTH / ANALYTICS / COST</p><h1>X連携・分析</h1><p>公式OAuthだけを使い、必要な時だけ同期。API費用は実行前後でBudget GuardとLedgerへ記録します。</p></div>
      <Button variant="secondary" icon={<Wallet size={15} />} onClick={() => setBudgetOpen(true)}>予算設定</Button>
    </div>

    <section className="stat-grid analytics-stats">
      <article className="stat-card"><div className="stat-card__top"><span>接続済み</span><Link2 size={18} /></div><strong>{data.connections.filter((x) => x.status === 'connected').length}<small> / {accounts.length}</small></strong><p>OAuth User Context</p></article>
      <article className="stat-card"><div className="stat-card__top"><span>取得Posts</span><BarChart3 size={18} /></div><strong>{data.posts.length}</strong><p>最大100件表示</p></article>
      <article className="stat-card"><div className="stat-card__top"><span>Inbox</span><MessageSquareReply size={18} /></div><strong>{data.inbox.filter((x) => x.status === 'new').length}</strong><p>未確認Mention</p></article>
      <article className="stat-card"><div className="stat-card__top"><span>今月推定コスト</span><CircleDollarSign size={18} /></div><strong>$ {data.cost.spentUsd.toFixed(4)}</strong><p>$ {data.cost.budgetUsd.toFixed(2)} budget</p></article>
    </section>

    {!data.configured ? <div className="analytics-warning"><AlertTriangle size={18} /><div><strong>X OAuthが未設定です</strong><p>X_CLIENT_ID / X_REDIRECT_URI / X_TOKEN_ENCRYPTION_KEYをSecret・環境変数へ設定してください。Tokenを平文で保存するFallbackはありません。</p></div></div> : null}
    {data.cost.warning ? <div className="analytics-warning"><AlertTriangle size={18} /><div><strong>API予算の警告ラインに到達しています</strong><p>{data.cost.usagePercent.toFixed(1)}% 使用。Hard Limit到達後は新しい有料Readを実行前に停止します。</p></div></div> : null}

    <div className="analytics-tabs" role="tablist">
      {([['connections','接続・Health'],['posts','Post Analytics'],['inbox','Engagement Inbox'],['cost','Cost Ledger']] as const).map(([key,label]) => <button key={key} className={tab===key?'active':''} onClick={() => setTab(key)}>{label}</button>)}
    </div>

    {tab === 'connections' ? <section className="panel">
      <div className="panel__heading"><div><h2>3 Account OAuth</h2><p>登録handleとOAuthで認証した@usernameが一致する場合だけ接続します。</p></div></div>
      {accounts.length === 0 ? <EmptyState icon={<Link2 size={24} />} title="アカウントがありません" description="先に運用アカウントを登録してください。" /> :
        <div className="connection-list">{accounts.map((account) => {
          const connection = connectionByAccount.get(account.id); const health = healthByAccount.get(account.id)
          return <article className="connection-card" key={account.id}>
            <div className="connection-card__head"><div><strong>{account.displayName}</strong><small>@{account.handle}</small></div><span className={`health-badge health-badge--${health?.status ?? 'disconnected'}`}>{health?.status ?? 'disconnected'}</span></div>
            {connection ? <div className="connection-meta"><span>X ID {connection.xUserId}</span><span>scope: {connection.scopes.join(', ')}</span><span>token: {health?.tokenState}</span><span>last sync: {connection.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString('ja-JP') : '未同期'}</span></div> : <p className="connection-empty">まだX OAuth接続されていません。</p>}
            <div className="connection-card__actions">
              {!connection || connection.status === 'revoked' ? <Button size="sm" disabled={!data.configured || busyId===account.id} icon={<Link2 size={13} />} onClick={() => void connect(account.id)}>Xを接続</Button> : <>
                <Button size="sm" variant="secondary" disabled={busyId===`posts:${account.id}`} icon={<RefreshCw size={13} />} onClick={() => void sync('posts', account.id)}>Posts同期</Button>
                <Button size="sm" variant="secondary" disabled={busyId===`mentions:${account.id}`} icon={<MessageSquareReply size={13} />} onClick={() => void sync('mentions', account.id)}>Mentions同期</Button>
                <Button size="sm" variant="ghost" disabled={busyId===account.id} icon={<Unlink size={13} />} onClick={() => void disconnect(account.id)}>解除</Button>
              </>}
            </div>
          </article>
        })}</div>}
    </section> : null}

    {tab === 'posts' ? <section className="panel"><div className="panel__heading"><div><h2>Own Post Analytics</h2><p>保存済みSnapshotを表示。画面表示だけでX APIを再取得しません。</p></div></div>
      {data.posts.length === 0 ? <EmptyState icon={<BarChart3 size={24} />} title="Postデータがありません" description="接続済みアカウントでPosts同期を実行してください。" /> :
        <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Post</th><th>Account</th><th>Imp</th><th>Like</th><th>Reply</th><th>Repost</th><th>Profile</th><th>Link</th></tr></thead><tbody>{data.posts.map((post) => <tr key={post.id}><td><a href={`https://x.com/i/web/status/${post.xPostId}`} target="_blank" rel="noreferrer">{post.text.slice(0,90)} <ExternalLink size={11}/></a><small>{post.xCreatedAt ? new Date(post.xCreatedAt).toLocaleString('ja-JP') : '-'}</small></td><td>{accountName(post.accountId)}</td><td>{post.metrics.impressionCount}</td><td>{post.metrics.likeCount}</td><td>{post.metrics.replyCount}</td><td>{post.metrics.repostCount}</td><td>{post.metrics.userProfileClicks}</td><td>{post.metrics.urlLinkClicks}</td></tr>)}</tbody></table></div>}
    </section> : null}

    {tab === 'inbox' ? <section className="panel"><div className="panel__heading"><div><h2>Engagement候補Inbox</h2><p>自動Replyはしません。Mention候補を集約し、人間がX公式画面で対応します。</p></div></div>
      {data.inbox.length === 0 ? <EmptyState icon={<MessageSquareReply size={24} />} title="Inboxは空です" description="Mentions同期を手動実行すると候補が表示されます。" /> :
        <div className="inbox-list">{data.inbox.map((item) => <article className="inbox-item" key={item.id}><div><span>{accountName(item.accountId)} · {item.status}</span><p>{item.text}</p><small>{item.xCreatedAt ? new Date(item.xCreatedAt).toLocaleString('ja-JP') : '-'}</small></div><div className="inbox-item__actions"><a className="ui-button ui-button--secondary ui-button--sm" href={`https://x.com/i/web/status/${item.xPostId}`} target="_blank" rel="noreferrer">Xで開く</a>{item.status==='new'?<Button size="sm" variant="ghost" disabled={busyId===item.id} onClick={() => void updateInbox(item.id,'read')}>確認済み</Button>:null}<Button size="sm" variant="ghost" disabled={busyId===item.id} onClick={() => void updateInbox(item.id,'ignored')}>無視</Button></div></article>)}</div>}
    </section> : null}

    {tab === 'cost' ? <section className="panel"><div className="panel__heading"><div><h2>Cost Ledger</h2><p>Developer Consoleの実請求ではなく、取得resource数 × 公式単価スナップショットによる推定です。</p></div><Button size="sm" variant="secondary" onClick={() => setBudgetOpen(true)}>Budget</Button></div>
      <div className="budget-meter"><div><strong>$ {data.cost.spentUsd.toFixed(4)}</strong><span> / $ {data.cost.budgetUsd.toFixed(2)}</span></div><div className="budget-meter__track"><span style={{width:`${Math.min(100,data.cost.usagePercent)}%`}} /></div><small>Pricing snapshot: {data.cost.pricingVersion} · 残り $ {data.cost.remainingUsd.toFixed(4)}</small></div>
      {data.cost.entries.length === 0 ? <EmptyState icon={<CircleDollarSign size={24} />} title="Cost履歴はありません" description="X APIを実際に呼び出した時だけ記録されます。" /> :
        <div className="cost-list">{data.cost.entries.map((entry) => <div className="cost-row" key={entry.id}><div><strong>{entry.operation}</strong><small>{entry.endpoint} · {entry.units} {entry.resourceType}</small></div><span>$ {entry.estimatedCostUsd.toFixed(4)}</span></div>)}</div>}
    </section> : null}

    <Modal open={budgetOpen} onClose={() => setBudgetOpen(false)} title="X API Budget Guard" description="上限超過が予測される有料Readはリクエスト送信前に停止します。" size="md" footer={<><Button variant="secondary" onClick={() => setBudgetOpen(false)}>キャンセル</Button><Button disabled={busyId==='budget'} onClick={() => void saveBudget()}>保存</Button></>}>
      <div className="form-grid"><TextField label="月額上限 (USD)" type="number" min="0" step="0.5" value={String(budgetForm.monthlyBudgetUsd)} onChange={(e) => setBudgetForm({...budgetForm,monthlyBudgetUsd:Number(e.target.value)})}/><TextField label="警告 (%)" type="number" min="1" max="100" value={String(budgetForm.warningPercent)} onChange={(e) => setBudgetForm({...budgetForm,warningPercent:Number(e.target.value)})}/><label className="review-memory-toggle"><input type="checkbox" checked={budgetForm.hardLimitEnabled} onChange={(e)=>setBudgetForm({...budgetForm,hardLimitEnabled:e.target.checked})}/><span><strong>Hard Limitを有効化</strong><small>予測最大コストを含めて月額上限を超えるAPI実行を事前停止。</small></span></label><div className="analytics-budget-note"><ShieldCheck size={16}/><p>OAuth Token交換自体は課金Ledger対象外。/users/me、Posts、MentionsなどのX API resource取得だけを記録します。</p></div></div>
    </Modal>
  </>
}
