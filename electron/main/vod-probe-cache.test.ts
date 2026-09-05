import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearVodProbeCache, refreshVodProbe } from './analysis-readiness'

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
})
