import { describe, expect, it } from 'vitest'
import {
  canAutoEnqueueRecording,
  decidePostMatchNextStep,
  isWaitingMatchDataState,
} from './post-match-steps'

describe('decidePostMatchNextStep', () => {
  it('returns pending_manual when auto-analyse is off', () => {
    expect(decidePostMatchNextStep({ autoAnalyse: false, readinessReady: true })).toBe('pending_manual')
    expect(decidePostMatchNextStep({ autoAnalyse: false, readinessReady: false })).toBe('pending_manual')
  })

  it('returns pending_waiting_stats when auto-analyse on but not ready', () => {
    expect(decidePostMatchNextStep({
      autoAnalyse: true,
      readinessReady: false,
      readinessState: 'waiting_match_data',
    })).toBe('pending_waiting_stats')
  })

  it('returns upload_analyse when auto-analyse on and ready', () => {
    expect(decidePostMatchNextStep({ autoAnalyse: true, readinessReady: true })).toBe('upload_analyse')
  })
})

describe('isWaitingMatchDataState', () => {
  it('matches syncing and waiting_match_data', () => {
    expect(isWaitingMatchDataState('syncing')).toBe(true)
    expect(isWaitingMatchDataState('waiting_match_data')).toBe(true)
    expect(isWaitingMatchDataState('ready')).toBe(false)
    expect(isWaitingMatchDataState(null)).toBe(false)
  })
})

describe('canAutoEnqueueRecording', () => {
  it('does not automatically requeue a recording after a quota rejection', () => {
    expect(canAutoEnqueueRecording({
      autoAnalyseRequested: true,
      lastAnalysisError: 'Your match is ready, but you need an analysis credit. Upgrade or pay per analysis to unlock coaching.',
    })).toBe(false)
  })

  it('allows automatic work after the previous failure has been cleared', () => {
    expect(canAutoEnqueueRecording({ autoAnalyseRequested: true, lastAnalysisError: null })).toBe(true)
  })

  it('requires explicit intent and keeps legacy recordings manual-only', () => {
    expect(canAutoEnqueueRecording({ autoAnalyseRequested: true })).toBe(true)
    expect(canAutoEnqueueRecording({ autoAnalyseRequested: false })).toBe(false)
    expect(canAutoEnqueueRecording({})).toBe(false)
  })
})
