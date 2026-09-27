/** Values at or above this are treated as unlimited (API may send PHP_INT_MAX). */
const UNLIMITED_THRESHOLD = 1_000_000

export function isUnlimitedQuota(value: number | null | undefined): boolean {
  if (value == null) return false
  return value >= UNLIMITED_THRESHOLD
}

/** Coaching analyses share one pool across Valorant, CS2, Deadlock, and LoL. */
export function sharedAnalysesPoolHint(
  used: number | null | undefined,
  limit: number | null | undefined,
): string {
  if (limit === undefined) return 'Coaching usage unavailable'
  if (limit === null || isUnlimitedQuota(limit)) {
    return 'Unlimited coaching analyses · shared across all games'
  }
  if (used == null) return 'Coaching usage unavailable'
  const remaining = Math.max(0, limit - used)
  const noun = remaining === 1 ? 'analysis' : 'analyses'
  return `${remaining} ${noun} left · shared across Valorant, CS2, Deadlock & LoL`
}

/** Short line for sidebar footer. */
export function analysesLeftSidebarLabel(
  used: number | null | undefined,
  limit: number | null | undefined,
): string {
  if (limit === undefined) return 'Usage unavailable'
  if (limit === null) return 'Unlimited analyses'
  if (isUnlimitedQuota(limit)) return 'Unlimited analyses'
  if (used == null) return 'Usage unavailable'
  const remaining = Math.max(0, limit - used)
  const noun = remaining === 1 ? 'analysis' : 'analyses'
  return `${remaining} ${noun} left`
}

/** Visual tone for sidebar quota line. */
export function analysesLeftSidebarTone(
  used: number | null | undefined,
  limit: number | null | undefined,
): 'ok' | 'low' | 'empty' | 'unlimited' | 'unknown' {
  if (limit === undefined) return 'unknown'
  if (limit === null || isUnlimitedQuota(limit)) return 'unlimited'
  if (used == null) return 'unknown'
  const remaining = Math.max(0, limit - used)
  if (remaining <= 0) return 'empty'
  if (remaining <= 2) return 'low'
  return 'ok'
}

/** Clear used/limit/left label for settings and post-game. */
export function analysesUsedLabel(used: number, limit: number): string {
  const left = Math.max(0, limit - used)
  return `${used} of ${limit} used · ${left} left`
}
