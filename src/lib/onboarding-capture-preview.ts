export type OnboardingPreviewDecision = {
  missionActive: boolean
  valorantDetected: boolean
  recording: boolean
  onboardingRecordingFound: boolean
  postGamePhase: string | null
  previewInFlight: boolean
  captureConfirmed: boolean
  force: boolean
  now: number
  lastCapturedAt: number
  refreshIntervalMs?: number
}

const BUSY_POST_GAME_PHASES = new Set([
  'preparing',
  'uploading',
  'analysing',
  'pending',
])

export function shouldOfferOnboardingCaptureSupport(retryCount: number, threshold = 3): boolean {
  return retryCount >= threshold
}

/** Visual preview stays inert until an admin explicitly starts a real test mission. */
export function shouldPollOnboardingMission(isPreview: boolean, missionActive: boolean): boolean {
  return !isPreview || missionActive
}

export function shouldMinimizeOnboardingForRecording(input: {
  missionActive: boolean
  recording: boolean
  alreadyMinimized: boolean
}): boolean {
  return input.missionActive && input.recording && !input.alreadyMinimized
}

export function isPostGameBusy(phase: string | null | undefined): boolean {
  return phase != null && BUSY_POST_GAME_PHASES.has(phase)
}

export function shouldRequestOnboardingPreview(input: OnboardingPreviewDecision): boolean {
  if (!input.missionActive || !input.valorantDetected) return false
  if (input.recording || input.onboardingRecordingFound) return false
  if (isPostGameBusy(input.postGamePhase) || input.previewInFlight) return false
  if (input.force) return true

  if (input.captureConfirmed) return false

  const refreshIntervalMs = input.refreshIntervalMs ?? 15_000
  return input.now - input.lastCapturedAt >= refreshIntervalMs
}

export function findLatestOnboardingRecording<
  T extends { onboardingBonus?: boolean; recordedAt: number },
>(recordings: T[], missionStartedAt: number | null | undefined): T | null {
  return recordings
    .filter((recording) => recording.onboardingBonus === true)
    .filter((recording) => missionStartedAt == null || recording.recordedAt >= missionStartedAt)
    .sort((a, b) => b.recordedAt - a.recordedAt)[0] ?? null
}
