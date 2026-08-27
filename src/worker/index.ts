import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { accountRoutes } from './routes/accounts'
import { contentRoutes } from './routes/content'
import { researchRoutes } from './routes/research'
import { sessionRoutes } from './routes/session'
import { settingsRoutes } from './routes/settings'
import { xRoutes } from './routes/x'
import type { AppEnv } from './types'
import { AppError, errorPayload } from './lib/http'
import { ensureSession } from './lib/session'

const app = new Hono<AppEnv>()
app.use('*', async (c, next) => { const requestId = c.req.header('x-request-id')?.slice(0, 128) || crypto.randomUUID(); c.set('requestId', requestId); c.header('X-Request-Id', requestId); await next() })
app.use('*', secureHeaders())
app.get('/api/health', (c) => c.json({ data: { status: 'ok', service: 'xxxignal', phase: 4 } }))
const api = new Hono<AppEnv>()
api.use('*', async (c, next) => { if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) { const origin = c.req.header('origin'); const host = c.req.header('host'); if (origin && host) { try { if (new URL(origin).host !== host) throw new AppError(403, 'origin_not_allowed', '許可されていないOriginからのリクエストです。') } catch (error) { if (error instanceof AppError) throw error; throw new AppError(403, 'origin_not_allowed', 'Originヘッダーを検証できませんでした。') } } } const session = await ensureSession(c.env, c.req.raw); c.set('session', session); await next() })
api.route('/session', sessionRoutes)
api.route('/accounts', accountRoutes)
api.route('/research', researchRoutes)
api.route('/content', contentRoutes)
api.route('/settings', settingsRoutes)
app.route('/api', api)
app.notFound((c) => c.json(errorPayload('not_found', 'APIエンドポイントが見つかりません。', c.get('requestId')), 404))
app.onError((error, c) => { const requestId = c.get('requestId'); if (error instanceof AppError) return c.json(errorPayload(error.code, error.message, requestId, error.fields), error.status as never); console.error('Unhandled error', { requestId, error }); return c.json(errorPayload('internal_error', 'サーバーで予期しないエラーが発生しました。', requestId), 500) })
export default app
