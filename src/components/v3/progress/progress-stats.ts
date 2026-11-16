/** Progress (StatsView) match numbers: which matches count and how each card/table is worked out. */
import type { AnalysisItem } from '../../../env.d.ts'
import { analysisCountsTowardProgress } from '../../../lib/game-queue'
import { newestPlayedFirst, playedTime, pooledKd, roundedMean, toMatchWon, winRatePct } from '../../../lib/match-stats'
import { normalizeMapAssetKey, NON_MAP_NAMES } from '../../../lib/valorant'
import { dedupeByMatch } from '../home/home-v3'

export type ProgressRange = '7d' | '30d' | '90d' | 'all'

const RANGE_DAYS: Record<Exclude<ProgressRange, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 }

/**
 * One row per real match (a re-analysed match counts once), newest played first, inside the range
 * by when it was played. `counted` drops fun modes (game-queue.ts); `excluded` says how many.
 */
export function progressMatches(
  all: readonly AnalysisItem[],
  game: string,
  range: ProgressRange,
  now = Date.now(),
): { counted: AnalysisItem[]; excluded: number } {
  const cutoff = range === 'all' ? -Infinity : now - RANGE_DAYS[range] * 24 * 60 * 60 * 1000
  const inRange = newestPlayedFirst(dedupeByMatch(all)).filter(a => playedTime(a) >= cutoff)
  const counted = inRange.filter(a => analysisCountsTowardProgress(game, a))
  return { counted, excluded: inRange.length - counted.length }
}

const won = (a: Pick<AnalysisItem, 'won'>) => toMatchWon(a.won)

/** Win rate over matches with a known result; null when none has one (shown as "—", never "0%"). */
export function progressWinRate(list: readonly AnalysisItem[]): number | null {
  return winRatePct(list.map(a => ({ won: won(a) })))
}

/** K/D card: total kills / total deaths; "-" with no stats. */
export function progressKd(list: readonly AnalysisItem[]): string {
  const kd = pooledKd(list)
  return kd == null ? '-' : kd.toFixed(2)
}

export function progressHs(list: readonly AnalysisItem[]): number | null {
  return roundedMean(list.map(a => a.hs_pct))
}

/** `wr` is null when no match in the row has a known result (shown as "—", never "0%"). */
export type BreakdownRow = { name: string; games: number; wins: number; wr: number | null; kda: string; roundWr: string }

/** Agent / map table: win rate over matches with a known result, K/D pooled, round win rate pooled. */
export function breakdownRows(list: readonly AnalysisItem[], key: 'agent' | 'map'): BreakdownRow[] {
  const acc = new Map<string, { games: number; wins: number; decided: number; kills: number; deaths: number; kdGames: number; roundsWon: number; roundsLost: number }>()
  for (const a of list) {
    const raw = a[key]
    if (!raw) continue
    let name: string
    if (key === 'map') {
      const normalized = normalizeMapAssetKey(raw)
      if (!normalized || NON_MAP_NAMES.has(normalized)) continue
      name = normalized
    } else {
      name = raw
    }
    const e = acc.get(name) ?? { games: 0, wins: 0, decided: 0, kills: 0, deaths: 0, kdGames: 0, roundsWon: 0, roundsLost: 0 }
    e.games++
    const w = won(a)
    if (w != null) e.decided++
    if (w === true) e.wins++
    if (a.kills != null && a.deaths != null) {
      e.kills += a.kills
      e.deaths += a.deaths
      e.kdGames++
    }
    // Only matches with both sides of the score, so one half-known score can't skew the rate.
    if (a.rounds_won != null && a.rounds_lost != null) {
      e.roundsWon += a.rounds_won
      e.roundsLost += a.rounds_lost
    }
    acc.set(name, e)
  }
  return Array.from(acc.entries())
    .map(([name, e]) => {
      const totalRounds = e.roundsWon + e.roundsLost
      return {
        name,
        games: e.games,
        wins: e.wins,
        wr: e.decided > 0 ? Math.round((e.wins / e.decided) * 100) : null,
        kda: e.kdGames > 0 ? (e.kills / Math.max(1, e.deaths)).toFixed(1) : '-',
        roundWr: totalRounds > 0 ? `${Math.round((e.roundsWon / totalRounds) * 100)}%` : '-',
      }
    })
    .sort((a, b) => b.games - a.games)
    .slice(0, 6)
}
