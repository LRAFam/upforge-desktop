import { describe, expect, it, vi } from 'vitest'
import {
  abortHeavyBackgroundWorkOnGameStart,
  shouldDeferHeavyBackgroundWork,
} from './match-priority-guard'

describe('shouldDeferHeavyBackgroundWork', () => {
  it('does not defer when OBS is not actively recording', () => {
    expect(shouldDeferHeavyBackgroundWork({ isRecording: () => false })).toBe(false)
  })

  it('defers only while OBS is actively recording', () => {
    expect(shouldDeferHeavyBackgroundWork({ isRecording: () => true })).toBe(true)
  })

  // Regression: a game merely being open (menu/lobby, not recording) must NOT defer uploads,
  // otherwise users hit a false "Upload paused — match recording" state. isActivelyRecording()
  // is false in that case, so the gate is false.
  it('does not defer when the game is open but nothing is recording', () => {
    expect(shouldDeferHeavyBackgroundWork({ isRecording: () => false })).toBe(false)
  })
})

describe('waitUntilBackgroundWorkAllowed', () => {
  it('returns immediately when skipDefer is set', async () => {
    const { waitUntilBackgroundWorkAllowed } = await import('./match-priority-guard')
    const started = Date.now()
    await waitUntilBackgroundWorkAllowed(
      { isRecording: () => true },
      { skipDefer: true },
    )
    expect(Date.now() - started).toBeLessThan(50)
  })
})

describe('abortHeavyBackgroundWorkOnGameStart', () => {
  it('invokes upload and compression abort hooks', () => {
    const abortUploads = vi.fn()
    const abortVodCompression = vi.fn(() => true)
    abortHeavyBackgroundWorkOnGameStart({ abortUploads, abortVodCompression })
    expect(abortUploads).toHaveBeenCalledOnce()
    expect(abortVodCompression).toHaveBeenCalledOnce()
  })
})
