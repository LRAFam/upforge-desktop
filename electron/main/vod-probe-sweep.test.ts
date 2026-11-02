import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCoalescedNotifier, createVodProbeSweep } from './vod-probe-sweep'

/**
 * Post-match freeze (2 Nov 2026): after a match the probe cache is cold and the renderer reloads the
 * list on every `recordings:updated`. Each reload asked for another sweep. These tests model that
 * feedback loop: every notification makes two listeners request a new sweep at once.
 */
function harness(rows: number, probeMs = 50) {
  const ready = new Set<number>()
  const ids = Array.from({ length: rows }, (_, i) => i)
  let probes = 0
  let notifies = 0
  let requests = 0
  const sweep = createVodProbeSweep<number>({
    readiness: (id) => (ready.has(id) ? 'ready' : 'finalizing'),
    probe: async (id) => {
      probes++
      if (ready.has(id)) return
      await new Promise((r) => setTimeout(r, probeMs))
      ready.add(id)
    },
    notify: () => {
      notifies++
      // Home (useDashboard) and the coaching list both reload → two recordings:get calls.
      requests += 2
      sweep.request(ids)
      sweep.request(ids)
    },
  })
  return {
    start: () => { requests++; sweep.request(ids) },
    stats: () => ({ probes, notifies, requests, running: sweep.running }),
  }
}

describe('createVodProbeSweep', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('stays linear when every change makes the renderer ask again (no reload storm)', async () => {
    const h = harness(30)
    h.start()
    await vi.advanceTimersByTimeAsync(30 * 50 + 1000)
    const s = h.stats()
    expect(s.running).toBe(false)
    expect(s.notifies).toBe(30) // one per row that changed
    expect(s.requests).toBe(61)
    // First sweep probes 30 rows; one follow-up sweep re-checks them from cache.
    expect(s.probes).toBeLessThanOrEqual(60)
  })

  it('runs one queued follow-up sweep, not one per request', async () => {
    const probe = vi.fn(async () => { await new Promise((r) => setTimeout(r, 10)) })
    const sweep = createVodProbeSweep<number>({ readiness: () => 'x', probe, notify: () => {} })
    sweep.request([1, 2])
    for (let i = 0; i < 20; i++) sweep.request([1, 2, 3])
    await vi.advanceTimersByTimeAsync(1000)
    expect(probe).toHaveBeenCalledTimes(5) // [1,2] then the latest queued [1,2,3]
    expect(sweep.running).toBe(false)
  })

  it('keeps sweeping after a probe throws', async () => {
    const seen: number[] = []
    const sweep = createVodProbeSweep<number>({
      readiness: () => 'x',
      probe: async (id) => { seen.push(id); if (id === 1) throw new Error('ffmpeg missing') },
      notify: () => {},
    })
    sweep.request([1, 2])
    await vi.advanceTimersByTimeAsync(10)
    expect(seen).toEqual([1, 2])
  })
})

describe('createCoalescedNotifier', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('turns a burst into one send', async () => {
    const send = vi.fn()
    const notify = createCoalescedNotifier(send, 400)
    for (let i = 0; i < 50; i++) notify()
    expect(send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(400)
    expect(send).toHaveBeenCalledTimes(1)
    notify()
    await vi.advanceTimersByTimeAsync(400)
    expect(send).toHaveBeenCalledTimes(2)
  })
})
