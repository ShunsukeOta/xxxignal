import { CircleAlert, LockKeyhole, Save } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import type { WorkspaceSettings } from '../../shared/contracts'
import { api, ApiError } from '../api'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { SelectField, TextField } from '../components/Field'
import { useSession } from '../components/SessionProvider'
import { useToast } from '../components/Toast'

export function SettingsPage() {
  const { refresh: refreshSession } = useSession()
  const { showToast } = useToast()
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadSettings = () => {
    setLoading(true)
    setLoadError(null)
    api<WorkspaceSettings>('/settings')
      .then(setSettings)
      .catch((error) => setLoadError(error instanceof Error ? error.message : '設定を読み込めませんでした。'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadSettings() }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!settings) return
    setSaving(true)
    setFields({})
    try {
      const updated = await api<WorkspaceSettings>('/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      })
      setSettings(updated)
      await refreshSession()
      showToast('設定を保存しました。')
    } catch (error) {
      if (error instanceof ApiError) setFields(error.fields ?? {})
      showToast(error instanceof Error ? error.message : '保存に失敗しました。', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">FOUNDATION SETTINGS</p>
          <h1>設定</h1>
          <p>ワークスペースと個人利用時の基本設定を管理します。</p>
        </div>
      </div>

      {loading ? (
        <section className="panel"><div className="skeleton skeleton--line" /><div className="skeleton skeleton--card" /></section>
      ) : loadError ? (
        <section className="panel">
          <EmptyState
            icon={<CircleAlert size={24} />}
            title="設定を取得できませんでした"
            description={loadError}
            action={<Button variant="secondary" onClick={loadSettings}>再試行</Button>}
          />
        </section>
      ) : settings ? (
        <form className="settings-layout" onSubmit={(event) => void submit(event)}>
          <section className="panel settings-panel">
            <div className="panel__heading"><div><h2>プロフィール / Workspace</h2><p>将来の複数ユーザー配布を前提に分離して保存します。</p></div></div>
            <div className="form-grid form-grid--2">
              <TextField label="表示名" name="userDisplayName" value={settings.userDisplayName} error={fields.userDisplayName} onChange={(e) => setSettings({ ...settings, userDisplayName: e.target.value })} />
              <TextField label="Workspace名" name="workspaceName" value={settings.workspaceName} error={fields.workspaceName} onChange={(e) => setSettings({ ...settings, workspaceName: e.target.value })} />
              <SelectField label="既定タイムゾーン" name="defaultTimezone" value={settings.defaultTimezone} onChange={(e) => setSettings({ ...settings, defaultTimezone: e.target.value })}>
                <option value="Asia/Tokyo">Asia/Tokyo</option><option value="UTC">UTC</option><option value="America/Los_Angeles">America/Los_Angeles</option><option value="America/New_York">America/New_York</option>
              </SelectField>
              <SelectField label="画面密度" name="uiDensity" value={settings.uiDensity} onChange={(e) => setSettings({ ...settings, uiDensity: e.target.value as WorkspaceSettings['uiDensity'] })}>
                <option value="comfortable">標準</option><option value="compact">コンパクト</option>
              </SelectField>
            </div>
            <div className="settings-actions"><Button type="submit" icon={<Save size={16} />} disabled={saving}>{saving ? '保存中…' : '設定を保存'}</Button></div>
          </section>

          <aside className="panel security-panel">
            <div className="security-panel__icon"><LockKeyhole size={22} /></div>
            <h2>Access Boundary</h2>
            <dl>
              <div><dt>認証モード</dt><dd>{settings.authMode === 'local' ? 'Local development' : 'Cloudflare Access'}</dd></div>
              <div><dt>アカウント上限</dt><dd>{settings.accountLimit}</dd></div>
              <div><dt>X OAuth</dt><dd>Phase 4</dd></div>
            </dl>
            <p>Xのパスワード・Cookieはxxxignalに保存しません。</p>
          </aside>
        </form>
      ) : null}
    </>
  )
}
