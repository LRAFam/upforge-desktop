import { CS2_DEMO_SYNC_MAX_MS, cs2DemoSyncPollIntervalMs } from './match-data-quality'
import type { ValveDemoFailureCode } from './cs2-valve-demo-downloader'

export interface DemoRetrievalStatus {
  state: 'syncing' | 'waiting_match_data'
  message: string
  nextRetryAt?: number
  /** Why the last attempt failed — drives the retry policy below. */
  code?: ValveDemoFailureCode
  /** Automatic checks have stopped: the user has to download + attach the demo. */
  needsManual?: boolean
}

// Runtime state only: a previous app session cannot still be downloading.
export const cs2DemoRetrievalStatus = new Map<string, DemoRetrievalStatus>()

interface RetrievalDeps {
  getRecording: (id: string) => { recordedAt: number; complete: boolean } | null
  retrieve: (id: string) => Promise<boolean>
  deferred: () => boolean
  changed: (id: string) => void
  ready: (id: string) => void
}

/**
 * Steam's GC answered but did not list this match. Each check spawns Steam's boiler helper and a
 * GC session, so after a few spaced checks (GOTV lists a match a few minutes after it ends) we
 * stop and ask for a manual attach. 3 Nov user log: this retried every ~7 s for as long as the app
 * stayed open, and every retry reloaded the recordings list.
 */
export const CS2_NO_MATCH_RETRY_DELAYS_MS = [2 * 60_000, 5 * 60_000, 10 * 60_000] as const
/** CS2 is still open (GC lookup needs it closed) or Steam is offline: wait, no boiler spawn. */
export const CS2_WAIT_FOR_CLIENT_MS = 60_000
/** Any other GC / download failure: back off 1 → 2 → 4 → 5 min. */
export const CS2_GC_FAILURE_MIN_MS = 60_000
export const CS2_GC_FAILURE_MAX_MS = 5 * 60_000

export const CS2_DEMO_NEEDS_MANUAL_MESSAGE =
  'Steam did not return this match\'s demo. In CS2 open Watch → Your Matches, download the replay, then attach the .dem file here.'

export type RetryDecision = { delayMs: number; countsTowardBudget: boolean } | { stop: true }

/** Pure retry policy so tests can pin it. `attempts` counts consecutive failures with this code. */
export function cs2DemoRetryDecision(
  code: ValveDemoFailureCode | undefined,
  attempts: number,
  eligibleElapsedMs: number,
): RetryDecision {
  switch (code) {
    case 'no_match': {
      const delay = CS2_NO_MATCH_RETRY_DELAYS_MS[attempts - 1]
      return delay == null ? { stop: true } : { delayMs: delay, countsTowardBudget: true }
    }
    case 'cs2_running':
    case 'steam_offline':
      return { delayMs: CS2_WAIT_FOR_CLIENT_MS, countsTowardBudget: false }
    case 'unsupported':
    case 'no_cs2_dir':
      return { stop: true }
    case 'gc_failed':
    case 'download_failed':
      return {
        delayMs: Math.min(CS2_GC_FAILURE_MAX_MS, CS2_GC_FAILURE_MIN_MS * 2 ** Math.max(0, attempts - 1)),
        countsTowardBudget: true,
      }
    default:
      return { delayMs: cs2DemoSyncPollIntervalMs(eligibleElapsedMs, false), countsTowardBudget: true }
  }
}

function statusKey(status: DemoRetrievalStatus | undefined): string {
  return status ? `${status.state}|${status.message}|${status.needsManual ? 1 : 0}` : ''
}

/** One timer per recording; retries only after the previous attempt has settled. */
export class Cs2DemoRetrieval {
  private jobs = new Map<string, { timer?: ReturnType<typeof setTimeout> }>()
  /** Last status the renderer was told about, so unchanged retries do not reload the list. */
  private notified = new Map<string, string>()

  constructor(private deps: RetrievalDeps) {}

