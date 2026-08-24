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
  matchId?: string | null
  timeline?: {
    playerKills?: unknown[]
    playerDeaths?: unknown[]
    finalStats?: { kills?: number; deaths?: number; assists?: number } | null
  } | null
}

export type OnboardingProgressStep = {
  key: 'recording' | 'riot' | 'upload' | 'analysis'
  state: 'pending' | 'active' | 'complete'
}

export function hasUsableOnboardingRiotData(recording: MissionRecording | null): boolean {
  if (!recording?.matchId || !recording.timeline) return false
  const stats = recording.timeline.finalStats
  const statEvents = (stats?.kills ?? 0) + (stats?.deaths ?? 0) + (stats?.assists ?? 0)
  return statEvents > 0
    || (recording.timeline.playerKills?.length ?? 0) > 0
    || (recording.timeline.playerDeaths?.length ?? 0) > 0
}

export function deriveOnboardingMissionProgress(
  stage: OnboardingMissionStage,
  recording: MissionRecording | null,
): OnboardingProgressStep[] {
  let activeIndex = 0
  let completedThrough = -1

  if (stage === 'waiting_match_data') {
    completedThrough = hasUsableOnboardingRiotData(recording) ? 1 : 0
    activeIndex = completedThrough + 1
  } else if (stage === 'uploading') {
    completedThrough = 1
    activeIndex = 2
  } else if (stage === 'analysing') {
    completedThrough = 2
    activeIndex = 3
  } else if (stage === 'ready') {
    completedThrough = 3
    activeIndex = -1
  } else if (stage === 'failed') {
    completedThrough = recording ? 0 : -1
    activeIndex = -1
  }

  const keys: OnboardingProgressStep['key'][] = ['recording', 'riot', 'upload', 'analysis']
  return keys.map((key, index) => ({
    key,
    state: index <= completedThrough ? 'complete' : index === activeIndex ? 'active' : 'pending',
  }))
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
