import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', getAppPath: () => '/tmp', isPackaged: false },
}))

import { buildDesktopPresignBody, type UploadOptions } from './upload-manager'

function options(recordingId?: string): UploadOptions {
  return {
    videoPath: '/tmp/match.mp4',
    riotName: 'Player',
    riotTag: 'EUW',
    game: 'valorant',
    map: 'Ascent',
    agent: 'Sova',
    timeline: null,
    recordingId,
    onProgress: () => {},
  }
}

describe('desktop presign contract', () => {
  it('sends the canonical local recording id', () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'

    expect(buildDesktopPresignBody(options(recordingId), 1234)).toMatchObject({
      client_recording_id: recordingId,
      file_size_bytes: 1234,
    })
  })

  it('does not invent a recording id for legacy upload callers', () => {
    expect(buildDesktopPresignBody(options(), 1234)).not.toHaveProperty('client_recording_id')
  })
})
