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

// ── Leaderboard "You" row ─────────────────────────────────────────────────────
export type LeaderboardPeriod = 'week' | 'month' | 'all'

export interface LeaderboardYouRow {
  /** Your best for this drill/settings/period from your own history, or null when you have none. */
  score: number | null
  note: string
}

const PERIOD_DAYS: Record<LeaderboardPeriod, number | null> = { week: 7, month: 30, all: null }

/**
 * The API returns at most `limit` rows and no rank for players outside them. When you aren't in the
 * rows, show your own best for the same settings (from /api/training/sessions, already filtered to
 * the drill, difficulty, length and current scoring) and say plainly why there is no rank.
 */
export function leaderboardYouRow(
  entries: ReadonlyArray<{ is_current_user?: boolean }>,
  myRuns: ReadonlyArray<{ score: number; completed_at: string }> | null | undefined,
  period: LeaderboardPeriod,
  now: number,
  limit = 50,
  parseTime: (s: string) => number = s => Date.parse(s),
): LeaderboardYouRow | null {
  if (entries.some(e => e.is_current_user)) return null
  const days = PERIOD_DAYS[period]
  const since = days == null ? -Infinity : now - days * 86_400_000
  const scores = (myRuns ?? []).filter(r => parseTime(r.completed_at) >= since).map(r => r.score).filter(Number.isFinite)
  if (!scores.length) {
    const when = period === 'week' ? 'this week' : period === 'month' ? 'this month' : 'yet'
    return { score: null, note: `No run with these settings ${when}.` }
  }
  const score = Math.max(...scores)
  if (entries.length >= limit) return { score, note: `Outside the top ${limit}. Ranks past ${limit} aren’t shown.` }
  return { score, note: 'Not on the board yet. It refreshes every 10 minutes and hides players who opted out.' }
}
