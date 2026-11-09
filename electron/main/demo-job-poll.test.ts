import { describe, expect, it, vi } from 'vitest'
import { DEMO_POLL_MAX_MS, pollDemoJob } from './demo-job-poll'

/** Fake clock: sleep() moves time forward instead of waiting. */
function clock() {
  let t = 0
  return { now: () => t, sleep: async (ms: number) => { t += ms } }
}

describe('pollDemoJob', () => {
  it('keeps polling past the API retry window (3 tries × 10 min + backoff ≈ 32 min)', () => {
    expect(DEMO_POLL_MAX_MS).toBeGreaterThanOrEqual(35 * 60 * 1000)
  })

  it('finds a job that completes after 30 minutes (the old 10 min loop gave up)', async () => {
    const c = clock()
    const poll = vi.fn(async () => ({ status: c.now() >= 30 * 60 * 1000 ? 'completed' : 'processing' }))
    const res = await pollDemoJob({ poll, ...c })
    expect(res).toEqual({ status: 'completed' })
  })

  it('reports failed with the API error', async () => {
    const c = clock()
    const res = await pollDemoJob({ poll: async () => ({ status: 'failed', error: 'Bad demo' }), ...c })
    expect(res).toEqual({ status: 'failed', error: 'Bad demo' })
  })

  it('backs off: early polls are close together, later ones capped at 60 s', async () => {
    const c = clock()
    const waits: number[] = []
    const sleep = async (ms: number) => { waits.push(ms); await c.sleep(ms) }
    await pollDemoJob({ poll: async () => ({ status: 'processing' }), now: c.now, sleep })
    expect(waits[0]).toBe(10_000)
    expect(Math.max(...waits)).toBe(60_000)
    // ~35+ min of polling in well under 100 requests.
    expect(waits.length).toBeLessThan(60)
  })

  it('times out (not failed) when the job is still running, and survives poll errors', async () => {
    const c = clock()
    const poll = vi.fn(async () => { throw new Error('ECONNRESET') })
    const res = await pollDemoJob({ poll, ...c })
    expect(res).toEqual({ status: 'timeout' })
    expect(c.now()).toBeGreaterThanOrEqual(DEMO_POLL_MAX_MS)
  })
})
