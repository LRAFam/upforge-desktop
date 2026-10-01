/** A connection alone does not prove that OBS can create a recording. */
export function hasVerifiedOnboardingRecording(signals: {
  connected: boolean
  testPassed: boolean
}): boolean {
  return signals.connected && signals.testPassed
}
