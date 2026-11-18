import { afterEach, describe, expect, it, vi } from 'vitest'

const pollStatus = vi.fn()
const upload = vi.fn(async (): Promise<{ jobId: string }> => ({ jobId: 'job-1' }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))
vi.mock('./demo-timeline', () => ({ buildTimelineFromDemo: vi.fn() }))
vi.mock('./source-replay-finder', () => ({ findLatestReplay: vi.fn() }))
vi.mock('./source-replay-uploader', () => ({
  SourceReplayUploader: class {
    upload = upload
    pollStatus = pollStatus
  },
}))

import { uploadReplayInBackground } from './post-match-replay'
import { ReplayTooLargeError } from './errors'

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

describe('uploadReplayInBackground: replay over the size limit', () => {
  it('shows the size message instead of a generic upload failure', async () => {
    upload.mockRejectedValueOnce(new ReplayTooLargeError('This replay (512 MB) is too large to analyse: the limit is 400 MB.'))
    const { send, win } = fakeWindow()
    await expect(uploadReplayInBackground('deadlock', '/x.dem', auth, win)).resolves.toEqual({ status: 'error' })
    expect(send).toHaveBeenCalledWith('post-game:demo-status', { status: 'error', error: 'This replay (512 MB) is too large to analyse: the limit is 400 MB.' })
    expect(pollStatus).not.toHaveBeenCalled()
  })
})
