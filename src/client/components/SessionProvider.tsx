import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SessionData } from '../../shared/contracts'
import { api, ApiError } from '../api'

interface SessionContextValue {
  session: SessionData | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const next = await api<SessionData>('/session')
      setSession(next)
    } catch (requestError) {
      setSession(null)
      if (requestError instanceof ApiError && requestError.status === 401) {
        setError('認証が必要です。Cloudflare Access、またはローカル開発用AUTH_MODEを確認してください。')
      } else {
        setError(requestError instanceof Error ? requestError.message : '初期化に失敗しました。')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const value = useMemo(() => ({ session, loading, error, refresh }), [session, loading, error, refresh])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used within SessionProvider')
  return context
}
