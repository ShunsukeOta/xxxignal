import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { ok } from '../lib/http'

export const sessionRoutes = new Hono<AppEnv>()

sessionRoutes.get('/', (c) => ok(c, c.get('session')))
