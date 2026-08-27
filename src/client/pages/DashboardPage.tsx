import { ArrowRight, Check, ClipboardCheck, Database, Edit3, Plus, Send, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ContentOverview, OperationsOverview, ResearchOverview, RevenueOverview, XAccount, XAnalyticsOverview } from '../../shared/contracts'
import { api } from '../api'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { useSession } from '../components/SessionProvider'

export function DashboardPage() {
  const { session } = useSession()
  const [accounts, setAccounts] = useState<XAccount[]>([])
  const [research, setResearch] = useState<ResearchOverview>({ sources: [], targets: [], items: [] })
  const [content, setContent] = useState<ContentOverview>({ drafts: [], archivedDrafts: [], voiceMemories: [] })
  const [xOverview, setXOverview] = useState<XAnalyticsOverview | null>(null)
  const [operations, setOperations] = useState<OperationsOverview | null>(null)
  const [revenue, setRevenue] = useState<RevenueOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api<XAccount[]>('/accounts'),
      api<ResearchOverview>('/research/overview'),
      api<ContentOverview>('/content/overview'),
      api<XAnalyticsOverview>('/x/overview'),
      api<OperationsOverview>('/production/overview'),
      api<RevenueOverview>('/production/revenue'),
    ])
      .then(([accountData, researchData, contentData, xData, operationsData, revenueData]) => {
        setAccounts(accountData)
        setResearch(researchData)
        setContent(contentData)
        setXOverview(xData)
        setOperations(operationsData)
        setRevenue(revenueData)
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'ダッシュボードを読み込めませんでした。'))
      .finally(() => setLoading(false))
  }, [])

  if (!session) return null

  const reviewCount = content.drafts.filter((draft) => draft.status === 'review').length
  const approvedCount = content.drafts.filter((draft) => draft.status === 'approved').length

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">PHASE 5 · PRODUCTION MVP</p><h1>ダッシュボード</h1><p>3アカウントの制作・承認・予定・学習・収益・APIコストを一つの運用OSで確認します。</p></div>
        <Link to="/drafts"><Button icon={<Plus size={16} />}>投稿案を作る</Button></Link>
      </div>

      <section className="stat-grid">
        <article className="stat-card"><div className="stat-card__top"><span>登録アカウント</span><Users size={18} /></div><strong>{session.limits.activeAccountCount}<small> / {session.limits.accountLimit}</small></strong><p>個人MVPの登録上限</p></article>
        <article className="stat-card"><div className="stat-card__top"><span>Research Items</span><Database size={18} /></div><strong>{research.items.length}</strong><p>{research.sources.length} Sources / {research.targets.length} Targets</p></article>
        <article className="stat-card"><div className="stat-card__top"><span>Drafts</span><Edit3 size={18} /></div><strong>{content.drafts.length}</strong><p>{reviewCount}件が承認待ち</p></article>
        <article className="stat-card"><div className="stat-card__top"><span>今日以降の予定</span><Send size={18} /></div><strong>{operations?.calendar.filter((x) => x.status === 'planned' && Date.parse(x.scheduledFor) >= Date.now() - 86400000).length ?? 0}</strong><p>{operations?.opportunities.filter((x) => !['done','dismissed'].includes(x.status)).length ?? 0} opportunities</p></article>
      </section>

      {error ? <EmptyState icon={<Edit3 size={24} />} title="ダッシュボードを読み込めませんでした" description={error} /> : null}

      {!error ? (
        <div className="dashboard-grid">
          <section className="panel">
            <div className="panel__heading"><div><h2>次にやること</h2><p>運用の詰まりを優先順位順に表示します。</p></div></div>
            {loading ? <div className="card-skeletons"><div className="skeleton skeleton--card" /></div> : (
              <div className="dashboard-action-list">
                <Link to="/approvals" className="dashboard-action"><span className="dashboard-action__icon"><ClipboardCheck size={18} /></span><span><strong>承認待ちを確認</strong><small>{reviewCount ? `${reviewCount}件のHuman Reviewが必要です` : '現在の承認待ちはありません'}</small></span><ArrowRight size={16} /></Link>
                <Link to="/calendar" className="dashboard-action"><span className="dashboard-action__icon"><Send size={18} /></span><span><strong>承認済みを投稿</strong><small>{approvedCount ? `${approvedCount}件が投稿可能です` : '投稿待ちはありません'}</small></span><ArrowRight size={16} /></Link>
                <Link to="/operations" className="dashboard-action"><span className="dashboard-action__icon"><Send size={18} /></span><span><strong>今日の運用を確認</strong><small>{operations ? String(operations.calendar.filter((x) => x.status === 'planned').length) + '件の予定 / ' + String(operations.duplicateIssues.length + operations.engagementIssues.length) + ' guard' : '運用キューを読み込み中'}</small></span><ArrowRight size={16} /></Link>\n                <Link to="/analytics" className="dashboard-action"><span className="dashboard-action__icon"><Send size={18} /></span><span><strong>X連携・Metricsを確認</strong><small>{xOverview ? `${xOverview.cost.spentUsd.toFixed(4)} / ${xOverview.cost.budgetUsd.toFixed(2)} budget` : 'X APIは未設定でも利用可能です'}</small></span><ArrowRight size={16} /></Link>
                <Link to="/research" className="dashboard-action"><span className="dashboard-action__icon"><Database size={18} /></span><span><strong>Researchを追加</strong><small>{research.items.length}件の材料を保存中</small></span><ArrowRight size={16} /></Link>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel__heading"><div><h2>Production MVP</h2><p>Phase 1〜5を一つの日常運用フローへ統合しました。</p></div></div>
            <ul className="check-list">
              <li className="check-list__done"><Check size={16} /><span>AI Provider Adapter</span></li>
              <li className="check-list__done"><Check size={16} /><span>Draft Versioning</span></li>
              <li className="check-list__done"><Check size={16} /><span>Duplicate Guard</span></li>
              <li className="check-list__done"><Check size={16} /><span>Human Approve / Reject</span></li>
              <li className="check-list__done"><Check size={16} /><span>Reject → Voice Memory</span></li>
              <li className="check-list__done"><Check size={16} /><span>Manual Publish Assist</span></li>
              <li className="check-list__done"><Check size={16} /><span>OAuth 2.0 PKCE / Token暗号化</span></li>
              <li className="check-list__done"><Check size={16} /><span>Metrics / Mentions / API Cache</span></li>
              <li className="check-list__done"><Check size={16} /><span>Cost Ledger / Budget Guard</span></li>
              <li className="check-list__done"><Check size={16} /><span>Opportunity / Calendar / Weekly Learning</span></li>
              <li className="check-list__done"><Check size={16} /><span>Cross-account Guard / Revenue Attribution</span></li>
              <li className="check-list__done"><Check size={16} /><span>Secret-safe Export / Backup</span></li>
            </ul>
            <div className="phase-note"><strong>5 / 5 Phase 完了</strong><p>次の開発は新Phaseではなく、実運用データを見ながら必要な改善だけを積み上げます。X API推定Cost: $ {xOverview?.cost.spentUsd.toFixed(4) ?? '0.0000'} / Revenue: {revenue ? Object.entries(revenue.totalsByCurrency).map(([c,v]) => c + ' ' + v.toLocaleString()).join(' / ') || '-' : '-'}</p></div>
          </section>
        </div>
      ) : null}

      {!error && accounts.length > 0 ? (
        <section className="panel dashboard-accounts-panel">
          <div className="panel__heading"><div><h2>運用アカウント</h2><p>Strategy / Voice / Memoryを完全に分離しています。</p></div><Link className="text-link" to="/accounts">すべて見る <ArrowRight size={14} /></Link></div>
          <div className="account-summary-list">{accounts.slice(0, 3).map((account) => <Link to={`/accounts?edit=${account.id}`} className="account-summary" key={account.id}><span className="avatar avatar--lg">{account.displayName.slice(0, 1).toUpperCase()}</span><span className="account-summary__main"><strong>{account.displayName}</strong><small>@{account.handle} · {content.voiceMemories.filter((memory) => memory.accountId === account.id).length} memories</small></span><ArrowRight size={16} /></Link>)}</div>
        </section>
      ) : null}
    </>
  )
}
