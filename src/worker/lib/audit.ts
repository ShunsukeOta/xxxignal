import type { SessionContext } from './session'
import type { Env } from '../env'
import { createDb } from '../db/client'
import { auditLogs } from '../db/schema'

export async function writeAudit(
  env: Env,
  session: SessionContext,
  input: {
    action: string
    entityType: string
    entityId?: string | null
    accountId?: string | null
    metadata?: Record<string, unknown>
  },
) {
  const db = createDb(env)
  try {
    await db.insert(auditLogs).values({
      id: `aud_${crypto.randomUUID()}`,
      workspaceId: session.workspace.id,
      userId: session.user.id,
      accountId: input.accountId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadataJson: JSON.stringify(input.metadata ?? {}),
      createdAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('audit_log_write_failed', {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      error,
    })
  }
}
