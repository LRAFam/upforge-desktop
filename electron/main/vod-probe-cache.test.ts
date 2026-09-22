import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearVodProbeCache, refreshVodProbe, getVodFileReadiness } from './analysis-readiness'
import type { PendingRecording } from './recordings-store'

vi.mock('fs', () => ({ default: {
  existsSync: () => true,
  statSync: () => ({ mtimeMs: 1, size: 10_000_000 }),
} }))

describe('VOD probe cache', () => {
  beforeEach(() => { clearVodProbeCache(); vi.useFakeTimers() })
  afterEach(() => vi.useRealTimers())

  it('shares overlapping checks of the same recording', async () => {
    let finish!: (result: { ok: boolean }) => void
    const probe = vi.fn(() => new Promise<{ ok: boolean }>((resolve) => { finish = resolve }))
    const first = refreshVodProbe('recording.mp4', probe)
    const second = refreshVodProbe('recording.mp4', probe)
    expect(probe).toHaveBeenCalledTimes(1)
    finish({ ok: true })
    expect(await first).toEqual({ ok: true })
    expect(await second).toEqual({ ok: true })
  })

  it('lets the listing advance past a hung recording check', async () => {
    const result = refreshVodProbe('stuck.mp4', () => new Promise(() => {}))
    await vi.advanceTimersByTimeAsync(45_000)
    expect(await result).toMatchObject({ ok: false, reason: expect.stringContaining('timed out') })
    expect(await refreshVodProbe('next.mp4', async () => ({ ok: true }))).toEqual({ ok: true })
  })

  it('blocks the 93-minute file with a 47-minute recording clock', async () => {
    const rec = {
      game: 'valorant', path: 'long.mp4',
      timeline: { recordingStartTime: 1_000_000, endTime: 1_000_000 + 47 * 60_000 },
    } as PendingRecording
    await refreshVodProbe(rec.path, async () => ({ ok: true, durationMs: 93 * 60_000 }))
    expect(getVodFileReadiness(rec)).toBe('unreadable')
    rec.cloudArchived = true
    rec.archiveId = 'archive-1'
    expect(getVodFileReadiness(rec)).toBe('unreadable')
    // Correctly recording the existing 46-minute lead-in makes the same file coherent.
    rec.timeline!.recordingStartTime -= 46 * 60_000
    expect(getVodFileReadiness(rec)).toBe('ready')
  })

  it('does not treat a missing media duration as verified timing', async () => {
    const rec = { game: 'valorant', path: 'unknown.mp4', timeline: { recordingStartTime: 1000, endTime: 100_000 } } as PendingRecording
    await refreshVodProbe(rec.path, async () => ({ ok: true }))
    expect(getVodFileReadiness(rec)).toBe('unreadable')
  })
})
