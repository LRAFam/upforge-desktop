import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createReportPoller, NOTES_PENDING, REPORT_RETRY } from './report-poller'

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

describe('NOTES_PENDING (coach notes still being written)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('checks soon (5 s) and gives up after about 2 minutes', async () => {
    const run = vi.fn(async () => false)
    const p = createReportPoller(NOTES_PENDING, run)
    p.start()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(p.active.value).toBe(false)
    const total = NOTES_PENDING.delaysMs!.reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThanOrEqual(110_000)
    expect(total).toBeLessThanOrEqual(130_000)
  })

  it('stays under the API notes throttle (30 requests an hour per game)', () => {
    expect(NOTES_PENDING.delaysMs!.length).toBeLessThanOrEqual(12)
  })
})

describe('match-report:game-notes IPC', () => {
  const main = readFileSync(new URL('../../electron/main/index.ts', import.meta.url), 'utf8')
  it('passes notes_status through so the page can tell "pending" from "no notes"', () => {
    const start = main.indexOf("ipcMain.handle('match-report:game-notes'")
    const block = main.slice(start, main.indexOf('\n  })', start))
    expect(block).toMatch(/notes_status:/)
  })
})

describe('MatchReportV3 pending notes', () => {
  const sfc = readFileSync(new URL('../views/v3/MatchReportV3.vue', import.meta.url), 'utf8')
  it('polls while notes are pending and stops on unmount', () => {
    expect(sfc).toMatch(/notes_status === 'pending'/)
    expect(sfc).toMatch(/onBeforeUnmount\(\(\) => \{[^\n]*notesPoller\.stop\(\)/)
  })
})
