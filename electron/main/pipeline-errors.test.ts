import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reportPipelineError, shouldReportAnalysisPipelineError } from './pipeline-errors'
import { reportError } from './error-reporter'
import { reportRecordingError } from './recording-errors'
import { classifyAnalysisFailure } from '../../src/lib/analysis-failure-messages'

vi.mock('./error-reporter', () => ({ reportError: vi.fn() }))
vi.mock('electron-log', () => ({ default: { warn: vi.fn() } }))

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

// Expected outcomes (plan limits, cancellations, user setup) are shown in the app and must not
// reach the error log; real failures must still be reported.
describe('reportPipelineError: expected outcomes vs real failures', () => {
  beforeEach(() => vi.mocked(reportError).mockClear())

  it.each([
    ['duel-clips', 'Duel clip upload failed during complete(): upload_aborted_by_user: Upload cancelled'],
    ['upload', 'upload_aborted_by_user: Upload cancelled'],
    ['upload', 'Upload was cancelled'],
    ['analysis', 'You have used your free analysis. Upgrade to Plus or Pro for ongoing coaching, or pay per analysis on the web.'],
    ['upload', 'analysis.limit.reached'],
    // A second submission while the same file is still uploading is refused and shown as such.
    ['upload', 'upload_already_in_progress: This recording is already uploading'],
  ] as const)('does not report %s: %s', (phase, message) => {
    reportPipelineError(phase, message)
    expect(reportError).not.toHaveBeenCalled()
  })

  it.each([
    ['upload', 'Presign failed: signature mismatch xyz'],
    ['duel-clips', 'Duel clip upload failed during complete(): ffmpeg exited with code 1'],
    ['analysis', "Cannot read properties of undefined (reading 'jobId')"],
    ['upload', 'Upload complete failed (HTTP 400): invalid recording metadata'],
  ] as const)('reports %s: %s', (phase, message) => {
    reportPipelineError(phase, message)
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({
      message: `[Pipeline:${phase}] ${message}`,
      component: `desktop:Pipeline:${phase}`,
    }))
  })

  it('does not report an analysis with no reviewable moments (refunded, shown as such)', () => {
    const presented = classifyAnalysisFailure('duel_moments manifest missing')
    expect(presented.title).toBe('No reviewable moments')
    expect(shouldReportAnalysisPipelineError(presented.kind, '')).toBe(false)
  })

  it('does not report OBS already recording, but reports an OBS start failure', () => {
    reportRecordingError(
      'start',
      new Error('OBS is already recording — stop the current OBS recording before a match capture starts.'),
    )
    expect(reportError).not.toHaveBeenCalled()
    reportRecordingError('start', new Error('OBS failed to start the recording output'))
    expect(reportError).toHaveBeenCalledTimes(1)
  })
})
