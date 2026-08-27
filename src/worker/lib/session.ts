import { and, asc, count, eq, isNull } from 'drizzle-orm'
import type { SessionData, WorkspaceRole } from '../../shared/contracts'
import type { Env } from '../env'
import { createDb } from '../db/client'
import { settings, users, workspaceMembers, workspaces, xAccounts } from '../db/schema'
import { AppError } from './http'

export interface SessionContext extends SessionData {}

const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`

function getIdentity(env: Env, request: Request) {
  const authMode = env.AUTH_MODE ?? 'cloudflare-access'
  if (authMode === 'local') {
    return {
      email: (env.LOCAL_USER_EMAIL ?? 'owner@xxxignal.local').trim().toLowerCase(),
      displayName: (env.LOCAL_USER_NAME ?? 'Owner').trim() || 'Owner',
    }
  }

  const email = request.headers.get('Cf-Access-Authenticated-User-Email')?.trim().toLowerCase()
  if (!email) throw new AppError(401, 'authentication_required', 'Cloudflare Accessでの認証が必要です。')
  return { email, displayName: email.split('@')[0] || 'Owner' }
}

export async function ensureSession(env: Env, request: Request): Promise<SessionContext> {
  const db = createDb(env)
  const identity = getIdentity(env, request)
  let [user] = await db.select().from(users).where(eq(users.email, identity.email)).limit(1)

  if (!user) {
    const userId = id('usr')
    const timestamp = now()
    try {
      await db.insert(users).values({
        id: userId,
        email: identity.email,
        displayName: identity.displayName,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    } catch {
      // 同じメールで同時に初回アクセスした場合は、先に作成されたレコードを利用する。
    }
    ;[user] = await db.select().from(users).where(eq(users.email, identity.email)).limit(1)
  }

  if (!user) throw new AppError(500, 'session_bootstrap_failed', 'ユーザー情報の初期化に失敗しました。')

  let [membership] = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
      workspacePlan: workspaces.plan,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, user.id))
    .orderBy(asc(workspaceMembers.createdAt))
    .limit(1)

  if (!membership) {
    const suffix = user.id.replace(/^usr_/, '')
    const workspaceId = `ws_personal_${suffix}`
    const workspaceSlug = `personal-${suffix.slice(0, 24)}`
    const timestamp = now()

    await db.insert(workspaces).values({
      id: workspaceId,
      name: 'My Workspace',
      slug: workspaceSlug,
      plan: 'personal',
      ownerId: user.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).onConflictDoNothing()

    await db.insert(workspaceMembers).values({
      workspaceId,
      userId: user.id,
      role: 'owner',
      createdAt: timestamp,
    }).onConflictDoNothing()

    await db.insert(settings).values([
      {
        id: `set_timezone_${suffix}`,
        workspaceId,
        key: 'default_timezone',
        valueJson: JSON.stringify('Asia/Tokyo'),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: `set_density_${suffix}`,
        workspaceId,
        key: 'ui_density',
        valueJson: JSON.stringify('comfortable'),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]).onConflictDoNothing()

    ;[membership] = await db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        role: workspaceMembers.role,
        workspaceName: workspaces.name,
        workspaceSlug: workspaces.slug,
        workspacePlan: workspaces.plan,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.workspaceId, workspaceId)))
      .limit(1)
  }

  if (!membership) throw new AppError(500, 'workspace_bootstrap_failed', 'ワークスペースの初期化に失敗しました。')

  const [accountCount] = await db
    .select({ value: count() })
    .from(xAccounts)
    .where(and(eq(xAccounts.workspaceId, membership.workspaceId), isNull(xAccounts.archivedAt)))

  const accountLimit = Math.max(1, Math.min(50, Number.parseInt(env.ACCOUNT_LIMIT ?? '3', 10) || 3))

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    },
    workspace: {
      id: membership.workspaceId,
      name: membership.workspaceName,
      slug: membership.workspaceSlug,
      plan: membership.workspacePlan,
      role: membership.role as WorkspaceRole,
    },
    limits: {
      accountLimit,
      activeAccountCount: accountCount?.value ?? 0,
    },
    phase: 5,
  }
}
