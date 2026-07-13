/**
 * Kill grouping for highlight clip extraction.
 *
 * Round-based games (Valorant, CS2) bucket kills by `round`.
 * Round-less games (LoL, Deadlock) bucket by time-proximity sprees instead.
 *
 * IMPORTANT: the clip pipeline must NOT mutate the stored/displayed timeline —
 * synthetic round numbers would leak into the VOD viewer and make a continuous
 * match (LoL) look round-based. Use `buildClipKills` to get a grouped COPY.
 */

import { gameSupportsRounds } from './game-config'
import type { KillEvent, MatchData } from './riot-types'

/** Max gap between two of the player's kills to count as the same multikill spree. */
export const KILL_SPREE_GAP_MS = 12_000

/**
 * Assign synthetic `round` numbers to a list of the player's kills, grouped by
 * time proximity. Mutates the passed objects — pass copies if you need to keep
 * the originals round-free.
 */
export function assignSpreeRounds(kills: KillEvent[]): void {
  const sorted = [...kills].sort(
    (a, b) => (a.timeSinceGameStartMillis ?? 0) - (b.timeSinceGameStartMillis ?? 0),
  )
  let spree = 0
  let lastMs: number | null = null
  for (const kill of sorted) {
    const t = kill.timeSinceGameStartMillis ?? 0
    if (lastMs != null && t - lastMs > KILL_SPREE_GAP_MS) spree++
    kill.round = spree
    lastMs = t
  }
}

/**
 * Assign synthetic `round` numbers to the local player's kills within a full
 * kill-event list (filters by killer tag). Mutates in place.
 * @deprecated Prefer {@link buildClipKills} which returns a non-mutating copy.
 */
export function assignKillSpreeRounds(killEvents: KillEvent[], localKillerTag = 'You'): void {
  const playerKills = killEvents.filter((k) => k.killerName === localKillerTag)
  assignSpreeRounds(playerKills)
}

/**
 * Ensure kill events have round numbers suitable for clip extraction.
 * Idempotent for round-based games; assigns spree rounds for LoL-style timelines.
 * @deprecated Prefer {@link buildClipKills} — this mutates the timeline in place.
 */
export function ensureClipKillRounds(timeline: MatchData | null | undefined): void {
  if (!timeline?.killEvents?.length) return
  if (gameSupportsRounds(timeline.game)) return

  const playerKills = timeline.killEvents.filter((k) => k.killerName === 'You')
  const needsSpreeRounds = playerKills.some((k) => k.round == null || k.round < 0)
  if (!needsSpreeRounds && playerKills.length > 0) {
    const distinctRounds = new Set(playerKills.map((k) => k.round))
    if (distinctRounds.size <= 1) {
      assignKillSpreeRounds(timeline.killEvents)
    }
    return
  }
  assignKillSpreeRounds(timeline.killEvents)
}

/**
 * Return the player's kills prepared for clip grouping, WITHOUT mutating the
 * stored timeline.
 *
 * - Round-based games: returns `timeline.playerKills` as-is (real rounds).
 * - Round-less games (LoL/Deadlock): returns COPIES with time-proximity spree
 *   rounds assigned, so the pipeline can bucket single/multi/penta kills while
 *   the saved timeline stays round-free for a continuous match view.
 */
export function buildClipKills(timeline: MatchData | null | undefined): KillEvent[] {
  const kills = timeline?.playerKills ?? []
  if (!kills.length || !timeline) return []
  if (gameSupportsRounds(timeline.game)) return kills
  const clones = kills.map((k) => ({ ...k }))
  assignSpreeRounds(clones)
  return clones
}
