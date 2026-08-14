export type CaptureReadinessPhase =
  | 'obs_disconnected'
  | 'preflight_required'
  | 'waiting_for_game'
  | 'checking_capture'
  | 'capture_blocked'
  | 'safe_to_queue'
  | 'recording'

export type CaptureReadinessSignals = {
  obsConnected: boolean
  preflightPassed: boolean
  gameDetected: boolean
  captureChecked: boolean
  captureVerified: boolean
  recording: boolean
  error?: string | null
}

/** Canonical capture gate shared by onboarding and future dashboard surfaces. */
export function deriveCaptureReadiness(signals: CaptureReadinessSignals): CaptureReadinessPhase {
  if (!signals.obsConnected) return 'obs_disconnected'
  if (signals.recording) return 'recording'
  if (!signals.preflightPassed) return 'preflight_required'
  if (!signals.gameDetected) return 'waiting_for_game'
  if (!signals.captureChecked) return 'checking_capture'
  if (!signals.captureVerified || signals.error) return 'capture_blocked'
  return 'safe_to_queue'
}
