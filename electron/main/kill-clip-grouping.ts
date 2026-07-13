/**
 * Kill grouping for highlight clip extraction.
 *
 * Round-based games (Valorant, CS2) bucket kills by `round`.
 * Round-less games (LoL, Deadlock) bucket by time-proximity sprees instead.
 */

import { gameSupportsRounds } from './game-config'
import type { KillEvent, MatchData } from './riot-types'

/** Max gap between two of the player's kills to count as the same multikill spree. */
export const KILL_SPREE_GAP_MS = 12_000

/**
 * Assign synthetic `round` numbers to the local player's kills, grouped by time
 * proximity. Lets the round-based clip pipeline treat each spree as one bucket.
 */
export function assignKillSpreeRounds(killEvents: KillEvent[], localKillerTag = 'You'): void {
  const playerKills = killEvents
    .filter((k) => k.killerName === localKillerTag)
    .sort((a, b) => (a.timeSinceGameStartMillis ?? 0) - (b.timeSinceGameStartMillis ?? 0))

  let spree = 0
  let lastMs: number | null = null
  for (const kill of playerKills) {
    const t = kill.timeSinceGameStartMillis ?? 0
    if (lastMs != null && t - lastMs > KILL_SPREE_GAP_MS) spree++
    kill.round = spree
    lastMs = t
  }
}

/**
 * Ensure kill events have round numbers suitable for clip extraction.
 * Idempotent for round-based games; assigns spree rounds for LoL-style timelines.
 */
export function ensureClipKillRounds(timeline: MatchData | null | undefined): void {
  if (!timeline?.killEvents?.length) return
  if (gameSupportsRounds(timeline.game)) return

  const playerKills = timeline.killEvents.filter((k) => k.killerName === 'You')
  const needsSpreeRounds = playerKills.some((k) => k.round == null || k.round < 0)
  if (!needsSpreeRounds && playerKills.length > 0) {
    // All player kills share one synthetic round (-1) — still wrong for clip grouping.
    const distinctRounds = new Set(playerKills.map((k) => k.round))
    if (distinctRounds.size <= 1) {
      assignKillSpreeRounds(timeline.killEvents)
    }
    return
  }
  assignKillSpreeRounds(timeline.killEvents)
}
