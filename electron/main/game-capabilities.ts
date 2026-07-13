/**
 * Per-game capability flags — use instead of scattering `if (game === 'lol')` checks.
 */

import { normalizeGameId } from './game-config'

export { normalizeGameId, type GameId } from './game-config'

/** CS2 / Deadlock: timeline comes from demo/replay on disk after the match. */
export function usesDemoReplay(game: string | null | undefined): boolean {
  const id = normalizeGameId(game)
  return id === 'cs2' || id === 'deadlock'
}

/** Valorant / LoL: timeline from Riot live client API during the match. */
export function usesLiveClientTimeline(game: string | null | undefined): boolean {
  const id = normalizeGameId(game)
  return id === 'valorant' || id === 'lol'
}

/** Games that wait for a live match window before auto-recording (not menu-only). */
export function gameNeedsLiveMatchWindow(game: string | null | undefined): boolean {
  return usesDemoReplay(game) || normalizeGameId(game) === 'lol'
}

/** Games that upload a source replay file alongside the VOD. */
export function uploadsSourceReplay(game: string | null | undefined): boolean {
  return usesDemoReplay(game)
}
