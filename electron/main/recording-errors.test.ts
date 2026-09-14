import { describe, it, expect, vi } from 'vitest'
import { reportRecordingError } from './recording-errors'
import { reportError } from './error-reporter'
vi.mock('./error-reporter', () => ({ reportError: vi.fn() }))
vi.mock('electron-log', () => ({ default: { warn: vi.fn() } }))

describe('recording error diagnostics', () => {
  it('preserves the actual thrown stack and recording context', () => {
    const error = new Error('OBS failed to start')
    reportRecordingError('start', error, { recording_context: { game: 'cs2', obs_studio_version: '32.2.1' } })
    expect(reportError).toHaveBeenLastCalledWith(expect.objectContaining({
      stack: error.stack,
      extra: { phase: 'start', recording_context: { game: 'cs2', obs_studio_version: '32.2.1' } },
    }))
  })
  it('does not invent a stack when only an event message exists', () => {
    reportRecordingError('mid-match', 'Recording stalled')
    expect(reportError).toHaveBeenLastCalledWith(expect.objectContaining({ stack: undefined }))
  })
})
