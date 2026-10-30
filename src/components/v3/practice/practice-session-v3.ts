/**
 * Pure helpers for the UI v3 practice surfaces that sit around a drill: the running / warm-up strips,
 * the result and session dialogs, Analytics, Leaderboards and Trainer results. No Vue, no IPC.
 * Everything formats numbers the training API already returned; nothing here invents data.
 */

export type Tone = 'win' | 'loss' | undefined

/** "+5", "-3", "0". */
export function signed(n: number): string {
  return `${n > 0 ? '+' : ''}${n}`
}

/** Better = win colour, worse = loss colour, no change = neutral. */
export function deltaTone(n: number | null | undefined): Tone {
  if (n == null || n === 0) return undefined
  return n > 0 ? 'win' : 'loss'
}

/** CSS colour for a tone (null = inherit). */
export function toneColor(t: Tone): string | undefined {
  return t === 'win' ? 'var(--uf-win)' : t === 'loss' ? 'var(--uf-loss)' : undefined
}

/**
 * Trend over recent runs from the history API. Same ±2 point dead zone as the legacy badge, so
 * small wobbles read as "steady" instead of a red or green claim.
 */
export function trendSummary(trend: number | null | undefined): { text: string; tone: Tone } | null {
  if (trend == null) return null
  const pts = Math.abs(trend).toFixed(1)
  if (trend > 2) return { text: `Up ${pts} pts`, tone: 'win' }
  if (trend < -2) return { text: `Down ${pts} pts`, tone: 'loss' }
  return { text: 'Steady', tone: undefined }
}

export interface BenchmarkRow {
  user_best: number | null
  global_avg: number | null
  percentile: number | null
  label: string | null
  peers: number
  comparison?: { difficulty: string; duration_seconds: number } | null
}

/** Benchmark only when at least 5 players compared (same rule as the legacy view). */
export function benchmarkVisible(b: BenchmarkRow | null | undefined): b is BenchmarkRow {
  return !!b && (b.peers ?? 0) >= 5
}

/** "142 players · medium · 60s" */
export function benchmarkMeta(b: BenchmarkRow): string {
  const parts = [`${b.peers} players`]
  if (b.comparison?.difficulty) parts.push(b.comparison.difficulty)
  if (b.comparison?.duration_seconds) parts.push(`${b.comparison.duration_seconds}s`)
  return parts.join(' · ')
}

/** Last N scores oldest → newest, from history sessions that arrive newest first. */
export function recentScores(sessions: Array<{ score: number }> | null | undefined, n = 8): number[] {
  return [...(sessions ?? [])].reverse().slice(-n).map(s => s.score)
}

/** "34/40" */
export function hitsLabel(hit: number, missed: number): string {
  return `${hit}/${hit + missed}`
}

/** Leaderboard / top-sessions: only first place gets the gold star (gold = best). */
export function isBest(rank: number): boolean {
  return rank === 1
}

/** Clamp a 0–100 value for a bar width. */
export function pct(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}
