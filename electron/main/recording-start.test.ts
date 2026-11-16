import { afterEach, describe, expect, it, vi } from 'vitest'
import { startRecordingWhenReady, startRecordingWithRetry } from './recording-start'

afterEach(() => vi.useRealTimers())

describe('recording startup deadline', () => {
  it('never starts a recording after readiness exceeded the deadline', async () => {
    vi.useFakeTimers()
    let ready!: () => void
    const readiness = new Promise<void>(resolve => { ready = resolve })
    const start = vi.fn().mockResolvedValue(undefined)
    const result = expect(startRecordingWhenReady({ ensureReady: () => readiness, start, timeoutMs: 90_000 }))
      .rejects.toThrow('OBS start timed out')
    await vi.advanceTimersByTimeAsync(90_000)
    await result
    ready()
    await vi.advanceTimersByTimeAsync(1)
    expect(start).not.toHaveBeenCalled()
  })

  it('starts once when readiness completes within the deadline', async () => {
    const start = vi.fn().mockResolvedValue(undefined)
    await startRecordingWhenReady({ ensureReady: async () => {}, start, timeoutMs: 90_000 })
    expect(start).toHaveBeenCalledOnce()
  })

  it('preserves readiness errors without starting capture', async () => {
    const start = vi.fn()
    await expect(startRecordingWhenReady({
      ensureReady: async () => { throw new Error('OBS unavailable') }, start, timeoutMs: 90_000,
    })).rejects.toThrow('OBS unavailable')
    expect(start).not.toHaveBeenCalled()
  })

  it('cancels immediately when a match ends before OBS readiness completes', async () => {
    let ready!: () => void
    const controller = new AbortController()
    const start = vi.fn()
    const result = expect(startRecordingWhenReady({
      ensureReady: () => new Promise<void>(resolve => { ready = resolve }),
      start, timeoutMs: 90_000, signal: controller.signal,
    })).rejects.toThrow('startup cancelled')
    controller.abort()
    await result
    ready()
    await Promise.resolve()
    expect(start).not.toHaveBeenCalled()
  })

  it('propagates match cancellation into an already entered recorder start', async () => {
    const controller = new AbortController()
    let entered!: () => void
    const startEntered = new Promise<void>(resolve => { entered = resolve })
    let startSignal: AbortSignal | undefined
    const result = expect(startRecordingWhenReady({
      ensureReady: async () => {},
      start: async signal => { startSignal = signal; entered(); await new Promise(() => {}) },
      timeoutMs: 90_000, signal: controller.signal,
    })).rejects.toThrow('startup cancelled')
    await startEntered
    controller.abort()
    await result
    expect(startSignal?.aborted).toBe(true)
  })
})

describe('recording start retry during the match', () => {
  const noSleep = async () => {}
  const retryable = (msg: string) => !/already recording/i.test(msg)

  it('a first-attempt failure is retried and the second attempt records the rest of the match', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('OBS recording failed to start: OBS StartRecord did not become active within 5s'))
      .mockResolvedValueOnce(undefined)
    const onRetry = vi.fn()
    await startRecordingWithRetry({ attempt, isRetryable: retryable, isCancelled: () => false, sleep: noSleep, onRetry })
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenCalledWith(2, 10_000, expect.stringMatching(/did not become active/))
  })

  it('gives up after the last delay and throws the last error', async () => {
    const attempt = vi.fn().mockRejectedValue(new Error('OBS start timed out'))
    await expect(startRecordingWithRetry({ attempt, isRetryable: retryable, isCancelled: () => false, sleep: noSleep }))
      .rejects.toThrow('OBS start timed out')
    expect(attempt).toHaveBeenCalledTimes(3)
  })

  it('does not retry errors the player has to fix (OBS already recording)', async () => {
    const attempt = vi.fn().mockRejectedValue(new Error('OBS is already recording'))
    await expect(startRecordingWithRetry({ attempt, isRetryable: retryable, isCancelled: () => false, sleep: noSleep }))
      .rejects.toThrow('already recording')
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('stops retrying when the match ends during the wait', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const attempt = vi.fn().mockRejectedValue(new Error('OBS start timed out'))
    const run = startRecordingWithRetry({ attempt, isRetryable: retryable, isCancelled: () => false, signal: controller.signal })
    const result = expect(run).rejects.toThrow('OBS start timed out')
    await vi.advanceTimersByTimeAsync(2_000)
    controller.abort()
    await result
    expect(attempt).toHaveBeenCalledTimes(1)
  })
})
