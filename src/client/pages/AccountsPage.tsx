import { Archive, ExternalLink, Pencil, Plus, RotateCcw, UserRoundPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AccountInput, XAccount } from '../../shared/contracts'
import { api, ApiError } from '../api'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { SelectField, TextAreaField, TextField } from '../components/Field'
import { Modal } from '../components/Modal'
import { useSession } from '../components/SessionProvider'
import { TagInput } from '../components/TagInput'
import { useToast } from '../components/Toast'

const emptyInput = (): AccountInput => ({
  handle: '',
  displayName: '',
  niche: '',
  targetAudience: '',
  purpose: '',
  monetizationGoal: '',
  timezone: 'Asia/Tokyo',
  notes: '',
  status: 'draft',
  strategy: {
    primaryGoal: 'growth',
    contentPillars: [],
    forbiddenTopics: [],
    postingTargetPerDay: 1,
    monetizationType: 'none',
    funnelNotes: '',
    strategyMemo: '',
  },
  voice: {
    toneKeywords: [],
    sentenceStyle: 'mixed',
    politeness: 'neutral',
    emojiUsage: 'low',
    assertiveness: 'balanced',
    preferredPhrases: [],
    bannedPhrases: [],
    samplePosts: '',
  },
})

const toInput = (account: XAccount): AccountInput => ({
  handle: account.handle,
  displayName: account.displayName,
  niche: account.niche,
  targetAudience: account.targetAudience,
  purpose: account.purpose,
  monetizationGoal: account.monetizationGoal,
  timezone: account.timezone,
  notes: account.notes,
  status: account.status,
  strategy: { ...account.strategy },
  voice: { ...account.voice },
})

const statusLabel = { draft: '準備中', active: '運用中', paused: '停止中' } as const
const primaryGoalLabel = { growth: 'フォロワー成長', traffic: '外部流入', sales: '売上', brand: 'ブランド', community: 'コミュニティ' } as const

