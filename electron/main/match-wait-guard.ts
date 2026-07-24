/**
 * Pure helpers for match-wait cancellation and support-friendly logging.
 * Process probes can flake under load / exclusive fullscreen alt-tab;
 * never cancel on a lone "process gone" without confirmation when possible.
 */

export type ProcessProbeResult = 'running' | 'stopped' | 'unknown'

export type MatchWaitMissDecision =
  | { action: 'wait'; resetStreak: false }
  | { action: 'wait'; resetStreak: true; reason: string }
  | { action: 'cancel'; reason: string }

/** Soft: start consulting Riot. Hard: cancel even if Riot is unreachable. */
export const MATCH_WAIT_PROCESS_MISS_SOFT = 5
export const MATCH_WAIT_PROCESS_MISS_HARD = 20

/** CS2 / Deadlock / LoL: consecutive confirmed stops before cancelling wait. */
export const GENERIC_PROCESS_MISS_CANCEL = 5

/** Re-init Riot auth after this many null/failed presence polls. */
export const PRESENCE_NULL_REAUTH_EVERY = 10

/** Activity milestone while waiting for INGAME. */
export const MATCH_WAIT_MILESTONE_MS = 60_000

/** Rate-limit for "tasklist unknown" console/activity noise. */
export const UNKNOWN_PROBE_LOG_INTERVAL_MS = 15_000

/**
 * Interpret filtered `tasklist /fi "IMAGENAME eq …"` stdout.
 * Errors belong at the call site as `'unknown'` — do not pass thrown failures here.
 */
export function interpretTasklistProcessStdout(
  stdout: string,
  processName: string,
): ProcessProbeResult {
  const haystack = stdout.toLowerCase()
  const needle = processName.toLowerCase()
  if (haystack.includes(needle)) return 'running'
  return 'stopped'
}

/**
 * Decide whether consecutive Shipping.exe "stopped" probes should cancel match-wait.
 * @param riotMatchActive true = still PREGAME/INGAME or core/pregame session;
 *   false = Riot says out; null = Riot unreachable / unknown
 */
export function decideMatchWaitAfterProcessMiss(opts: {
  consecutiveStopped: number
  riotMatchActive: boolean | null
  softThreshold?: number
  hardThreshold?: number
}): MatchWaitMissDecision {
  const soft = opts.softThreshold ?? MATCH_WAIT_PROCESS_MISS_SOFT
  const hard = opts.hardThreshold ?? MATCH_WAIT_PROCESS_MISS_HARD
  const n = opts.consecutiveStopped

  if (n < soft) {
    return { action: 'wait', resetStreak: false }
  }

  if (opts.riotMatchActive === true) {
    return {
      action: 'wait',
      resetStreak: true,
      reason: 'Riot still in match flow — ignoring Shipping.exe miss streak',
    }
  }

  if (opts.riotMatchActive === false) {
    return {
      action: 'cancel',
      reason: 'Shipping.exe gone and Riot confirmed left match',
    }
  }

  if (n >= hard) {
    return {
      action: 'cancel',
      reason: 'Shipping.exe gone and Riot unreachable — cancelling match wait',
    }
  }

  return { action: 'wait', resetStreak: false }
}

/**
 * Whether game-stopped during lobby wait should abort (vs keep waiting).
 * When Riot still shows match flow, treat process miss as flake.
 */
export function shouldAbortMatchWaitOnGameStopped(
  riotMatchActive: boolean | null,
): boolean {
  return riotMatchActive === false
}

/**
 * Mid-match game-stopped: suppress finalize only while Riot still shows match flow.
 * When Riot is unreachable (null) and the process is gone, prefer ending capture
 * over an orphaned recording.
 */
export function shouldSuppressFinalizeOnGameStopped(
  riotMatchActive: boolean | null,
): boolean {
  return riotMatchActive === true
}

/** Simple streak cancel for games without a Riot-style live session API. */
export function shouldCancelGenericProcessMiss(
  consecutiveStopped: number,
  threshold = GENERIC_PROCESS_MISS_CANCEL,
): boolean {
  return consecutiveStopped >= threshold
}

/** User-facing activity line for match-wait cancel. */
export function formatMatchWaitCancelActivity(reason: string): string {
  const short = reason
    .replace(/^Shipping\.exe gone and /i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return `Match cancelled — ${short}`
}

/** Periodic wait status for support-readable activity trail. */
export function formatMatchWaitMilestone(opts: {
  sessionLoopState: string | null
  processMissStreak: number
  waitedSec: number
}): string {
  const loop = opts.sessionLoopState ?? 'unknown'
  const miss = opts.processMissStreak > 0 ? `, process misses=${opts.processMissStreak}` : ''
  return `Still waiting for match (${loop}${miss}, ${opts.waitedSec}s)`
}

/** Whether to emit a rate-limited log for an unknown process probe. */
export function shouldLogUnknownProbe(
  lastLoggedAt: number | null,
  now: number,
  intervalMs = UNKNOWN_PROBE_LOG_INTERVAL_MS,
): boolean {
  if (lastLoggedAt == null) return true
  return now - lastLoggedAt >= intervalMs
}

/** Whether a null presence streak should trigger Riot re-auth. */
export function shouldReauthAfterPresenceNulls(
  nullStreak: number,
  every = PRESENCE_NULL_REAUTH_EVERY,
): boolean {
  return nullStreak > 0 && nullStreak % every === 0
}
