import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createReportPoller, REPORT_RETRY } from './report-poller'

describe('createReportPoller', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('checks every 30 s for about 5 minutes, then stops', async () => {
    const run = vi.fn(async () => false)
    const p = createReportPoller(REPORT_RETRY, run)
    p.start()
    expect(p.active.value).toBe(true)
    await vi.advanceTimersByTimeAsync(29_000)
    expect(run).toHaveBeenCalledTimes(0)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(run).toHaveBeenCalledTimes(10)
    expect(p.active.value).toBe(false)
  })

  it('stops as soon as a check finds the report', async () => {
    let n = 0
    const run = vi.fn(async () => ++n === 2)
    const p = createReportPoller(REPORT_RETRY, run)
    p.start()
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(run).toHaveBeenCalledTimes(2)
    expect(p.active.value).toBe(false)
  })

  it('stop() cancels the next check (used on unmount)', async () => {
    const run = vi.fn(async () => false)
    const p = createReportPoller(REPORT_RETRY, run)
    p.start()
    p.stop()
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(run).not.toHaveBeenCalled()
    expect(p.active.value).toBe(false)
  })

  it('start() again restarts the window and never runs two loops', async () => {
    const run = vi.fn(async () => false)
    const p = createReportPoller({ intervalMs: 1000, maxMs: 3000 }, run)
    p.start()
    p.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('MatchReportV3 no-report state', () => {
  const sfc = readFileSync(new URL('../views/v3/MatchReportV3.vue', import.meta.url), 'utf8')
  it('offers Try again when there is no report yet, not only on errors', () => {
    expect(sfc).not.toMatch(/v-if="state\.kind === 'error'"[^>]*@click="load"/)
    expect(sfc).toMatch(/Try again/)
  })
  it('stops checking when the page closes', () => {
    expect(sfc).toMatch(/onBeforeUnmount\(\(\) => \{[^\n]*reportPoller\.stop\(\)/)
  })
})
