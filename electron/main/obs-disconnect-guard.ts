/**
 * Pure guards for OBS match-ownership release after WebSocket drops.
 * "Can't reach OBS" must not be treated as "OBS stopped recording".
 */

export function shouldKeepMatchOwnershipWhileDisconnected(opts: {
  matchOwned: boolean
  connected: boolean
  disconnectedDuringRecording: boolean
}): boolean {
  return opts.matchOwned && !opts.connected && opts.disconnectedDuringRecording
}

/** After a successful reconnect, release only when OBS output is confirmed idle. */
export function shouldReleaseOwnershipAfterReconnect(opts: {
  matchOwned: boolean
  disconnectedDuringRecording: boolean
  outputActive: boolean
}): boolean {
  if (!opts.matchOwned) return false
  if (!opts.disconnectedDuringRecording) return false
  return !opts.outputActive
}
