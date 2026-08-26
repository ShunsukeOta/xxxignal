import {
  BarChart3,
  Bell,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  FlaskConical,
  Home,
  Menu,
  MessageSquareText,
  Search,
  Settings,
  Users,
  X,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useState } from 'react'
import { useSession } from './SessionProvider'

const items = [
  { to: '/', label: 'ダッシュボード', icon: Home, active: true },
  { to: '/accounts', label: 'アカウント', icon: Users, active: true },
  { to: '/research', label: 'リサーチ', icon: Search, active: false, phase: 2 },
  { to: '/drafts', label: '投稿案', icon: MessageSquareText, active: false, phase: 3 },
  { to: '/approvals', label: '承認待ち', icon: ClipboardCheck, active: false, phase: 3 },
  { to: '/calendar', label: 'カレンダー', icon: CalendarDays, active: false, phase: 3 },
  { to: '/analytics', label: '分析', icon: BarChart3, active: false, phase: 4 },
  { to: '/revenue', label: '収益', icon: CircleDollarSign, active: false, phase: 5 },
  { to: '/experiments', label: '実験', icon: FlaskConical, active: false, phase: 5 },
  { to: '/settings', label: '設定', icon: Settings, active: true },
]

export function AppShell() {
  const { session, loading, error, refresh } = useSession()
  const [mobileOpen, setMobileOpen] = useState(false)

  if (loading) {
    return (
      <div className="boot-screen">
        <div className="boot-screen__logo">xxxignal</div>
        <div className="skeleton skeleton--line" />
        <div className="skeleton skeleton--line skeleton--short" />
      </div>
    )
  }

  if (!session || error) {
    return (
      <div className="boot-screen boot-screen--error">
        <div className="boot-screen__logo">xxxignal</div>
        <h1>初期化できませんでした</h1>
        <p>{error ?? 'セッションを取得できませんでした。'}</p>
        <button className="ui-button ui-button--primary ui-button--md" type="button" onClick={() => void refresh()}>再試行</button>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar__brand-row">
          <NavLink className="brand" to="/" onClick={() => setMobileOpen(false)}>xxxignal</NavLink>
          <button type="button" className="icon-button sidebar__close" onClick={() => setMobileOpen(false)} aria-label="メニューを閉じる"><X size={20} /></button>
        </div>
        <nav className="sidebar__nav" aria-label="メインナビゲーション">
          {items.map((item) => {
            const Icon = item.icon
            if (!item.active) {
              return (
                <div className="sidebar__item sidebar__item--disabled" key={item.to} aria-disabled="true">
                  <Icon size={18} /><span>{item.label}</span><small>P{item.phase}</small>
                </div>
              )
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `sidebar__item ${isActive ? 'sidebar__item--active' : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                <Icon size={18} /><span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
        <div className="sidebar__meta">
          <span>Phase 1 / 5</span>
          <strong>{session.limits.activeAccountCount} / {session.limits.accountLimit} accounts</strong>
        </div>
      </aside>

      {mobileOpen ? <button type="button" className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="メニューを閉じる" /> : null}

      <div className="app-main">
        <header className="topbar">
          <button type="button" className="icon-button topbar__menu" onClick={() => setMobileOpen(true)} aria-label="メニューを開く"><Menu size={20} /></button>
          <div className="topbar__workspace">
            <span>{session.workspace.name}</span>
            <small>Personal workspace</small>
          </div>
          <div className="topbar__spacer" />
          <div className="topbar__phase">Phase 1</div>
          <button type="button" className="icon-button" aria-label="通知" disabled><Bell size={19} /></button>
          <div className="topbar__user" title={session.user.email}>
            <span className="avatar">{session.user.displayName.slice(0, 1).toUpperCase()}</span>
            <span>{session.user.displayName}</span>
          </div>
        </header>
        <main className="page"><Outlet /></main>
      </div>

      <nav className="bottom-nav" aria-label="モバイルナビゲーション">
        <NavLink to="/" end><Home size={20} /><span>ホーム</span></NavLink>
        <NavLink to="/accounts"><Users size={20} /><span>アカウント</span></NavLink>
        <span className="bottom-nav__disabled"><Search size={20} /><span>リサーチ</span></span>
        <span className="bottom-nav__disabled"><BarChart3 size={20} /><span>分析</span></span>
        <NavLink to="/settings"><Settings size={20} /><span>設定</span></NavLink>
      </nav>
    </div>
  )
}
