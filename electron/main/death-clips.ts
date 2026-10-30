/**
 * Death clips: short clips of the player's own deaths, so they can see what went wrong.
 * Capped per match (numeric, never unlimited). Opening deaths come first because that's the
 * most common Valorant focus ("died first"); then the rest in match order.
 */
import type { KillEvent, MatchData } from './riot-types'

export const MAX_DEATH_CLIPS_PER_MATCH = 4

export interface DeathClipPick {
  death: KillEvent
  /** True when this was the first kill of its round (the player died first). */
  opening: boolean
}

function eventTime(e: KillEvent): number {
  return e.timeSinceGameStartMillis ?? e.videoOffsetMs ?? Number.POSITIVE_INFINITY
}

/** Deaths worth clipping, opening deaths first, capped. Deaths without a video offset are skipped. */
export function pickDeathClips(
  timeline: Pick<MatchData, 'playerDeaths' | 'killEvents'> | null | undefined,
  opts: { cap?: number; excludeRounds?: ReadonlySet<number> } = {},
): DeathClipPick[] {
  const cap = Math.max(0, Math.min(opts.cap ?? MAX_DEATH_CLIPS_PER_MATCH, MAX_DEATH_CLIPS_PER_MATCH))
  const deaths = (timeline?.playerDeaths ?? []).filter(d => typeof d.videoOffsetMs === 'number' && Number.isFinite(d.videoOffsetMs))
  if (!deaths.length || cap === 0) return []

  // Earliest kill per round across the whole lobby tells us who died first.
  const firstKillByRound = new Map<number, KillEvent>()
  for (const k of timeline?.killEvents ?? []) {
    if (typeof k.round !== 'number') continue
    const prev = firstKillByRound.get(k.round)
    if (!prev || eventTime(k) < eventTime(prev)) firstKillByRound.set(k.round, k)
  }
  const isOpening = (d: KillEvent): boolean => {
    if (typeof d.round !== 'number') return false
    const first = firstKillByRound.get(d.round)
    return !!first && first.EventID === d.EventID
  }

  const picks = deaths
    .filter(d => !(typeof d.round === 'number' && opts.excludeRounds?.has(d.round)))
    .map(death => ({ death, opening: isOpening(death) }))
    .sort((a, b) => (a.opening === b.opening ? eventTime(a.death) - eventTime(b.death) : a.opening ? -1 : 1))
  return picks.slice(0, cap)
}
