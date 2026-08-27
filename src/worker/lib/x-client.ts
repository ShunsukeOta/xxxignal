import { and, eq } from 'drizzle-orm'
import type { Env } from '../env'
import { createDb } from '../db/client'
import { xConnections } from '../db/schema'
import { decryptSecret, encryptSecret } from './crypto'
import { AppError } from './http'

const X_API_BASE = 'https://api.x.com/2'
const TOKEN_URL = 'https://api.x.com/2/oauth2/token'

export function xScopes(env: Env) {
  return (env.X_SCOPES ?? 'tweet.read users.read offline.access').split(/\s+/).map((scope) => scope.trim()).filter(Boolean)
}

export function requireXConfig(env: Env) {
  const clientId = env.X_CLIENT_ID?.trim()
  const redirectUri = env.X_REDIRECT_URI?.trim()
  if (!clientId || !redirectUri || !env.X_TOKEN_ENCRYPTION_KEY?.trim()) {
    throw new AppError(503, 'x_not_configured', 'X OAuth設定が未完了です。Client ID / Redirect URI / Token暗号化キーを設定してください。')
  }
  return { clientId, clientSecret: env.X_CLIENT_SECRET?.trim() || '', redirectUri, scopes: xScopes(env) }
}

function tokenHeaders(clientId: string, clientSecret: string) {
  const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' })
  if (clientSecret) headers.set('Authorization', `Basic ${btoa(`${clientId}:${clientSecret}`)}`)
  return headers
}

async function tokenRequest(env: Env, params: URLSearchParams) {
  const { clientId, clientSecret } = requireXConfig(env)
  if (!clientSecret) params.set('client_id', clientId)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(TOKEN_URL, { method: 'POST', headers: tokenHeaders(clientId, clientSecret), body: params, signal: controller.signal })
    const json = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok || typeof json.access_token !== 'string') {
      throw new AppError(502, 'x_token_exchange_failed', 'X OAuth Token交換に失敗しました。')
    }
    return {
      accessToken: json.access_token,
      refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : '',
      expiresIn: typeof json.expires_in === 'number' ? json.expires_in : Number(json.expires_in ?? 7200) || 7200,
      scope: typeof json.scope === 'string' ? json.scope : '',
    }
  } catch (error) {
    if (error instanceof AppError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') throw new AppError(504, 'x_token_timeout', 'X OAuth Token交換がタイムアウトしました。')
    throw new AppError(502, 'x_token_exchange_failed', 'X OAuth Token交換に失敗しました。')
  } finally { clearTimeout(timer) }
}

export async function exchangeAuthorizationCode(env: Env, code: string, codeVerifier: string, redirectUri: string) {
  return tokenRequest(env, new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  }))
}

export async function refreshConnectionToken(env: Env, connection: typeof xConnections.$inferSelect) {
  if (!connection.refreshTokenEnc) throw new AppError(401, 'x_refresh_token_missing', 'Refresh TokenがないためXアカウントを再接続してください。')
  const refreshToken = await decryptSecret(env, connection.refreshTokenEnc)
  const token = await tokenRequest(env, new URLSearchParams({ refresh_token: refreshToken, grant_type: 'refresh_token' }))
  const db = createDb(env)
  const timestamp = new Date().toISOString()
  const expiresAt = new Date(Date.now() + Math.max(60, token.expiresIn) * 1000).toISOString()
  await db.update(xConnections).set({
    accessTokenEnc: await encryptSecret(env, token.accessToken),
    refreshTokenEnc: await encryptSecret(env, token.refreshToken || refreshToken),
    tokenExpiresAt: expiresAt,
    scopes: token.scope || connection.scopes,
    status: 'connected',
    lastError: '',
    lastRefreshedAt: timestamp,
    updatedAt: timestamp,
  }).where(and(eq(xConnections.id, connection.id), eq(xConnections.workspaceId, connection.workspaceId)))
  return token.accessToken
}

export async function accessTokenFor(env: Env, connection: typeof xConnections.$inferSelect) {
  const expiry = connection.tokenExpiresAt ? Date.parse(connection.tokenExpiresAt) : 0
  if (expiry && expiry - Date.now() < 5 * 60 * 1000) return refreshConnectionToken(env, connection)
  return decryptSecret(env, connection.accessTokenEnc)
}

export async function xApiJson<T>(env: Env, connection: typeof xConnections.$inferSelect, path: string) {
  let token = await accessTokenFor(env, connection)
  async function call(accessToken: string) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    try {
      return await fetch(`${X_API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        signal: controller.signal,
      })
    } finally { clearTimeout(timer) }
  }

  let response: Response
  try { response = await call(token) } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new AppError(504, 'x_api_timeout', 'X APIがタイムアウトしました。')
    throw new AppError(502, 'x_api_unreachable', 'X APIへ接続できませんでした。')
  }

  if (response.status === 401 && connection.refreshTokenEnc) {
    token = await refreshConnectionToken(env, connection)
    response = await call(token)
  }

  const json = await response.json().catch(() => ({})) as T
  if (!response.ok) {
    const db = createDb(env)
    await db.update(xConnections).set({ status: 'error', lastError: `HTTP ${response.status}`, updatedAt: new Date().toISOString() })
      .where(and(eq(xConnections.id, connection.id), eq(xConnections.workspaceId, connection.workspaceId)))
    if (response.status === 401 || response.status === 403) throw new AppError(response.status, 'x_authorization_failed', 'Xの認証または権限を確認してください。')
    if (response.status === 429) throw new AppError(429, 'x_rate_limited', 'X APIのRate Limitに達しました。時間を置いて再試行してください。')
    throw new AppError(502, 'x_api_error', `X APIがエラーを返しました (HTTP ${response.status})。`)
  }
  return { data: json, requestId: response.headers.get('x-request-id') ?? '' }
}
