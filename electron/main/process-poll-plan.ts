import { interpretTasklistProcessStdout, type ProcessProbeResult } from './match-wait-guard'

/** Poll interval when no game is running (check for game start). */
export const POLL_IDLE_MS = 5_000
/** Poll interval while a game is running but no game API has confirmed a live match yet. */
export const POLL_ACTIVE_MS = 10_000
/** Poll interval once a game API (presence / GSI / live client) confirms a live match. */
export const POLL_CONFIRMED_MS = 30_000
/** Process checks reuse a full `tasklist` snapshot at most this old instead of spawning. */
export const PROCESS_SNAPSHOT_MAX_AGE_MS = 10_000
/**
 * The CS2/Deadlock re-watch loop ticks every 3 s for up to 15 min (often through a whole skipped
 * match). It only needs "is the game still open", so it takes the detector's own list (≤30 s
 * confirmed cadence + slack) instead of spawning a filtered tasklist per tick.
 */
export const REARM_PROCESS_MAX_AGE_MS = POLL_CONFIRMED_MS + 5_000

export interface ProcessSnapshot {
  /** Full `tasklist /fo csv /nh` stdout. */
  stdout: string
  at: number
}

/**
 * Next full-tasklist delay. A confirmed live match only needs a slow process check;
 * a miss (process maybe gone) drops back to the normal active cadence so game-stopped
 * still lands one active poll after the first miss.
 */
export function nextProcessPollDelayMs(state: {
  activeGame: string | null
  matchConfirmed: boolean
  missedPollStreak: number
}): number {
  if (!state.activeGame) return POLL_IDLE_MS
  if (state.matchConfirmed && state.missedPollStreak === 0) return POLL_CONFIRMED_MS
  return POLL_ACTIVE_MS
}

/** Answer a process probe from a recent snapshot, or null when it is missing/stale. */
export function probeFromSnapshot(
  snapshot: ProcessSnapshot | null,
  processNames: readonly string[],
  maxAgeMs: number,
  now: number = Date.now(),
): ProcessProbeResult | null {
  if (!snapshot || now - snapshot.at > maxAgeMs) return null
  return processNames.some((name) => interpretTasklistProcessStdout(snapshot.stdout, name) === 'running')
    ? 'running'
    : 'stopped'
}
