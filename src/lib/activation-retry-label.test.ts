import { describe, it, expect } from 'vitest'
import { recordingRetryActionLabel } from './activation-retry-label'

describe('recordingRetryActionLabel', () => {
  it('maps preparation_ failure codes to Resume Preparation', () => {
    expect(recordingRetryActionLabel(null, 'preparation_timeout')).toBe('Resume Preparation')
    expect(recordingRetryActionLabel(undefined, '  preparation_failed  ')).toBe('Resume Preparation')
  })

  it('maps upload_ failure codes to Resume Upload', () => {
    expect(recordingRetryActionLabel(null, 'upload_stalled')).toBe('Resume Upload')
    expect(recordingRetryActionLabel(null, '\tupload_aborted\n')).toBe('Resume Upload')
  })

  it('falls back to error text for preparation failures', () => {
    expect(recordingRetryActionLabel('preparation_timeout reached')).toBe('Resume Preparation')
    expect(recordingRetryActionLabel('Preparing did not finish in time')).toBe('Resume Preparation')
    expect(recordingRetryActionLabel('PREPARING DID NOT complete')).toBe('Resume Preparation')
  })

  it('falls back to error text for upload failures in any letter case', () => {
    expect(recordingRetryActionLabel('Upload stalled at 40%')).toBe('Resume Upload')
    expect(recordingRetryActionLabel('UPLOAD STALLED')).toBe('Resume Upload')
    expect(recordingRetryActionLabel('Error: socket hang up')).toBe('Resume Upload')
    expect(recordingRetryActionLabel('SOCKET HANG UP')).toBe('Resume Upload')
    expect(recordingRetryActionLabel('read ECONNRESET')).toBe('Resume Upload')
    expect(recordingRetryActionLabel('read econnreset')).toBe('Resume Upload')
    expect(recordingRetryActionLabel('read EconnReset')).toBe('Resume Upload')
  })

  it('gives the failure code priority over the error text', () => {
    expect(recordingRetryActionLabel('upload stalled', 'preparation_timeout')).toBe('Resume Preparation')
    expect(recordingRetryActionLabel('preparing did not finish', 'upload_failed')).toBe('Resume Upload')
  })

  it('uses error text when the failure code is unrecognised', () => {
    expect(recordingRetryActionLabel('socket hang up', 'unknown_error')).toBe('Resume Upload')
    expect(recordingRetryActionLabel('something broke', 'unknown_error')).toBe('Retry')
  })

  it('returns Retry for null, undefined and empty inputs', () => {
    expect(recordingRetryActionLabel()).toBe('Retry')
    expect(recordingRetryActionLabel(null, null)).toBe('Retry')
    expect(recordingRetryActionLabel('', '')).toBe('Retry')
    expect(recordingRetryActionLabel('   ', '   ')).toBe('Retry')
  })
})