export function AccountsPage() {
  const { session, refresh: refreshSession } = useSession()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [accounts, setAccounts] = useState<XAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AccountInput>(emptyInput)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState<XAccount | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setAccounts(await api<XAccount[]>(`/accounts${showArchived ? '?archived=all' : ''}`))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'アカウント情報を読み込めませんでした。')
    } finally {
      setLoading(false)
    }
  }, [showArchived])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const edit = searchParams.get('edit')
    if (!edit || accounts.length === 0) return
    const target = accounts.find((account) => account.id === edit)
    if (!target) return
    setEditingId(target.id)
    setForm(toInput(target))
    setFormOpen(true)
    setSearchParams({}, { replace: true })
  }, [accounts, searchParams, setSearchParams])

  const activeCount = useMemo(() => accounts.filter((account) => !account.archivedAt).length, [accounts])
  const canAdd = Boolean(session && activeCount < session.limits.accountLimit)

  const openCreate = () => {
    setEditingId(null)
    setFields({})
    setForm(emptyInput())
    setFormOpen(true)
  }

  const openEdit = (account: XAccount) => {
    setEditingId(account.id)
    setFields({})
    setForm(toInput(account))
    setFormOpen(true)
  }

  const closeForm = () => {
    if (saving) return
    setFormOpen(false)
    setEditingId(null)
    setFields({})
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setFields({})
    try {
      if (editingId) {
        await api<XAccount>(`/accounts/${editingId}`, { method: 'PATCH', body: JSON.stringify(form) })
        showToast('アカウント設定を保存しました。')
      } else {
        await api<XAccount>('/accounts', { method: 'POST', body: JSON.stringify(form) })
        showToast('アカウントを登録しました。')
      }
      setFormOpen(false)
      setEditingId(null)
      setFields({})
      await Promise.all([load(), refreshSession()])
    } catch (error) {
      if (error instanceof ApiError) {
        setFields(error.fields ?? {})
        showToast(error.message, 'error')
      } else {
        showToast('保存に失敗しました。', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    if (!confirmArchive) return
    try {
      await api(`/accounts/${confirmArchive.id}/archive`, { method: 'POST' })
      showToast('アカウントをアーカイブしました。')
      setConfirmArchive(null)
      await Promise.all([load(), refreshSession()])
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'アーカイブに失敗しました。', 'error')
    }
  }

  const restore = async (account: XAccount) => {
    try {
      await api(`/accounts/${account.id}/restore`, { method: 'POST' })
      showToast('アカウントを復元しました。')
      await Promise.all([load(), refreshSession()])
    } catch (error) {
      showToast(error instanceof Error ? error.message : '復元に失敗しました。', 'error')
    }
  }

  if (!session) return null

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACCOUNT HUB</p>
          <h1>アカウント</h1>
          <p>各アカウントのPersona・戦略・Voiceを独立して管理します。</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={openCreate} disabled={!canAdd}>アカウントを追加</Button>
      </div>

      <div className="toolbar">
        <div className="toolbar__count"><strong>{activeCount}</strong> / {session.limits.accountLimit} アカウント</div>
        <label className="toggle-row">
          <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
          <span>アーカイブ済みも表示</span>
        </label>
      </div>

      {loading ? (
        <div className="account-grid"><div className="skeleton skeleton--card" /><div className="skeleton skeleton--card" /></div>
      ) : loadError ? (
        <section className="panel">
          <EmptyState
            icon={<Users size={26} />}
            title="アカウント情報を取得できませんでした"
            description={loadError}
            action={<Button variant="secondary" onClick={() => void load()}>再試行</Button>}
          />
        </section>
      ) : accounts.length === 0 ? (
        <section className="panel">
          <EmptyState
            icon={<UserRoundPlus size={26} />}
            title="Xアカウントを登録してください"
            description="X APIへのログインはまだ行いません。ここでは運用対象の基本情報・戦略・Voice Profileだけを登録します。"
            action={<Button onClick={openCreate}>最初のアカウントを登録</Button>}
          />
        </section>
      ) : (
        <div className="account-grid">
          {accounts.map((account) => (
            <article className={`account-card ${account.archivedAt ? 'account-card--archived' : ''}`} key={account.id}>
              <div className="account-card__top">
                <span className="avatar avatar--lg">{account.displayName.slice(0, 1).toUpperCase()}</span>
                <div className="account-card__identity">
                  <strong>{account.displayName}</strong>
                  <a href={`https://x.com/${account.handle}`} target="_blank" rel="noopener noreferrer">@{account.handle} <ExternalLink size={12} /></a>
                </div>
                <span className={`status-badge status-badge--${account.archivedAt ? 'archived' : account.status}`}>
                  {account.archivedAt ? 'アーカイブ' : statusLabel[account.status]}
                </span>
              </div>
              <dl className="account-card__details">
                <div><dt>ジャンル</dt><dd>{account.niche || '未設定'}</dd></div>
                <div><dt>主目的</dt><dd>{primaryGoalLabel[account.strategy.primaryGoal]}</dd></div>
                <div><dt>投稿目標</dt><dd>{account.strategy.postingTargetPerDay} / 日</dd></div>
              </dl>
              <div className="chip-row">
                {account.strategy.contentPillars.length > 0
                  ? account.strategy.contentPillars.slice(0, 4).map((pillar) => <span className="chip" key={pillar}>{pillar}</span>)
                  : <span className="chip chip--muted">Content Pillar未設定</span>}
              </div>
              <div className="account-card__actions">
                {account.archivedAt ? (
                  <Button variant="secondary" size="sm" icon={<RotateCcw size={14} />} onClick={() => void restore(account)}>復元</Button>
                ) : (
                  <>
                    <Button variant="secondary" size="sm" icon={<Pencil size={14} />} onClick={() => openEdit(account)}>編集</Button>
                    <Button variant="ghost" size="sm" icon={<Archive size={14} />} onClick={() => setConfirmArchive(account)}>アーカイブ</Button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        title={editingId ? 'アカウント設定を編集' : 'Xアカウントを登録'}
        description="X APIには接続しません。運用設計に必要な情報だけを保存します。"
        onClose={closeForm}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeForm} disabled={saving}>キャンセル</Button>
            <Button type="submit" form="account-form" disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
          </>
        }
      >
        <form id="account-form" className="account-form" onSubmit={(event) => void submit(event)}>
          <section className="form-section">
            <div className="form-section__title"><span>01</span><div><h3>基本情報</h3><p>アカウントを識別するための情報です。</p></div></div>
            <div className="form-grid form-grid--2">
              <TextField label="表示名" name="displayName" required value={form.displayName} error={fields.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="例：山田 太郎" />
              <TextField label="Xユーザー名" name="handle" required value={form.handle} error={fields.handle} onChange={(e) => setForm({ ...form, handle: e.target.value.replace(/^@/, '') })} placeholder="my_account" hint="@は不要です。" />
              <TextField label="ジャンル / Niche" name="niche" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="例：AI / Web制作" />
              <SelectField label="運用状態" name="status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AccountInput['status'] })}>
                <option value="draft">準備中</option><option value="active">運用中</option><option value="paused">停止中</option>
              </SelectField>
              <SelectField label="タイムゾーン" name="timezone" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                <option value="Asia/Tokyo">Asia/Tokyo</option><option value="UTC">UTC</option><option value="America/Los_Angeles">America/Los_Angeles</option><option value="America/New_York">America/New_York</option>
              </SelectField>
            </div>
            <TextAreaField label="運用目的" name="purpose" rows={3} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="このアカウントを何のために運用するか" />
            <TextAreaField label="ターゲット" name="targetAudience" rows={3} value={form.targetAudience} onChange={(e) => setForm({ ...form, targetAudience: e.target.value })} placeholder="誰に届けたいアカウントか" />
          </section>

          <section className="form-section">
            <div className="form-section__title"><span>02</span><div><h3>Strategy</h3><p>投稿判断の基準になる戦略を固定します。</p></div></div>
            <div className="form-grid form-grid--2">
              <SelectField label="主目的" name="primaryGoal" value={form.strategy.primaryGoal} onChange={(e) => setForm({ ...form, strategy: { ...form.strategy, primaryGoal: e.target.value as AccountInput['strategy']['primaryGoal'] } })}>
                <option value="growth">フォロワー成長</option><option value="traffic">外部流入</option><option value="sales">売上</option><option value="brand">ブランド</option><option value="community">コミュニティ</option>
              </SelectField>
              <SelectField label="収益モデル" name="monetizationType" value={form.strategy.monetizationType} onChange={(e) => setForm({ ...form, strategy: { ...form.strategy, monetizationType: e.target.value as AccountInput['strategy']['monetizationType'] } })}>
                <option value="none">未設定</option><option value="affiliate">アフィリエイト</option><option value="product">商品販売</option><option value="service">サービス販売</option><option value="creator_rewards">X収益化</option><option value="other">その他</option>
              </SelectField>
              <TextField label="1日の投稿目標" name="postingTargetPerDay" type="number" min="0" max="20" value={form.strategy.postingTargetPerDay} onChange={(e) => setForm({ ...form, strategy: { ...form.strategy, postingTargetPerDay: Number(e.target.value) } })} />
            </div>
            <TagInput id="content-pillars" label="Content Pillars" value={form.strategy.contentPillars} onChange={(contentPillars) => setForm({ ...form, strategy: { ...form.strategy, contentPillars } })} placeholder="テーマを入力してEnter" hint="アカウントが継続して扱うテーマを登録します。" maxItems={12} />
            <TagInput id="forbidden-topics" label="扱わないテーマ" value={form.strategy.forbiddenTopics} onChange={(forbiddenTopics) => setForm({ ...form, strategy: { ...form.strategy, forbiddenTopics } })} placeholder="禁止テーマを入力してEnter" />
            <TextAreaField label="収益目標" name="monetizationGoal" rows={3} value={form.monetizationGoal} onChange={(e) => setForm({ ...form, monetizationGoal: e.target.value })} placeholder="例：プロフィール経由で月10件のCV" />
            <TextAreaField label="導線 / Funnel" name="funnelNotes" rows={3} value={form.strategy.funnelNotes} onChange={(e) => setForm({ ...form, strategy: { ...form.strategy, funnelNotes: e.target.value } })} placeholder="X → プロフィール → LP → CV など" />
            <TextAreaField label="戦略メモ" name="strategyMemo" rows={4} value={form.strategy.strategyMemo} onChange={(e) => setForm({ ...form, strategy: { ...form.strategy, strategyMemo: e.target.value } })} />
          </section>

          <section className="form-section">
            <div className="form-section__title"><span>03</span><div><h3>Voice Profile</h3><p>AI生成を始める前に、アカウント固有の話し方を定義します。</p></div></div>
            <TagInput id="tone-keywords" label="トーン" value={form.voice.toneKeywords} onChange={(toneKeywords) => setForm({ ...form, voice: { ...form.voice, toneKeywords } })} placeholder="例：淡々 / 専門的 / 親しみ" maxItems={12} />
            <div className="form-grid form-grid--3">
              <SelectField label="文の長さ" name="sentenceStyle" value={form.voice.sentenceStyle} onChange={(e) => setForm({ ...form, voice: { ...form.voice, sentenceStyle: e.target.value as AccountInput['voice']['sentenceStyle'] } })}>
                <option value="short">短文中心</option><option value="mixed">混在</option><option value="long">長文中心</option>
              </SelectField>
              <SelectField label="丁寧さ" name="politeness" value={form.voice.politeness} onChange={(e) => setForm({ ...form, voice: { ...form.voice, politeness: e.target.value as AccountInput['voice']['politeness'] } })}>
                <option value="casual">カジュアル</option><option value="neutral">ニュートラル</option><option value="polite">丁寧</option>
              </SelectField>
              <SelectField label="絵文字" name="emojiUsage" value={form.voice.emojiUsage} onChange={(e) => setForm({ ...form, voice: { ...form.voice, emojiUsage: e.target.value as AccountInput['voice']['emojiUsage'] } })}>
                <option value="none">使わない</option><option value="low">少ない</option><option value="medium">普通</option><option value="high">多い</option>
              </SelectField>
              <SelectField label="断定の強さ" name="assertiveness" value={form.voice.assertiveness} onChange={(e) => setForm({ ...form, voice: { ...form.voice, assertiveness: e.target.value as AccountInput['voice']['assertiveness'] } })}>
                <option value="soft">柔らかい</option><option value="balanced">中間</option><option value="strong">強め</option>
              </SelectField>
            </div>
            <TagInput id="preferred-phrases" label="よく使う表現" value={form.voice.preferredPhrases} onChange={(preferredPhrases) => setForm({ ...form, voice: { ...form.voice, preferredPhrases } })} placeholder="表現を入力してEnter" />
            <TagInput id="banned-phrases" label="使わない表現" value={form.voice.bannedPhrases} onChange={(bannedPhrases) => setForm({ ...form, voice: { ...form.voice, bannedPhrases } })} placeholder="AI臭い表現などを入力してEnter" />
            <TextAreaField label="実際の投稿サンプル" name="samplePosts" rows={7} value={form.voice.samplePosts} onChange={(e) => setForm({ ...form, voice: { ...form.voice, samplePosts: e.target.value } })} hint="Phase 3でVoice抽出・生成品質改善に利用します。1投稿ごとに改行して保存できます。" />
          </section>

          <section className="form-section">
            <div className="form-section__title"><span>04</span><div><h3>Notes</h3><p>運用上の補足情報を自由に残せます。</p></div></div>
            <TextAreaField label="メモ" name="notes" rows={5} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </section>
        </form>
      </Modal>

      <Modal
        open={Boolean(confirmArchive)}
        title="アカウントをアーカイブしますか？"
        description="データは削除されません。後から復元できます。"
        onClose={() => setConfirmArchive(null)}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmArchive(null)}>キャンセル</Button>
            <Button variant="danger" onClick={() => void archive()}>アーカイブ</Button>
          </>
        }
      >
        <div className="confirm-copy">
          <span className="avatar avatar--lg">{confirmArchive?.displayName.slice(0, 1).toUpperCase()}</span>
          <div><strong>{confirmArchive?.displayName}</strong><p>@{confirmArchive?.handle}</p></div>
        </div>
      </Modal>
    </>
  )
}
