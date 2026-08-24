import { describe, expect, it } from 'vitest'
import {
  deriveOnboardingMissionProgress,
  deriveOnboardingMissionStage,
  hasUsableOnboardingRiotData,
  shouldUseOnboardingBonus,
} from './onboarding-match-mission'

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

  it('keeps the mission active after upload without granting the bonus twice', () => {
    expect(shouldUseOnboardingBonus({ active: true, game: 'valorant' }, 'valorant')).toBe(true)
    expect(shouldUseOnboardingBonus({
      active: true,
      game: 'valorant',
      bonusClaimedJobId: 'job-claimed',
    }, 'valorant')).toBe(false)
  })
  it('does not call an empty Riot stats shell usable match data', () => {
    expect(hasUsableOnboardingRiotData({
      matchId: 'match-1',
      timeline: { finalStats: { kills: 0, deaths: 0, assists: 0 } },
    })).toBe(false)
  })

  it('moves progress beyond Riot matching once usable stats arrive', () => {
    const progress = deriveOnboardingMissionProgress('waiting_match_data', {
      matchId: 'match-1',
      timeline: { finalStats: { kills: 14, deaths: 12, assists: 5 } },
    })

    expect(progress.map((step) => step.state)).toEqual([
      'complete',
      'complete',
      'active',
      'pending',
    ])
  })
})
