import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', getAppPath: () => '/tmp', isPackaged: false },
}))

import { buildDesktopPresignBody, type UploadOptions } from './upload-manager'

function options(recordingId?: string, onboardingBonus = false): UploadOptions {
  return {
    videoPath: '/tmp/match.mp4',
    riotName: 'Player',
    riotTag: 'EUW',
    game: 'valorant',
    map: 'Ascent',
    agent: 'Sova',
    timeline: null,
    recordingId,
    onboardingBonus,
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

  it('claims the onboarding bonus only when the recording is explicitly tagged', () => {
    expect(buildDesktopPresignBody(options('11111111-1111-4111-8111-111111111111', true), 1234))
      .toHaveProperty('onboarding_bonus', true)
    expect(buildDesktopPresignBody(options(), 1234)).not.toHaveProperty('onboarding_bonus')
  })

  it('marks admin onboarding tests explicitly', () => {
    const opts = options('11111111-1111-4111-8111-111111111111', true)
    opts.onboardingAdminTest = true

    expect(buildDesktopPresignBody(opts, 1234)).toMatchObject({
      onboarding_bonus: true,
      onboarding_admin_test: true,
    })
  })
})
