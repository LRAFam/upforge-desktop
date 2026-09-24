import { describe, expect, it } from 'vitest'
import { shouldReportAnalysisPipelineError } from './pipeline-errors'

describe('shouldReportAnalysisPipelineError', () => {
  it('skips the expected already-claimed bonus denial, but keeps unexpected bonus failures', () => {
    expect(shouldReportAnalysisPipelineError('upload', 'onboarding_bonus_unavailable')).toBe(false)
    expect(shouldReportAnalysisPipelineError('upload', 'onboarding bonus database failure')).toBe(true)
  })

  it('skips user-recoverable refunded failures', () => {
    expect(shouldReportAnalysisPipelineError('refunded_generic', 'credit refunded')).toBe(false)
    expect(shouldReportAnalysisPipelineError('refunded_data', 'match data not ready')).toBe(false)
    expect(shouldReportAnalysisPipelineError('integrity', 'insufficient duel observations')).toBe(false)
  })

  it('skips transient upload infrastructure errors', () => {
    expect(
      shouldReportAnalysisPipelineError('upload', 'S3 upload failed (HTTP 503): Service Unavailable'),
    ).toBe(false)
  })

  it('reports unexpected upload technical failures', () => {
    expect(
      shouldReportAnalysisPipelineError(
        'upload',
        'Presign failed: signature mismatch xyz',
      ),
    ).toBe(true)
  })

  it('still skips quota / user-recoverable analysis kinds', () => {
    expect(shouldReportAnalysisPipelineError('quota', 'analysis.limit.reached')).toBe(false)
    expect(shouldReportAnalysisPipelineError(
      'quota_required',
      'You have used your free analysis. Upgrade to Plus or Pro for ongoing coaching, or pay per analysis on the web.',
    )).toBe(false)
    expect(shouldReportAnalysisPipelineError('refunded_data', 'match data missing')).toBe(false)
  })
})
