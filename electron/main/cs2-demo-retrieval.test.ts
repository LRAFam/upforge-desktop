import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Cs2DemoRetrieval, cs2DemoRetrievalStatus } from './cs2-demo-retrieval'
import { CS2_DEMO_SYNC_MAX_MS } from './match-data-quality'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000) })
afterEach(() => { vi.useRealTimers(); cs2DemoRetrievalStatus.clear() })

function setup() {
  const rec = { recordedAt: Date.now(), complete: false }
  const deps = {
    getRecording: vi.fn((): typeof rec | null => rec),
    retrieve: vi.fn(async () => false),
    deferred: vi.fn(() => false),
    changed: vi.fn(),
    ready: vi.fn(),
  }
  return { rec, deps, worker: new Cs2DemoRetrieval(deps) }
}

describe('CS2 demo retrieval', () => {
  it('retries a missing demo and stops as soon as it is attached', async () => {
    const { worker, deps } = setup()
    deps.retrieve.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    worker.start('rec')
    await vi.advanceTimersByTimeAsync(0)
    expect(deps.retrieve).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(deps.retrieve).toHaveBeenCalledTimes(2)
    expect(deps.ready).toHaveBeenCalledWith('rec')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(deps.retrieve).toHaveBeenCalledTimes(2)
  })

  it('deduplicates starts and never overlaps a slow retrieval', async () => {
    const { worker, deps } = setup()
    let resolve!: (value: boolean) => void
    deps.retrieve.mockImplementation(() => new Promise(r => { resolve = r }))
    worker.start('rec')
    worker.start('rec')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(deps.retrieve).toHaveBeenCalledTimes(1)
    resolve(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(deps.ready).toHaveBeenCalledTimes(1)
  })

  it('pauses during recording and resumes automatically', async () => {
    const { worker, deps } = setup()
    deps.deferred.mockReturnValue(true)
    worker.start('rec')
    await vi.advanceTimersByTimeAsync(0)
    expect(deps.retrieve).not.toHaveBeenCalled()
    expect(cs2DemoRetrievalStatus.get('rec')?.message).toContain('paused')
    deps.deferred.mockReturnValue(false)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(deps.retrieve).toHaveBeenCalledTimes(1)
  })

  it('surfaces thrown errors and continues retrying', async () => {
    const { worker, deps } = setup()
    deps.retrieve.mockRejectedValueOnce(new Error('Steam lookup timed out'))
    worker.start('rec')
    await vi.advanceTimersByTimeAsync(0)
    expect(cs2DemoRetrievalStatus.get('rec')?.message).toBe('Steam lookup timed out')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(deps.retrieve).toHaveBeenCalledTimes(2)
  })

  it('stops at the retry deadline without pretending to download', async () => {
    const { worker, deps, rec } = setup()
    worker.start('rec')
    await vi.advanceTimersByTimeAsync(CS2_DEMO_SYNC_MAX_MS)
    const attempts = deps.retrieve.mock.calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(deps.retrieve).toHaveBeenCalledTimes(attempts)
    expect(cs2DemoRetrievalStatus.get('rec')?.state).toBe('waiting_match_data')
    expect(cs2DemoRetrievalStatus.get('rec')?.message).toContain('stopped')
  })

  it('does not spend the retry budget while another match is being played', async () => {
    const { worker, deps } = setup()
    worker.start('rec')
    await vi.advanceTimersByTimeAsync(0)
    deps.deferred.mockReturnValue(true)
    await vi.advanceTimersByTimeAsync(50 * 60_000)
    deps.deferred.mockReturnValue(false)
    deps.retrieve.mockResolvedValue(true)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(deps.ready).toHaveBeenCalledWith('rec')
  })

  it('gives an older pending recording a fresh retry budget on reopening', async () => {
    const { worker, deps, rec } = setup()
    rec.recordedAt -= 60 * 60_000
    deps.retrieve.mockResolvedValue(true)
    worker.start('rec')
    await vi.advanceTimersByTimeAsync(0)
    expect(deps.retrieve).toHaveBeenCalledTimes(1)
    expect(deps.ready).toHaveBeenCalledWith('rec')
  })

  it('discards an in-flight completion after logout', async () => {
    const { worker, deps } = setup()
    let resolve!: (value: boolean) => void
    deps.retrieve.mockImplementation(() => new Promise(r => { resolve = r }))
    worker.start('rec')
    await vi.advanceTimersByTimeAsync(0)
    worker.clear()
    resolve(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(deps.ready).not.toHaveBeenCalled()
    expect(deps.changed).not.toHaveBeenCalled()
    expect(deps.retrieve).toHaveBeenCalledTimes(1)
  })

  it('stops when the recording is deleted or manually attached', async () => {
    const { worker, deps, rec } = setup()
    worker.start('rec')
    await vi.advanceTimersByTimeAsync(0)
    rec.complete = true
    await vi.advanceTimersByTimeAsync(5_000)
    expect(deps.retrieve).toHaveBeenCalledTimes(1)
    deps.getRecording.mockReturnValue(null)
    worker.start('deleted')
    await vi.advanceTimersByTimeAsync(0)
    expect(deps.retrieve).toHaveBeenCalledTimes(1)
  })
})
