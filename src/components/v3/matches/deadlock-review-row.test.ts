import { describe, expect, it } from 'vitest'
import { deadlockReviewState } from './deadlock-review-row'

describe('deadlockReviewState', () => {
  it('offers the review only on local Deadlock recordings without a real timeline', () => {
    expect(deadlockReviewState({ game: 'deadlock', hasLocalFile: true })).toBe('available')
    expect(deadlockReviewState({ game: 'cs2', hasLocalFile: true })).toBe('none')
    expect(deadlockReviewState({ game: 'deadlock', cloudOnly: true })).toBe('none')
    expect(deadlockReviewState({ game: 'deadlock', hasLocalFile: false })).toBe('none')
    expect(deadlockReviewState({ game: 'deadlock', analysisReadiness: { ready: true } })).toBe('none')
  })
  it('shows progress instead of a second (paid) review', () => {
    expect(deadlockReviewState({ game: 'deadlock', hasLocalFile: true, deadlockReviewJobId: 'job-12345678' })).toBe('in_progress')
  })
})
