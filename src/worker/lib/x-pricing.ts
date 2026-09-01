export const X_PRICING_VERSION = '2026-08-27'

export const X_UNIT_COST_MICROUSD = {
  post_read: 5_000,
  user_read: 10_000,
  follow_read: 10_000,
  like_read: 1_000,
  post_create: 15_000,
  post_create_with_url: 200_000,
} as const

export type XPriceKey = keyof typeof X_UNIT_COST_MICROUSD

export function microsToUsd(value: number) {
  return Math.round(value) / 1_000_000
}

export function usdToMicros(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.round(value * 1_000_000))
}
