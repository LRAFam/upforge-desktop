import { describe, expect, it } from 'vitest'
import {
  classifyActivationError,
  isQuotaErrorCode,
  getActivationError,
} from './activation-error-codes'

describe('classifyActivationError', () => {
  it('maps OBS not connected', () => {
    const c = classifyActivationError(
      'OBS is not connected. UpForge will keep trying to start it, or the user can click Launch OBS in Settings → Recording.',
    )
    expect(c.code).toBe('obs_not_connected')
    expect(c.userMessage).not.toMatch(/WebSocket/i)
  })

  it('maps websocket password guidance', () => {
    const c = classifyActivationError(
      'OBS is not connected. The user needs to enable WebSocket in OBS and configure the password.',
    )
    expect(c.code).toBe('obs_authentication_failed')
  })

  it('maps missing UpForge source / canvas Main wording', () => {
    const c = classifyActivationError(
      'No source named `UpForge` was found within the canvas `Main`.',
    )
    expect(c.code).toBe('obs_source_missing')
    expect(c.userMessage).toMatch(/Repair Setup/)
  })

  it('maps StartRecord timeout', () => {
    const c = classifyActivationError('OBS StartRecord did not become active within 5 seconds.')
    expect(c.code).toBe('obs_recording_start_timeout')
  })

  it('maps preparing safety nets', () => {
    expect(classifyActivationError('Preparing did not complete — open the dashboard').code).toBe(
      'preparation_settled_stuck',
    )
    expect(
      classifyActivationError('Preparing is taking longer than expected — open the dashboard').code,
    ).toBe('preparation_timeout')
  })

  it('maps quota as quota_required not upload', () => {
    const c = classifyActivationError(
      'You have used your free analysis. Upgrade to Plus or Pro for ongoing coaching, or pay per analysis on the web.',
    )
    expect(c.code).toBe('quota_required')
    expect(isQuotaErrorCode(c.code)).toBe(true)
    expect(c.definition.category).toBe('quota')
  })

  it('maps analysis_limit_reached code string', () => {
    expect(classifyActivationError('analysis_limit_reached').code).toBe('quota_required')
  })

  it('maps upload aborted', () => {
    expect(classifyActivationError('Upload aborted').code).toBe('upload_aborted_by_user')
    expect(classifyActivationError('upload_aborted_by_user: Upload cancelled').code).toBe(
      'upload_aborted_by_user',
    )
  })

  it('maps upload stalled and network interrupted', () => {
    expect(classifyActivationError('upload_stalled: S3 upload stalled').code).toBe('upload_stalled')
    expect(classifyActivationError('upload_network_interrupted: socket hang up').code).toBe(
      'upload_network_interrupted',
    )
  })

  it('maps only failed jobs can be retried', () => {
    expect(classifyActivationError('Only failed jobs can be retried.').code).toBe(
      'upload_retry_invalid_state',
    )
  })

  it('maps file too large', () => {
    expect(classifyActivationError('The file size exceeded 2684354560 bytes.').code).toBe(
      'recording_file_too_large',
    )
  })

  it('maps insufficient duel observations', () => {
    const c = classifyActivationError(
      'Insufficient duel observations (0/1 with video insight). Coaching was not generated from reviewed clips.',
    )
    expect(c.code).toBe('insufficient_video_observations')
  })

  it('preserves technical message for diagnostics', () => {
    const raw = 'No source named `UpForge` was found within the canvas `Main`.'
    const c = classifyActivationError(raw)
    expect(c.technicalMessage).toBe(raw)
    expect(c.userMessage).not.toBe(raw)
  })

  it('getActivationError falls back to unknown', () => {
    expect(getActivationError('nope').code).toBe('unknown')
  })
})
