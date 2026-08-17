export type OnboardingMissionStage =
  | 'ready_for_game'
  | 'game_detected'
  | 'waiting_for_match'
  | 'recording'
  | 'processing'
  | 'waiting_match_data'
  | 'uploading'
  | 'analysing'
  | 'failed'
  | 'ready'

type MissionRuntimeStatus = {
  currentGame: string | null
  waitingForMatch: boolean
  recording: boolean
}

type MissionRecording = {
  analysed?: boolean
  analysisId?: number
  pipelineStatus?: 'pending' | 'uploading' | 'analysing'
  lastAnalysisError?: string | null
  analysisReadiness?: { state: string } | null
}

export function shouldUseOnboardingBonus(
  mission: { active?: boolean; game?: string; bonusClaimedJobId?: string } | null | undefined,
  game: string,
): boolean {
  return mission?.active === true
    && mission.game === game
    && !mission.bonusClaimedJobId
}

export function deriveOnboardingMissionStage(
  status: MissionRuntimeStatus,
  recording: MissionRecording | null,
): OnboardingMissionStage {
  if (recording?.analysisId != null) return 'ready'
  if (recording?.lastAnalysisError) return 'failed'
  if (recording?.analysisReadiness?.state === 'waiting_match_data'
    || recording?.analysisReadiness?.state === 'syncing'
    || recording?.analysisReadiness?.state === 'finalizing') {
    return 'waiting_match_data'
  }
  if (recording?.pipelineStatus === 'uploading') return 'uploading'
  if (recording?.pipelineStatus === 'analysing') return 'analysing'
  if (recording) return 'processing'
  if (status.recording) return 'recording'
  if (status.waitingForMatch) return 'waiting_for_match'
  if (status.currentGame) return 'game_detected'
  return 'ready_for_game'
}
