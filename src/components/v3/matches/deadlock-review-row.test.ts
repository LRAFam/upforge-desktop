import { describe, expect, it } from 'vitest'
import { deadlockReviewState } from './deadlock-review-row'

describe('deadlockReviewState', () => {
  it('offers the review only on local Deadlock recordings without a real timeline', () => {
    expect(deadlockReviewState({ game: 'deadlock', hasLocalFile: true })).toBe('available')
    expect(deadlockReviewState({ game: 'cs2', hasLocalFile: true })).toBe('none')
    expect(deadlockReviewState({ game: 'deadlock', cloudOnly: true })).toBe('none')
    expect(deadlockReviewState({ game: 'deadlock', hasLocalFile: false })).toBe('none')
    expect(deadlockReviewState({ game: 'deadlock', analysisReadiness: { ready: true } })).toBe('none')
    // Main reports a reviewed replay as mode_unsupported (no video Analyse for Deadlock).
    expect(deadlockReviewState({ game: 'deadlock', hasLocalFile: true, deadlockReviewJobId: 'job-1', analysisReadiness: { ready: false, state: 'mode_unsupported' } })).toBe('none')
    expect(deadlockReviewState({ game: 'deadlock', hasLocalFile: true, analysisReadiness: { ready: false, state: 'waiting_match_data' } })).toBe('available')
  })
  it('shows progress instead of a second (paid) review', () => {
    expect(deadlockReviewState({ game: 'deadlock', hasLocalFile: true, deadlockReviewJobId: 'job-12345678' })).toBe('in_progress')
  })
})
