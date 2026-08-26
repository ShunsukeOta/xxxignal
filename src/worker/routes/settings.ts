import { and, eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import type { UiDensity, WorkspaceSettings } from '../../shared/contracts'
import { createDb } from '../db/client'
import { settings, users, workspaces } from '../db/schema'
import type { AppEnv } from '../types'
import { writeAudit } from '../lib/audit'
import { requireRole } from '../lib/authorization'
import { ok, readJson } from '../lib/http'
import { validateSettingsInput } from '../lib/validation'

export const settingsRoutes = new Hono<AppEnv>()

const parseSetting = <T>(value: string | undefined, fallback: T): T => {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

async function readWorkspaceSettings(c: Context<AppEnv>): Promise<WorkspaceSettings> {
  const session = c.get('session')
  const db = createDb(c.env)
  const rows = await db.select().from(settings).where(eq(settings.workspaceId, session.workspace.id))
  const map = Object.fromEntries(rows.map((row) => [row.key, row.valueJson]))

  return {
    userDisplayName: session.user.displayName,
    workspaceName: session.workspace.name,
    defaultTimezone: parseSetting(map.default_timezone, 'Asia/Tokyo'),
    uiDensity: parseSetting<UiDensity>(map.ui_density, 'comfortable'),
    authMode: c.env.AUTH_MODE === 'local' ? 'local' : 'cloudflare-access',
    accountLimit: session.limits.accountLimit,
  }
}

settingsRoutes.get('/', async (c) => ok(c, await readWorkspaceSettings(c)))

settingsRoutes.patch('/', async (c) => {
  const session = c.get('session')
  requireRole(session, ['owner', 'admin'])
  const db = createDb(c.env)
  const input = validateSettingsInput(await readJson<unknown>(c))
  const timestamp = new Date().toISOString()

  await db.update(users).set({ displayName: input.userDisplayName, updatedAt: timestamp })
    .where(eq(users.id, session.user.id))
  await db.update(workspaces).set({ name: input.workspaceName, updatedAt: timestamp })
    .where(eq(workspaces.id, session.workspace.id))

  const settingValues = [
    ['default_timezone', input.defaultTimezone],
    ['ui_density', input.uiDensity],
  ] as const

  for (const [key, value] of settingValues) {
    const [existing] = await db.select({ id: settings.id }).from(settings)
      .where(and(eq(settings.workspaceId, session.workspace.id), eq(settings.key, key)))
      .limit(1)

    if (existing) {
      await db.update(settings).set({ valueJson: JSON.stringify(value), updatedAt: timestamp })
        .where(eq(settings.id, existing.id))
    } else {
      await db.insert(settings).values({
        id: `set_${crypto.randomUUID()}`,
        workspaceId: session.workspace.id,
        key,
        valueJson: JSON.stringify(value),
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }
  }

  await writeAudit(c.env, session, {
    action: 'workspace.settings_updated',
    entityType: 'workspace',
    entityId: session.workspace.id,
  })

  const nextSession = {
    ...session,
    user: { ...session.user, displayName: input.userDisplayName },
    workspace: { ...session.workspace, name: input.workspaceName },
  }
  c.set('session', nextSession)

  return ok(c, await readWorkspaceSettings(c))
})
