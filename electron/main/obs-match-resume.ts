/**
 * Decide whether OBS becoming connected should re-enter match detection.
 *
 * Covers the stuck case: game process still tracked as active, OBS was down
 * (so recording never started), then OBS recovers without a fresh game-started.
 *
 * Must NOT fire mid-match after a WebSocket blip: match ownership /
 * disconnected-during-recording means reclaim owns recovery, not a new detect.
 */
export function shouldResumeMatchDetectionOnObsConnect(opts: {
  activeGame: string | null
  waitingForMatch: boolean
  isActivelyRecording: boolean
  matchDetectInFlight: boolean
  /** UpForge still owns a match session (even if WS dropped). */
  matchOwnedRecording?: boolean
  disconnectedDuringRecording?: boolean
}): boolean {
  if (!opts.activeGame) return false
  if (opts.waitingForMatch) return false
  if (opts.isActivelyRecording) return false
  if (opts.matchDetectInFlight) return false
  if (opts.matchOwnedRecording) return false
  if (opts.disconnectedDuringRecording) return false
  return true
}
