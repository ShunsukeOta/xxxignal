import type { WorkspaceRole } from '../../shared/contracts'
import type { SessionContext } from './session'
import { AppError } from './http'

export function requireRole(session: SessionContext, allowedRoles: readonly WorkspaceRole[]) {
  if (!allowedRoles.includes(session.workspace.role)) {
    throw new AppError(403, 'insufficient_role', 'この操作を実行する権限がありません。')
  }
}
