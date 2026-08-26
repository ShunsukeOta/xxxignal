import { ArrowRight, Check, CircleDollarSign, Link2Off, Plus, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { XAccount } from '../../shared/contracts'
import { api } from '../api'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { useSession } from '../components/SessionProvider'

const goalLabel: Record<XAccount['strategy']['primaryGoal'], string> = {
  growth: 'フォロワー成長',
  traffic: '外部流入',
  sales: '売上',
  brand: 'ブランド',
  community: 'コミュニティ',
}

export function DashboardPage() {
  const { session } = useSession()
  const [accounts, setAccounts] = useState<XAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadAccounts = () => {
    setLoading(true)
    setLoadError(null)
    api<XAccount[]>('/accounts')
      .then(setAccounts)
      .catch((error) => setLoadError(error instanceof Error ? error.message : 'アカウント情報を読み込めませんでした。'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadAccounts() }, [])

  if (!session) return null

  const foundationReady = accounts.length > 0

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CORE FOUNDATION</p>
          <h1>ダッシュボード</h1>
          <p>xxxignalの基盤と、3アカウント運用に向けた初期設定を管理します。</p>
        </div>
        <Link to="/accounts"><Button icon={<Plus size={16} />}>アカウントを追加</Button></Link>
      </div>

      <section className="stat-grid">
        <article className="stat-card">
          <div className="stat-card__top"><span>登録アカウント</span><Users size={18} /></div>
          <strong>{session.limits.activeAccountCount}<small> / {session.limits.accountLimit}</small></strong>
          <p>Phase 1の登録上限</p>
        </article>
        <article className="stat-card">
          <div className="stat-card__top"><span>X API接続</span><Link2Off size={18} /></div>
          <strong>未接続</strong>
          <p>Phase 4でOAuthを追加</p>
        </article>
        <article className="stat-card">
          <div className="stat-card__top"><span>APIコスト</span><CircleDollarSign size={18} /></div>
          <strong>¥0</strong>
          <p>Phase 1では外部APIを使用しません</p>
        </article>
        <article className="stat-card">
          <div className="stat-card__top"><span>開発フェーズ</span><span className="phase-dot">1</span></div>
          <strong>1 / 5</strong>
          <p>Core Foundation</p>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel__heading">
            <div><h2>アカウント</h2><p>戦略・Voiceを完全に分離して管理します。</p></div>
            <Link className="text-link" to="/accounts">すべて見る <ArrowRight size={14} /></Link>
          </div>

          {loading ? (
            <div className="card-skeletons"><div className="skeleton skeleton--card" /><div className="skeleton skeleton--card" /></div>
          ) : loadError ? (
            <EmptyState
              icon={<Users size={24} />}
              title="アカウント情報を取得できませんでした"
              description={loadError}
              action={<Button size="sm" variant="secondary" onClick={loadAccounts}>再試行</Button>}
            />
          ) : accounts.length === 0 ? (
            <EmptyState
              icon={<Users size={24} />}
              title="アカウントはまだありません"
              description="最初のXアカウントを登録し、Persona・戦略・Voice Profileを設定してください。"
              action={<Link to="/accounts"><Button size="sm">最初のアカウントを登録</Button></Link>}
            />
          ) : (
            <div className="account-summary-list">
              {accounts.slice(0, 3).map((account) => (
                <Link to={`/accounts?edit=${account.id}`} className="account-summary" key={account.id}>
                  <span className="avatar avatar--lg">{account.displayName.slice(0, 1).toUpperCase()}</span>
                  <span className="account-summary__main">
                    <strong>{account.displayName}</strong>
                    <small>@{account.handle}{account.niche ? ` · ${account.niche}` : ''}</small>
                  </span>
                  <span className="badge">{goalLabel[account.strategy.primaryGoal]}</span>
                  <ArrowRight size={16} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel__heading"><div><h2>Phase 1 完了条件</h2><p>後から作り直さない基盤を先に固定します。</p></div></div>
          <ul className="check-list">
            <li className="check-list__done"><Check size={16} /><span>マルチテナント対応DB構造</span></li>
            <li className="check-list__done"><Check size={16} /><span>ユーザー / Workspace境界</span></li>
            <li className={foundationReady ? 'check-list__done' : ''}><Check size={16} /><span>1件以上のXアカウント設定</span></li>
            <li className={accounts.length >= 3 ? 'check-list__done' : ''}><Check size={16} /><span>3アカウント運用準備</span></li>
          </ul>
          <div className="phase-note">
            <strong>次は Phase 2</strong>
            <p>公開Xプロフィール・Post表示、RSS / Web Source、Research PoolをX APIなしで追加します。</p>
          </div>
        </section>
      </div>
    </>
  )
}
