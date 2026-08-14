import { describe, expect, it } from 'vitest'
import { deriveOnboardingMissionStage } from './onboarding-match-mission'

describe('onboarding match mission state', () => {
  it('shows real capture states before a recording exists', () => {
    expect(deriveOnboardingMissionStage({ currentGame: null, waitingForMatch: false, recording: false }, null)).toBe('ready_for_game')
    expect(deriveOnboardingMissionStage({ currentGame: 'valorant', waitingForMatch: false, recording: false }, null)).toBe('game_detected')
    expect(deriveOnboardingMissionStage({ currentGame: 'valorant', waitingForMatch: true, recording: false }, null)).toBe('waiting_for_match')
    expect(deriveOnboardingMissionStage({ currentGame: 'valorant', waitingForMatch: false, recording: true }, null)).toBe('recording')
  })

  it('does not skip official match data or analysis readiness', () => {
    expect(deriveOnboardingMissionStage(
      { currentGame: null, waitingForMatch: false, recording: false },
      { pipelineStatus: 'pending', analysisReadiness: { state: 'waiting_match_data' } },
    )).toBe('waiting_match_data')
    expect(deriveOnboardingMissionStage(
      { currentGame: null, waitingForMatch: false, recording: false },
      { pipelineStatus: 'uploading', analysisReadiness: { state: 'ready' } },
    )).toBe('uploading')
    expect(deriveOnboardingMissionStage(
      { currentGame: null, waitingForMatch: false, recording: false },
      { pipelineStatus: 'analysing', analysisReadiness: { state: 'ready' } },
    )).toBe('analysing')
  })

  it('only becomes ready from a canonical analysis id', () => {
    expect(deriveOnboardingMissionStage(
      { currentGame: null, waitingForMatch: false, recording: false },
      { analysed: true },
    )).toBe('processing')
    expect(deriveOnboardingMissionStage(
      { currentGame: null, waitingForMatch: false, recording: false },
      { analysisId: 42 },
    )).toBe('ready')
  })
})
