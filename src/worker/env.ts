export interface Env {
  DB: D1Database
  AUTH_MODE?: 'local' | 'cloudflare-access'
  LOCAL_USER_EMAIL?: string
  LOCAL_USER_NAME?: string
  ACCOUNT_LIMIT?: string
  AI_PROVIDER?: 'template' | 'openai'
  OPENAI_API_KEY?: string
  OPENAI_MODEL?: string
  OPENAI_BASE_URL?: string
}
