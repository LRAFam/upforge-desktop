import { describe, expect, it } from 'vitest'
import { shouldReportAnalysisPipelineError } from './pipeline-errors'

describe('shouldReportAnalysisPipelineError', () => {
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
})
