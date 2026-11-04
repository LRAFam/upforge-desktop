/**
 * CS2 starting report body: the newest matches whose demo was parsed on this PC (contract §5).
 * Each match carries the full measured match_stats and its game_mode; matches the desktop knows
 * are unranked (Wingman, Casual, Deathmatch…) are left out. Unknown modes are kept (null = count it).
 */
import { queueTypeFor } from '../../src/lib/game-queue'
import { gameModeForApi } from './match-data-payload'

export interface Cs2StartingRecording {
  id: string
  game?: string | null
  matchId?: string | null
  map?: string | null
  gameMode?: string | null
  timeline?: unknown
}

export interface Cs2StartingMatch {
  match_key: string
  map: string | null
  won: boolean | null
  game_mode: string | null
  match_stats: {
    player_stats: unknown
    round_stats?: unknown
    utility_stats?: unknown
    economy_stats?: unknown
  }
}

export const CS2_STARTING_REPORT_MAX = 10

type TimelineLike = {
  gameMode?: unknown
  finalStats?: { won?: unknown } | null
  match_stats?: Record<string, unknown> | null
}

/** Newest first, as the recordings store lists them. */
export function cs2StartingReportMatches(recordings: Cs2StartingRecording[]): Cs2StartingMatch[] {
  const out: Cs2StartingMatch[] = []
  for (const rec of recordings) {
    if (out.length >= CS2_STARTING_REPORT_MAX) break
    if (rec.game !== 'cs2') continue
    const t = (rec.timeline ?? null) as TimelineLike | null
    const stats = t?.match_stats
    if (!stats || typeof stats !== 'object' || !stats.player_stats || typeof stats.player_stats !== 'object') continue
    const mode = rec.gameMode || (typeof t?.gameMode === 'string' ? t.gameMode : null)
    if (queueTypeFor('cs2', mode) === 'unranked') continue
    const won = t?.finalStats?.won
    const match_stats: Cs2StartingMatch['match_stats'] = { player_stats: stats.player_stats }
    for (const key of ['round_stats', 'utility_stats', 'economy_stats'] as const) {
      if (stats[key] && typeof stats[key] === 'object') match_stats[key] = stats[key]
    }
    out.push({
      match_key: String(rec.matchId ?? rec.id).slice(0, 80),
      map: rec.map ?? null,
      won: typeof won === 'boolean' ? won : null,
      game_mode: gameModeForApi(mode),
      match_stats,
    })
  }
  return out
}
