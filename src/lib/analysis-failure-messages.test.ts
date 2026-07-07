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

  it('marks generic server errors as retryable', () => {
    const p = classifyAnalysisFailure('Server error')
    expect(p.creditRefunded).toBe(false)
    expect(p.canRetry).toBe(true)
  })

  it('does not claim refund for quota errors', () => {
    const p = classifyAnalysisFailure('analysis.limit.reached')
    expect(p.kind).toBe('quota')
    expect(p.creditRefunded).toBe(false)
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
