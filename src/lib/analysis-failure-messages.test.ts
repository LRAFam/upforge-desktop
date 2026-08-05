import { describe, expect, it } from 'vitest'
import {
  buildAnalysisErrorPayload,
  classifyAnalysisFailure,
  formatAnalysisFailureMessage,
  getDegradedReportNotice,
  isDegradedTelemetryResult,
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

  it('marks generic server errors as retryable', () => {
    const p = classifyAnalysisFailure('Server error')
    expect(p.creditRefunded).toBe(false)
    expect(p.canRetry).toBe(true)
  })

  it('does not claim refund for quota errors', () => {
    const p = classifyAnalysisFailure('analysis.limit.reached')
    expect(p.kind).toBe('quota_required')
    expect(p.creditRefunded).toBe(false)
  })

  it('classifies free analysis wall as quota_required', () => {
    const p = classifyAnalysisFailure(
      'You have used your free analysis. Upgrade to Plus or Pro for ongoing coaching, or pay per analysis on the web.',
    )
    expect(p.kind).toBe('quota_required')
    expect(p.canRetry).toBe(false)
  })

  it('classifies preparing failures as preparation', () => {
    const p = classifyAnalysisFailure('Preparing did not complete — open the dashboard')
    expect(p.kind).toBe('preparation')
    expect(p.canRetry).toBe(true)
  })

  it('maps API outage errors to temporary unavailable copy', () => {
    const p = classifyAnalysisFailure('Request failed (500)')
    expect(p.title).toBe('UpForge is temporarily unavailable')
    expect(p.creditRefunded).toBe(false)
    expect(p.message).not.toContain('SQLSTATE')
  })

  it('maps moov atom ffmpeg errors to incomplete recording copy', () => {
    const p = classifyAnalysisFailure(
      'ffmpeg exited 3199971767: moov atom not found Error opening input file C:\\Users\\Adam\\recordings\\match.mp4',
    )
    expect(p.kind).toBe('upload')
    expect(p.title).toBe('Recording file is incomplete')
    expect(p.message).not.toContain('ffmpeg')
    expect(p.canRetry).toBe(false)
  })

  it('maps duel clip extractor missing-file errors to incomplete recording copy', () => {
    const p = classifyAnalysisFailure(
      'Recording file is incomplete or missing — cannot extract duel clips',
    )
    expect(p.kind).toBe('upload')
    expect(p.title).toBe('Recording file is incomplete')
    expect(p.canRetry).toBe(false)
  })

  it('maps demo match-stats errors to demo-specific copy (not Riot)', () => {
    const p = classifyAnalysisFailure(
      'Match stats from the demo were not available in time. Wait until the demo finishes downloading after the game, then try Analyse again.',
    )
    expect(p.kind).toBe('refunded_data')
    expect(p.title).toBe('Match stats were not ready')
    expect(p.message).not.toContain('Riot')
    expect(p.message).toContain('demo')
    expect(p.canRetry).toBe(true)
  })

  it('maps S3 SlowDown XML to throttled upload copy', () => {
    const raw = 'S3 upload failed (HTTP 503): <?xml version="1.0"?><Error><Code>SlowDown</Code><Message>Please reduce your request rate.</Message></Error>'
    const p = classifyAnalysisFailure(raw)
    expect(p.kind).toBe('upload')
    expect(p.title).toBe('Upload temporarily throttled')
    expect(p.message).not.toContain('<?xml')
  })

  it('maps socket hang up to upload connection dropped copy', () => {
    const p = classifyAnalysisFailure('socket hang up')
    expect(p.kind).toBe('upload')
    expect(p.title).toBe('Upload connection dropped')
    expect(p.message).not.toContain('socket hang up')
    expect(p.canRetry).toBe(true)
  })

  it('maps NoSuchUpload to expired session copy', () => {
    const raw = 'S3 part upload failed (HTTP 404): <?xml version="1.0"?><Error><Code>NoSuchUpload</Code><Message>The specified upload does not exist.</Message></Error>'
    const p = classifyAnalysisFailure(raw)
    expect(p.kind).toBe('upload')
    expect(p.title).toBe('Upload session expired')
    expect(p.message).not.toContain('NoSuchUpload')
    expect(p.canRetry).toBe(true)
  })
})

describe('buildAnalysisErrorPayload', () => {
  it('includes recording id when provided', () => {
    const payload = buildAnalysisErrorPayload('Server error', { recordingId: 'rec-1' })
    expect(payload.recordingId).toBe('rec-1')
    expect(payload.title).toBeTruthy()
  })
})

describe('degraded telemetry helpers', () => {
  it('detects degraded telemetry results', () => {
    expect(isDegradedTelemetryResult({ report_type: 'degraded_telemetry' })).toBe(true)
    expect(isDegradedTelemetryResult({ coaching_source: 'telemetry_only' })).toBe(true)
    expect(isDegradedTelemetryResult({ is_degraded: true })).toBe(true)
    expect(isDegradedTelemetryResult({ is_degraded: true, telemetry_fallback_used: true })).toBe(true)
    expect(isDegradedTelemetryResult(null)).toBe(false)
  })

  it('returns stats-based notice copy', () => {
    const notice = getDegradedReportNotice()
    expect(notice.title).toContain('Stats-based')
    expect(notice.message.toLowerCase()).toContain('video')
  })
})
