/** Home "Recent form" strip: which matches it covers and the numbers it shows (pure, testable). */
import type { AnalysisItem } from '../../../env.d.ts'
import { analysisCountsTowardProgress } from '../../../lib/game-queue'
import { averageAcs, newestPlayedFirst, pooledKd, roundedMean, toMatchWon } from '../../../lib/match-stats'
import { averageMatchScore, matchScore } from '../../../lib/upforge-score'
import { plural } from '../../../lib/plural'

export interface FormStat { value: string; caption: string; sub?: string; tone?: 'win' | 'loss' }

/**
 * The last `n` ranked/main-mode matches, newest played first. `matches` is one row per match
 * (dedupeByMatch); the API lists them newest analysed first, so a re-run of an old match must not
 * push a newer match out of the window.
 */
export function recentFormMatches(matches: readonly AnalysisItem[], game: string, n = 5): AnalysisItem[] {
  return newestPlayedFirst(matches.filter(a => analysisCountsTowardProgress(game, a))).slice(0, n)
}

function roundsOf(a: Pick<AnalysisItem, 'rounds_won' | 'rounds_lost'>): number | null {
  return a.rounds_won != null && a.rounds_lost != null ? a.rounds_won + a.rounds_lost : null
}

/** Every number in the strip comes from the same `list` (the matches the squares show). */
export function recentFormStats(
  list: readonly AnalysisItem[],
  opts: { game: string; acs: (a: AnalysisItem) => number | null; coachRatingFallback: boolean },
): FormStat[] {
  if (!list.length) return []
  // toMatchWon: a cached list from before the 1/0 fix may still hold numbers.
  const wins = list.filter(a => toMatchWon(a.won) === true).length
  const losses = list.filter(a => toMatchWon(a.won) === false).length
  // No result known for any of them (e.g. CS2 VOD-only analyses): never show a made-up "0–0".
  const items: FormStat[] = wins + losses > 0
    ? [{ value: `${wins}–${losses}`, caption: 'Won–lost', sub: `Last ${plural(list.length, 'analysed match', 'analysed matches')}` }]
    : [{ value: String(list.length), caption: 'Analysed', sub: 'No win or loss recorded for these' }]
  const acs = averageAcs(list.map(a => ({ acs: opts.acs(a), rounds: roundsOf(a) })))
  if (acs != null) items.push({ value: String(acs), caption: 'Average ACS', sub: 'Combat score per round' })
  // CS2 has no ACS: the demo's K/D is its headline number.
  if (opts.game === 'cs2') {
    const withKd = list.filter(a => a.kills != null && a.deaths != null)
    const kdas = list.map(a => a.kda).filter((k): k is number => k != null && Number.isFinite(k))
    const kd = withKd.length ? pooledKd(withKd) : (kdas.length ? kdas.reduce((s, k) => s + k, 0) / kdas.length : null)
    const n = withKd.length || kdas.length
    if (kd != null) items.push({ value: kd.toFixed(2), caption: 'Average K/D', sub: `Over ${plural(n, 'match', 'matches')} with stats` })
    const adr = roundedMean(list.map(a => a.cs2_stats?.adr))
    if (adr != null) items.push({ value: String(adr), caption: 'Average ADR', sub: 'Damage per round, measured matches only' })
  }
  // Per-match HS% is all the list endpoint sends, so this is the mean of those matches (the label says so).
  const hs = roundedMean(list.map(a => a.hs_pct))
  if (hs != null) items.push({ value: `${hs}%`, caption: 'Headshots', sub: 'Average across those matches' })
  // Stats-based UpForge score, averaged over scored matches only (coach ratings are never mixed in).
  const uf = averageMatchScore(list)
  if (uf) {
    items.push({ value: String(uf.value), caption: 'UpForge score', sub: `Average of your last ${plural(uf.count, 'scored match', 'scored matches')}` })
  } else if (opts.coachRatingFallback) {
    // None scored yet: the coach's average rating under its own name (stored 0–100 for Valorant/League).
    const rated = list.map(a => a.overall_score).filter((s): s is number => s != null && Number.isFinite(s))
    const coach = rated.length ? matchScore({ overall_score: rated.reduce((s, x) => s + x, 0) / rated.length }) : null
    if (coach) items.push({ value: coach.text, caption: 'Coach rating', sub: `Average of your last ${plural(rated.length, 'rated match', 'rated matches')}` })
  }
  return items
}
