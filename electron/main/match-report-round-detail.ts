/**
 * Optional round detail sent with POST /api/match-report for Valorant matches:
 * the slim MatchDetailsLite (all 10 players, per-round hit regions and economy), the
 * match kill events, and the game build. Older APIs ignore these fields.
 *
 * The values are the ones already built for match_data (prepareMatchDataForUpload), so no
 * new data leaves the app; this only lifts them to the top level for the API to read.
 */
import type { MatchDetailsLite } from './match-data-payload'

/** Kept well under the API's 512 KB limit for these fields. */
export const ROUND_DETAIL_MAX_BYTES = 400 * 1024

export interface RoundDetailFields {
  match_details_lite?: MatchDetailsLite
  kill_events?: unknown[]
  game_version?: string
}

const byteLength = (v: unknown): number => Buffer.byteLength(JSON.stringify(v), 'utf8')

export function roundDetailFields(matchData: unknown, maxBytes = ROUND_DETAIL_MAX_BYTES): RoundDetailFields {
  if (!matchData || typeof matchData !== 'object') return {}
  const data = matchData as Record<string, unknown>
  if (data.game !== 'valorant') return {}

  const out: RoundDetailFields = {}
  const lite = data.matchDetailsLite as MatchDetailsLite | null | undefined
  if (lite && typeof lite === 'object' && (lite.players?.length || lite.rounds?.length)) out.match_details_lite = lite
  if (Array.isArray(data.killEvents) && data.killEvents.length) out.kill_events = data.killEvents

  const version = lite?.matchInfo?.gameVersion ?? data.gameClientVersion
  if (typeof version === 'string' && version.trim()) out.game_version = version.trim().slice(0, 64)

  // Too big: drop kill events first (round detail carries the hit regions), then the details.
  if (out.kill_events && byteLength(out) > maxBytes) delete out.kill_events
  if (out.match_details_lite && byteLength(out) > maxBytes) delete out.match_details_lite
  return out
}
