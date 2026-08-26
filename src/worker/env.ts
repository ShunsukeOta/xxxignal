export interface Env {
  DB: D1Database
  AUTH_MODE?: 'local' | 'cloudflare-access'
  LOCAL_USER_EMAIL?: string
  LOCAL_USER_NAME?: string
  ACCOUNT_LIMIT?: string
}
