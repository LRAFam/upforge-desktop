/**
 * Valorant ACS (Average Combat Score) helpers.
 *
 * Riot's match API exposes `stats.score` as cumulative combat score for the
 * match. In-game ACS = total score / rounds played (typically ~150–350).
 */

/** ACS values above this are extremely rare; larger numbers are almost certainly totals. */
export const TOTAL_COMBAT_SCORE_THRESHOLD = 500

/** Convert Riot cumulative combat score to per-round ACS. */
export function computeAcs(totalScore: number, rounds: number): number {
  if (!Number.isFinite(totalScore) || totalScore <= 0) return 0
  if (!Number.isFinite(rounds) || rounds <= 0) return Math.round(totalScore)
  return Math.round(totalScore / rounds)
}

export function isLikelyTotalCombatScore(value: number): boolean {
  return Number.isFinite(value) && value > TOTAL_COMBAT_SCORE_THRESHOLD
}

/**
 * Normalize a stored score to ACS when it looks like a Riot total.
 * Values already in ACS range are returned unchanged.
 */
export function normalizeToAcs(
  score: number | null | undefined,
  rounds: number | null | undefined,
): number | null {
  if (score == null || !Number.isFinite(score)) return null
  if (!isLikelyTotalCombatScore(score)) return Math.round(score)
  if (rounds != null && rounds > 0) return computeAcs(score, rounds)
  return Math.round(score)
}

/** Riot player stats block from MatchDetails. */
export function riotStatsToAcs(
  stats: Record<string, unknown> | undefined,
  fallbackRounds: number,
): number {
  const total = (stats?.score as number) ?? 0
  const rounds = (stats?.roundsPlayed as number) || fallbackRounds
  return computeAcs(total, rounds)
}
