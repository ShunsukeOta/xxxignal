import { and, desc, eq, gte, sql } from 'drizzle-orm'
import type { SessionContext } from './session'
import type { Env } from '../env'
import { createDb } from '../db/client'
import { xBudgetSettings, xCostLedger } from '../db/schema'
import { AppError } from './http'
import { microsToUsd, usdToMicros, X_PRICING_VERSION, X_UNIT_COST_MICROUSD, type XPriceKey } from './x-pricing'

function monthStartIso(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString()
}

export async function ensureBudget(env: Env, session: SessionContext) {
  const db = createDb(env)
  let [budget] = await db.select().from(xBudgetSettings).where(eq(xBudgetSettings.workspaceId, session.workspace.id)).limit(1)
  if (!budget) {
    const timestamp = new Date().toISOString()
    await db.insert(xBudgetSettings).values({
      workspaceId: session.workspace.id,
      monthlyBudgetMicrousd: 5_000_000,
      warningPercent: 80,
      hardLimitEnabled: true,
      updatedAt: timestamp,
      updatedByUserId: session.user.id,
    }).onConflictDoNothing()
    ;[budget] = await db.select().from(xBudgetSettings).where(eq(xBudgetSettings.workspaceId, session.workspace.id)).limit(1)
  }
  if (!budget) throw new AppError(500, 'budget_init_failed', 'X API予算設定を初期化できませんでした。')
  return budget
}

export async function monthSpendMicros(env: Env, workspaceId: string) {
  const db = createDb(env)
  const [row] = await db
    .select({ value: sql<number>`coalesce(sum(${xCostLedger.estimatedCostMicrousd}), 0)` })
    .from(xCostLedger)
    .where(and(eq(xCostLedger.workspaceId, workspaceId), gte(xCostLedger.createdAt, monthStartIso())))
  return Number(row?.value ?? 0)
}

export async function assertBudget(env: Env, session: SessionContext, worstCaseMicros: number) {
  const budget = await ensureBudget(env, session)
  const spent = await monthSpendMicros(env, session.workspace.id)
  if (budget.hardLimitEnabled && spent + Math.max(0, worstCaseMicros) > budget.monthlyBudgetMicrousd) {
    throw new AppError(
      402,
      'x_budget_exceeded',
      `X API月額上限を超える可能性があるため実行を停止しました。現在 $${microsToUsd(spent).toFixed(4)} / 上限 $${microsToUsd(budget.monthlyBudgetMicrousd).toFixed(2)}`,
    )
  }
  return { budget, spent }
}

export async function recordXCost(env: Env, input: {
  workspaceId: string
  accountId?: string | null
  operation: string
  endpoint: string
  resourceType: string
  units: number
  priceKey: XPriceKey
  requestId?: string
  metadata?: Record<string, unknown>
}) {
  const db = createDb(env)
  const unitCost = X_UNIT_COST_MICROUSD[input.priceKey]
  const cost = Math.max(0, input.units) * unitCost
  await db.insert(xCostLedger).values({
    id: `xcl_${crypto.randomUUID()}`,
    workspaceId: input.workspaceId,
    accountId: input.accountId ?? null,
    provider: 'x',
    operation: input.operation,
    endpoint: input.endpoint,
    resourceType: input.resourceType,
    units: Math.max(0, input.units),
    unitCostMicrousd: unitCost,
    estimatedCostMicrousd: cost,
    pricingVersion: X_PRICING_VERSION,
    requestId: input.requestId ?? '',
    metadataJson: JSON.stringify(input.metadata ?? {}),
    createdAt: new Date().toISOString(),
  })
  return cost
}

export async function costSummary(env: Env, session: SessionContext) {
  const db = createDb(env)
  const budget = await ensureBudget(env, session)
  const spent = await monthSpendMicros(env, session.workspace.id)
  const entries = await db.select().from(xCostLedger)
    .where(and(eq(xCostLedger.workspaceId, session.workspace.id), gte(xCostLedger.createdAt, monthStartIso())))
    .orderBy(desc(xCostLedger.createdAt)).limit(100)
  const usagePercent = budget.monthlyBudgetMicrousd > 0 ? Math.min(999, (spent / budget.monthlyBudgetMicrousd) * 100) : (spent > 0 ? 999 : 0)
  return {
    month: monthStartIso().slice(0, 7),
    spentUsd: microsToUsd(spent),
    budgetUsd: microsToUsd(budget.monthlyBudgetMicrousd),
    remainingUsd: microsToUsd(Math.max(0, budget.monthlyBudgetMicrousd - spent)),
    usagePercent,
    warning: usagePercent >= budget.warningPercent,
    hardLimitReached: budget.hardLimitEnabled && spent >= budget.monthlyBudgetMicrousd,
    pricingVersion: X_PRICING_VERSION,
    entries: entries.map((entry) => ({
      id: entry.id,
      accountId: entry.accountId,
      operation: entry.operation,
      endpoint: entry.endpoint,
      resourceType: entry.resourceType,
      units: entry.units,
      unitCostUsd: microsToUsd(entry.unitCostMicrousd),
      estimatedCostUsd: microsToUsd(entry.estimatedCostMicrousd),
      pricingVersion: entry.pricingVersion,
      requestId: entry.requestId,
      createdAt: entry.createdAt,
    })),
  }
}

export async function updateBudget(env: Env, session: SessionContext, input: unknown) {
  if (!input || typeof input !== 'object') throw new AppError(422, 'validation_error', '予算設定を確認してください。')
  const body = input as Record<string, unknown>
  const monthlyBudgetUsd = Number(body.monthlyBudgetUsd)
  const warningPercent = Math.round(Number(body.warningPercent))
  if (!Number.isFinite(monthlyBudgetUsd) || monthlyBudgetUsd < 0 || monthlyBudgetUsd > 10_000) throw new AppError(422, 'validation_error', '月額予算は0〜10000 USDで入力してください。')
  if (!Number.isFinite(warningPercent) || warningPercent < 1 || warningPercent > 100) throw new AppError(422, 'validation_error', '警告閾値は1〜100%で入力してください。')
  const db = createDb(env)
  const timestamp = new Date().toISOString()
  await db.insert(xBudgetSettings).values({
    workspaceId: session.workspace.id,
    monthlyBudgetMicrousd: usdToMicros(monthlyBudgetUsd),
    warningPercent,
    hardLimitEnabled: body.hardLimitEnabled !== false,
    updatedAt: timestamp,
    updatedByUserId: session.user.id,
  }).onConflictDoUpdate({
    target: xBudgetSettings.workspaceId,
    set: {
      monthlyBudgetMicrousd: usdToMicros(monthlyBudgetUsd),
      warningPercent,
      hardLimitEnabled: body.hardLimitEnabled !== false,
      updatedAt: timestamp,
      updatedByUserId: session.user.id,
    },
  })
  return ensureBudget(env, session)
}
