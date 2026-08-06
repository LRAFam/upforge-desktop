import { describe, expect, it, vi } from 'vitest'
import {
  abortHeavyBackgroundWork,
  abortHeavyBackgroundWorkForMatchCapture,
  abortHeavyBackgroundWorkOnGameStart,
  shouldDeferHeavyBackgroundWork,
} from './match-priority-guard'
import { POST_MATCH_COPY } from '../../src/lib/post-match-copy'

describe('shouldDeferHeavyBackgroundWork', () => {
  it('does not defer when OBS is not actively recording', () => {
    expect(shouldDeferHeavyBackgroundWork({ isRecording: () => false })).toBe(false)
  })

  it('defers only while OBS is actively recording', () => {
    expect(shouldDeferHeavyBackgroundWork({ isRecording: () => true })).toBe(true)
  })

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

  it('logs shared pause copy while waiting', async () => {
    const { waitUntilBackgroundWorkAllowed } = await import('./match-priority-guard')
    const logActivity = vi.fn()
    let recording = true
    const wait = waitUntilBackgroundWorkAllowed(
      { isRecording: () => recording },
      { logActivity, intervalMs: 20 },
    )
    setTimeout(() => { recording = false }, 30)
    await wait
    expect(logActivity).toHaveBeenCalledWith(POST_MATCH_COPY.pausedUntilGameEnds)
  })
})

describe('abortHeavyBackgroundWork', () => {
  it('aborts uploads and compression and reports interrupted ids', () => {
    const abortUploads = vi.fn()
    const abortVodCompression = vi.fn(() => true)
    const onUploadInterrupted = vi.fn()
    const result = abortHeavyBackgroundWork({
      reason: 'match_capture',
      abortUploads,
      abortVodCompression,
      activeUploadIds: new Set(['rec-1', 'rec-2']),
      onUploadInterrupted,
    })
    expect(abortUploads).toHaveBeenCalledOnce()
    expect(abortVodCompression).toHaveBeenCalledOnce()
    expect(onUploadInterrupted).toHaveBeenCalledWith(['rec-1', 'rec-2'])
    expect(result.interruptedCount).toBe(2)
  })

  it('still aborts with zero active upload ids', () => {
    const abortUploads = vi.fn()
    const result = abortHeavyBackgroundWork({ reason: 'game_start', abortUploads })
    expect(abortUploads).toHaveBeenCalledOnce()
    expect(result.interruptedCount).toBe(0)
  })
})

describe('legacy abort aliases', () => {
  it('abortHeavyBackgroundWorkOnGameStart delegates', () => {
    const abortUploads = vi.fn()
    const abortVodCompression = vi.fn(() => true)
    abortHeavyBackgroundWorkOnGameStart({ abortUploads, abortVodCompression })
    expect(abortUploads).toHaveBeenCalledOnce()
    expect(abortVodCompression).toHaveBeenCalledOnce()
  })

  it('abortHeavyBackgroundWorkForMatchCapture delegates', () => {
    const abortUploads = vi.fn()
    const result = abortHeavyBackgroundWorkForMatchCapture({
      abortUploads,
      activeUploadIds: new Set(['a']),
      onUploadInterrupted: vi.fn(),
    })
    expect(abortUploads).toHaveBeenCalledOnce()
    expect(result.interruptedCount).toBe(1)
  })
})
