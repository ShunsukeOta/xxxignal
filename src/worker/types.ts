import type { SessionContext } from './lib/session'
import type { Env } from './env'

export interface AppVariables {
  session: SessionContext
  requestId: string
}

export type AppEnv = {
  Bindings: Env
  Variables: AppVariables
}
