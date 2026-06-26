import { describe, expect, it } from 'vitest'
import {
  buildAnalysisErrorPayload,
  classifyAnalysisFailure,
  formatAnalysisFailureMessage,
} from './analysis-failure-messages'

describe('formatAnalysisFailureMessage', () => {
  it('maps insufficient duel observations to integrity kind with refund', () => {
    const p = classifyAnalysisFailure(
      'Insufficient duel observations — coaching was not generated from reviewed video clips.',
    )
    expect(p.kind).toBe('integrity')
    expect(p.creditRefunded).toBe(true)
    expect(formatAnalysisFailureMessage(
      'Insufficient duel observations — coaching was not generated from reviewed video clips.',
    )).toContain('duel clips')
  })

  it('marks generic server errors as refunded', () => {
    const p = classifyAnalysisFailure('Server error')
    expect(p.creditRefunded).toBe(true)
    expect(p.canRetry).toBe(true)
  })

  it('does not claim refund for quota errors', () => {
    const p = classifyAnalysisFailure('analysis.limit.reached')
    expect(p.kind).toBe('quota')
    expect(p.creditRefunded).toBe(false)
  })
})

describe('buildAnalysisErrorPayload', () => {
  it('includes recording id when provided', () => {
    const payload = buildAnalysisErrorPayload('Server error', { recordingId: 'rec-1' })
    expect(payload.recordingId).toBe('rec-1')
    expect(payload.title).toBeTruthy()
  })
})