  private notifyIfChanged(id: string): void {
    const key = statusKey(cs2DemoRetrievalStatus.get(id))
    if (this.notified.get(id) === key) return
    this.notified.set(id, key)
    this.deps.changed(id)
  }

  start(id: string): void {
    if (this.jobs.has(id)) return
    const job: { timer?: ReturnType<typeof setTimeout> } = {}
    this.jobs.set(id, job)
    let eligibleElapsedMs = 0
    let lastTickMs = Date.now()
    let previouslyDeferred = this.deps.deferred()
    let lastCode: ValveDemoFailureCode | undefined
    let sameCodeAttempts = 0
    let countElapsed = true
    const active = () => this.jobs.get(id) === job
    const stopForManual = (message: string) => {
      cs2DemoRetrievalStatus.set(id, { state: 'waiting_match_data', message, needsManual: true })
      this.stop(id)
      this.notifyIfChanged(id)
    }
    const tick = async () => {
      if (!active()) return
      const rec = this.deps.getRecording(id)
      if (!rec || rec.complete) {
        cs2DemoRetrievalStatus.delete(id)
        this.stop(id)
        return
      }
      const now = Date.now()
      const deferred = this.deps.deferred()
      if (countElapsed && !previouslyDeferred && !deferred) eligibleElapsedMs += Math.max(0, now - lastTickMs)
      lastTickMs = now
      previouslyDeferred = deferred
      if (eligibleElapsedMs >= CS2_DEMO_SYNC_MAX_MS) {
        stopForManual('Automatic demo checks stopped after 35 minutes of retry time. Download the replay in CS2 and attach the .dem file, or scan again.')
        return
      }
      let code: ValveDemoFailureCode | undefined
      if (deferred) {
        cs2DemoRetrievalStatus.set(id, {
          state: 'waiting_match_data',
          message: 'Demo checks paused during gameplay or recording. They resume automatically afterwards.',
        })
      } else {
        try {
          if (await this.deps.retrieve(id)) {
            if (!active()) return
            this.stop(id)
            cs2DemoRetrievalStatus.delete(id)
            this.notified.delete(id)
            this.deps.changed(id)
            this.deps.ready(id)
            return
          }
          code = cs2DemoRetrievalStatus.get(id)?.code
        } catch (error) {
          if (!active()) return
          cs2DemoRetrievalStatus.set(id, {
            state: 'waiting_match_data',
            message: error instanceof Error ? error.message : 'Demo retrieval failed.',
          })
        }
      }
      if (!active()) return
      if (!deferred) {
        sameCodeAttempts = code === lastCode ? sameCodeAttempts + 1 : 1
        lastCode = code
      }
      const decision: RetryDecision = deferred
        ? { delayMs: cs2DemoSyncPollIntervalMs(eligibleElapsedMs, true), countsTowardBudget: true }
        : cs2DemoRetryDecision(code, sameCodeAttempts, eligibleElapsedMs)
      if ('stop' in decision) {
        stopForManual(code === 'no_match'
          ? CS2_DEMO_NEEDS_MANUAL_MESSAGE
          : cs2DemoRetrievalStatus.get(id)?.message ?? CS2_DEMO_NEEDS_MANUAL_MESSAGE)
        return
      }
      countElapsed = decision.countsTowardBudget
      const status = cs2DemoRetrievalStatus.get(id)
      if (status) cs2DemoRetrievalStatus.set(id, { ...status, nextRetryAt: Date.now() + decision.delayMs })
      this.notifyIfChanged(id)
      job.timer = setTimeout(() => { void tick() }, decision.delayMs)
    }
    job.timer = setTimeout(() => { void tick() }, 0)
  }

  stop(id: string): void {
    const job = this.jobs.get(id)
    if (job?.timer) clearTimeout(job.timer)
    this.jobs.delete(id)
  }

  clear(): void {
    for (const id of this.jobs.keys()) this.stop(id)
    this.notified.clear()
    cs2DemoRetrievalStatus.clear()
  }
}
