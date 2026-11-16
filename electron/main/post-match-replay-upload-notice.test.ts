import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ find: vi.fn(), upload: vi.fn() }))
vi.mock('./source-replay-finder', () => ({ findLatestReplay: mocks.find }))
vi.mock('./demo-timeline', () => ({ buildTimelineFromDemo: vi.fn() }))
vi.mock('./source-replay-uploader', () => ({
  SourceReplayUploader: vi.fn(() => ({ upload: mocks.upload })),
}))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { tryAutoUploadSourceReplay } from './post-match-replay'

const base = {
  matchSessionStart: 1000,
  auth: {} as never,
  notifyWindow: null,
}

describe('tryAutoUploadSourceReplay upload notice', () => {
  beforeEach(() => {
    mocks.find.mockReset()
    mocks.upload.mockReset()
  })

  it('CS2 with no demo: no upload, no "uploading" notice', async () => {
    const onUploadStarting = vi.fn()
    const started = await tryAutoUploadSourceReplay({ ...base, game: 'cs2', demoPath: null, onUploadStarting })
    expect(started).toBe(false)
    expect(onUploadStarting).not.toHaveBeenCalled()
    expect(mocks.find).not.toHaveBeenCalled()
  })

  it('Deadlock with no replay on disk: no "uploading" notice', async () => {
    mocks.find.mockResolvedValue({ demoPath: null })
    const onUploadStarting = vi.fn()
    const started = await tryAutoUploadSourceReplay({ ...base, game: 'deadlock', demoPath: null, onUploadStarting })
    expect(started).toBe(false)
    expect(onUploadStarting).not.toHaveBeenCalled()
  })

  it('announces the upload once a replay file is found', async () => {
    mocks.find.mockResolvedValue({ demoPath: 'C:/replays/match.dem' })
    const onUploadStarting = vi.fn()
    const started = await tryAutoUploadSourceReplay({ ...base, game: 'deadlock', demoPath: null, onUploadStarting })
    expect(started).toBe(true)
    expect(onUploadStarting).toHaveBeenCalledWith('C:/replays/match.dem')
  })
})
