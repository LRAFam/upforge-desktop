/**
 * Pure helpers for the UI v3 match page (VOD review). Everything here is derived from the
 * review context the page already loads — no new data, no invented coaching text.
 */

export type MatchTone = 'win' | 'loss' | 'none'
export type MatchSideTab = 'replay' | 'notes' | 'map'

export interface ScoreLine { ally: number; enemy: number }
export interface RoundLike { roundNumber: number; won: boolean }
export interface EventLike { type: string; round?: number; isFirstBlood?: boolean; videoOffsetMs?: number | null }

/** Result word + tone from the scoreline, falling back to the player's final stats. */
export function matchResult(score: ScoreLine | null, finalWon: boolean | null | undefined): { word: string; tone: MatchTone } | null {
  if (score) {
    if (score.ally > score.enemy) return { word: 'VICTORY', tone: 'win' }
    if (score.ally < score.enemy) return { word: 'DEFEAT', tone: 'loss' }
    return { word: 'DRAW', tone: 'none' }
  }
  if (finalWon === true) return { word: 'VICTORY', tone: 'win' }
  if (finalWon === false) return { word: 'DEFEAT', tone: 'loss' }
  return null
}

/** Rounds where the player's own death was the round's first blood (they died first). */
export function firstDeathRounds(events: readonly EventLike[]): Set<number> {
  const rounds = new Set<number>()
  for (const e of events) {
    if (e.type === 'death' && e.isFirstBlood && typeof e.round === 'number') rounds.add(e.round)
  }
  return rounds
}

/** Bars for UfRoundsLine, in round order; `marked` = the player died first that round. */
export function roundsForLine(groups: readonly RoundLike[], events: readonly EventLike[]): Array<{ won: boolean; marked: boolean }> {
  const first = firstDeathRounds(events)
  return groups.map(g => ({ won: g.won, marked: first.has(g.roundNumber) }))
}

/** Earliest own first-death with a video position (for "Watch the first death"). */
export function firstDeathEvent<T extends EventLike>(events: readonly T[]): T | null {
  let best: T | null = null
  for (const e of events) {
    if (e.type !== 'death' || !e.isFirstBlood || e.videoOffsetMs == null || Number.isNaN(e.videoOffsetMs)) continue
    if (!best || (e.videoOffsetMs as number) < (best.videoOffsetMs as number)) best = e
  }
  return best
}

/**
 * The coach's one sentence. The AI verdict / top issue when the match was analysed;
 * otherwise a plain fact from the match data (never a made-up claim); otherwise nothing.
 */
export function coachLine(
  detail: { verdict?: string | null; top_issue?: string | null } | null | undefined,
  rounds: readonly RoundLike[],
  events: readonly EventLike[],
  roundBased: boolean,
): { text: string; source: 'coach' | 'data' } | null {
  const verdict = detail?.verdict?.trim()
  if (verdict) return { text: verdict, source: 'coach' }
  const issue = detail?.top_issue?.trim()
  if (issue) return { text: issue, source: 'coach' }
  if (!roundBased || rounds.length === 0) return null
  const first = firstDeathRounds(events)
  const counted = rounds.filter(r => first.has(r.roundNumber))
  if (counted.length === 0) return null
  const won = counted.filter(r => r.won).length
  return {
    text: `You died first in ${counted.length} of ${rounds.length} rounds. Your team won ${won} of them.`,
    source: 'data',
  }
}

/** Which side-panel view is showing, as a single tab key. */
export function sideTab(showInsightsPanel: boolean, spatialMapVisible: boolean): MatchSideTab {
  if (spatialMapVisible) return 'map'
  if (showInsightsPanel) return 'notes'
  return 'replay'
}

/**
 * Honest notice for a stats-only report: the video couldn't be reviewed, so the coaching comes
 * from match data alone. Uses the API's own flags (is_degraded / report_type) and its first
 * listed limitation; null for a normal video-reviewed report.
 */
export function statsOnlyNotice(detail: {
  report_type?: unknown
  coaching_source?: unknown
  is_degraded?: unknown
  telemetry_fallback_used?: unknown
  limitations?: unknown
  credit_returned?: unknown
} | null | undefined): { title: string; message: string; limitation: string | null } | null {
  if (!detail) return null
  const degraded = detail.is_degraded === true || detail.telemetry_fallback_used === true
    || detail.report_type === 'degraded_telemetry' || detail.coaching_source === 'telemetry_only'
  if (!degraded) return null
  const first = Array.isArray(detail.limitations) ? detail.limitations.find(l => typeof l === 'string' && l.trim()) : null
  // Credit wording only when the API confirms the refund (older reports were charged).
  const refunded = detail.credit_returned === true
  return {
    title: 'Stats-based report',
    message: refunded
      ? 'We couldn’t review the video. Your credit was returned. This coaching uses the match data only.'
      : 'The video couldn’t be reviewed for this match, so this coaching uses the match data only.',
    limitation: typeof first === 'string' ? first.trim() : null,
  }
}
