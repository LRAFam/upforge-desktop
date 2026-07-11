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
  if (limit == null || isUnlimitedQuota(limit)) {
    return 'Unlimited coaching analyses · shared across all games'
  }
  const remaining = Math.max(0, (limit ?? 0) - (used ?? 0))
  const noun = remaining === 1 ? 'analysis' : 'analyses'
  return `${remaining} ${noun} left · shared across Valorant, CS2, Deadlock & LoL`
}
