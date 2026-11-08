/**
 * Quiet re-checks for a match report page: run `check` every `intervalMs` until it returns true
 * (found) or `maxMs` has passed. One loop at a time; stop() on unmount or when the match changes.
 */
import { ref, type Ref } from 'vue'

export interface PollWindow { intervalMs: number; maxMs: number }

/** "No report yet": the API usually has it within a few minutes of the match ending. */
export const REPORT_RETRY: PollWindow = { intervalMs: 30_000, maxMs: 5 * 60_000 }

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

  function stop(): void {
    run++
    if (timer) clearTimeout(timer)
    timer = null
    active.value = false
  }

  function schedule(id: number): void {
    timer = setTimeout(async () => {
      timer = null
      const done = await check().catch(() => false)
      if (id !== run) return
      if (done || Date.now() - startedAt + window.intervalMs > window.maxMs) { active.value = false; return }
      schedule(id)
    }, window.intervalMs)
  }

  function start(): void {
    stop()
    startedAt = Date.now()
    active.value = true
    schedule(run)
  }

  return { active, start, stop }
}
