/** Never consult recorder paths or directory fallbacks for a match that acquired no capture. */
export function resolveMatchEndCapture<T>(
  captureNeverStarted: boolean,
  resolveCapturedFile: () => T,
): T | null {
  return captureNeverStarted ? null : resolveCapturedFile()
}

/** Source replays can still be processed when the video never started. */
export function shouldFinalizeMatchMedia(captureNeverStarted: boolean, usesSourceReplay: boolean): boolean {
  return !captureNeverStarted || usesSourceReplay
}
