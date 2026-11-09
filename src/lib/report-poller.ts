/**
 * Quiet re-checks for a match report page: run `check` every `intervalMs` until it returns true
 * (found) or `maxMs` has passed. One loop at a time; stop() on unmount or when the match changes.
 */
import { ref, type Ref } from 'vue'

/**
 * Fixed `intervalMs` until `maxMs`, or — with `delaysMs` — one check after each listed delay, then stop.
 */
export interface PollWindow { intervalMs: number; maxMs: number; delaysMs?: readonly number[] }

/** "No report yet": the API usually has it within a few minutes of the match ending. */
export const REPORT_RETRY: PollWindow = { intervalMs: 30_000, maxMs: 5 * 60_000 }

/**
 * AI coach notes still being written (API notes_status "pending"; usually well under a minute).
 * Starts at 5 s and spreads out to ~2 minutes in 10 checks: the API allows 30 notes requests an hour.
 */
const NOTES_DELAYS = [5_000, 5_000, 5_000, 10_000, 10_000, 15_000, 15_000, 20_000, 20_000, 15_000] as const
export const NOTES_PENDING: PollWindow = { intervalMs: 5_000, maxMs: 120_000, delaysMs: NOTES_DELAYS }

export interface ReportPoller {
  /** True while checks are scheduled. */
  active: Ref<boolean>
  start(): void
  stop(): void
}

export function createReportPoller(window: PollWindow, check: () => Promise<boolean>): ReportPoller {
  const active = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null
  let run = 0
  let startedAt = 0
  let checks = 0
  const delays = window.delaysMs
  const nextDelay = (): number | null => {
    if (delays) return checks < delays.length ? delays[checks] : null
    return checks === 0 || Date.now() - startedAt + window.intervalMs <= window.maxMs ? window.intervalMs : null
  }

  function stop(): void {
    run++
    if (timer) clearTimeout(timer)
    timer = null
    active.value = false
  }

  function schedule(id: number): void {
    const wait = nextDelay()
    if (wait == null) { active.value = false; return }
    timer = setTimeout(async () => {
      timer = null
      checks++
      const done = await check().catch(() => false)
      if (id !== run) return
      if (done) { active.value = false; return }
      schedule(id)
    }, wait)
  }

  function start(): void {
    stop()
    startedAt = Date.now()
    checks = 0
    active.value = true
    schedule(run)
  }

  return { active, start, stop }
}
