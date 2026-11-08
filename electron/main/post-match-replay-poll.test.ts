import { afterEach, describe, expect, it, vi } from 'vitest'

const pollStatus = vi.fn()
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))
vi.mock('./demo-timeline', () => ({ buildTimelineFromDemo: vi.fn() }))
vi.mock('./source-replay-finder', () => ({ findLatestReplay: vi.fn() }))
vi.mock('./source-replay-uploader', () => ({
  SourceReplayUploader: class {
    upload = vi.fn(async () => ({ jobId: 'job-1' }))
    pollStatus = pollStatus
  },
}))

import { uploadReplayInBackground } from './post-match-replay'

function fakeWindow() {
  const send = vi.fn()
  return { send, win: { isDestroyed: () => false, webContents: { isLoading: () => false, send } } as never }
}
const auth = { getUser: () => null } as never

describe('uploadReplayInBackground polling', () => {
  afterEach(() => { vi.useRealTimers(); pollStatus.mockReset() })

  it('still finds a job that completes 25 minutes after upload', async () => {
    vi.useFakeTimers()
    const t0 = Date.now()
    pollStatus.mockImplementation(async () => ({ status: Date.now() - t0 >= 25 * 60_000 ? 'completed' : 'processing' }))
    const { send, win } = fakeWindow()
    const done = uploadReplayInBackground('cs2', '/x.dem', auth, win)
    await vi.advanceTimersByTimeAsync(45 * 60_000)
    await expect(done).resolves.toEqual({ jobId: 'job-1', status: 'completed' })
    expect(send).toHaveBeenCalledWith('post-game:demo-status', { status: 'complete', jobId: 'job-1' })
  })

  it('says still analysing (not failed) when the poll window ends', async () => {
    vi.useFakeTimers()
    pollStatus.mockResolvedValue({ status: 'processing' })
    const { send, win } = fakeWindow()
    const done = uploadReplayInBackground('deadlock', '/x.dem', auth, win)
    await vi.advanceTimersByTimeAsync(60 * 60_000)
    await expect(done).resolves.toEqual({ jobId: 'job-1', status: 'timeout' })
    const statuses = send.mock.calls.filter(c => c[0] === 'post-game:demo-status').map(c => (c[1] as { status: string }).status)
    expect(statuses.at(-1)).toBe('still_analysing')
    expect(statuses).not.toContain('error')
  })
})
