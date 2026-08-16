import { describe, expect, it } from 'vitest'
import {
  extractAnalysisIdFromPollResult,
  extractAnalysisIdFromPollStatus,
  isTerminalPollSuccess,
} from './analysis-completion'

describe('extractAnalysisIdFromPollResult', () => {
  it('reads analysis_id or analysis_log_id from result payload', () => {
    expect(extractAnalysisIdFromPollResult({ analysis_id: 12 })).toBe(12)
    expect(extractAnalysisIdFromPollResult({ analysis_log_id: 34 })).toBe(34)
  })
})

describe('extractAnalysisIdFromPollStatus', () => {
  it('prefers top-level analysis_log_id from desktop status API', () => {
    expect(
      extractAnalysisIdFromPollStatus({
        status: 'completed',
        progress: 100,
        analysis_log_id: 518,
        result: { overall_score: 72 },
      }),
    ).toBe(518)
  })

  it('falls back to result.analysis_id', () => {
    expect(
      extractAnalysisIdFromPollStatus({
        status: 'completed',
        result: { analysis_id: 99 },
      }),
    ).toBe(99)
  })
})

describe('isTerminalPollSuccess', () => {
  it('treats completed + top-level analysis_log_id as done when result is absent', () => {
    expect(
      isTerminalPollSuccess({
        status: 'completed',
        progress: 100,
        analysis_log_id: 525,
      }),
    ).toBe(true)
  })
})
