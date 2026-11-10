import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', getAppPath: () => '/tmp', isPackaged: false },
}))

import { buildDesktopPresignBody, UploadManager, type UploadOptions } from './upload-manager'
import type { AuthManager } from './auth-manager'

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
  it.each(['valorant', 'cs2', 'deadlock', 'lol'])('sends explicit focus for %s even with deferred match data', (game) => {
    const opts = { ...options(), game, focusAreas: ['Positioning'], deferMatchDataOnPresign: true }
    expect(buildDesktopPresignBody(opts, 1234)).toMatchObject({ game, focus_areas: ['Positioning'] })
  })
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

it('carries the exact focus through completion, archive analysis and retry without a global setting', async () => {
  const manager = new UploadManager({ getToken: () => 'test' } as AuthManager)
  const calls: Array<{ url: string; body: Record<string, unknown> }> = []
  const internal = manager as unknown as {
    _apiPost: (url: string, body: string) => Promise<Record<string, unknown>>
    _putToS3: () => Promise<void>
    _finishUploadOnce: (...args: unknown[]) => Promise<unknown>
  }
  internal._apiPost = async (url, body) => { calls.push({ url, body: JSON.parse(body) }); return { job_id: 'job' } }
  internal._putToS3 = async () => {}
  const focus = ['Trading after teammate contact']
  const opts = { ...options(), focusAreas: focus }
  await internal._finishUploadOnce(opts, 1, { upload_url: 'https://upload.invalid' }, 'job', 'test', 0,
    'https://api.invalid', 100, { setProgress() {} }, 1)
  await manager.analyseArchive('archive', 'deadlock', null, undefined, focus)
  await manager.retrySubmission('job', focus)
  expect(calls.map(call => call.body.focus_areas)).toEqual([focus, focus, focus])
  await manager.analyseArchive('other-archive', 'cs2')
  expect(calls.at(-1)?.body).not.toHaveProperty('focus_areas')
})
