import { CS2_DEMO_SYNC_MAX_MS, cs2DemoSyncPollIntervalMs } from './match-data-quality'

export interface DemoRetrievalStatus {
  state: 'syncing' | 'waiting_match_data'
  message: string
  nextRetryAt?: number
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

/** One timer per recording; retries only after the previous attempt has settled. */
export class Cs2DemoRetrieval {
  private jobs = new Map<string, { timer?: ReturnType<typeof setTimeout> }>()

  constructor(private deps: RetrievalDeps) {}

  start(id: string): void {
    if (this.jobs.has(id)) return
    const job: { timer?: ReturnType<typeof setTimeout> } = {}
    this.jobs.set(id, job)
    let eligibleElapsedMs = 0
    let lastTickMs = Date.now()
    let previouslyDeferred = this.deps.deferred()
    const active = () => this.jobs.get(id) === job
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
      if (!previouslyDeferred && !deferred) eligibleElapsedMs += Math.max(0, now - lastTickMs)
      lastTickMs = now
      previouslyDeferred = deferred
      if (eligibleElapsedMs >= CS2_DEMO_SYNC_MAX_MS) {
        cs2DemoRetrievalStatus.set(id, {
          state: 'waiting_match_data',
          message: 'Automatic demo checks stopped after 35 minutes of retry time. Download the replay in CS2 and attach the .dem file, or scan again.',
        })
        this.stop(id)
        this.deps.changed(id)
        return
      }
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
            this.deps.changed(id)
            this.deps.ready(id)
            return
          }
        } catch (error) {
          if (!active()) return
          cs2DemoRetrievalStatus.set(id, {
            state: 'waiting_match_data',
            message: error instanceof Error ? error.message : 'Demo retrieval failed.',
          })
        }
      }
      if (!active()) return
      const delay = cs2DemoSyncPollIntervalMs(eligibleElapsedMs, this.deps.deferred())
      const status = cs2DemoRetrievalStatus.get(id)
      if (status) cs2DemoRetrievalStatus.set(id, { ...status, nextRetryAt: Date.now() + delay })
      this.deps.changed(id)
      job.timer = setTimeout(() => { void tick() }, delay)
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
    cs2DemoRetrievalStatus.clear()
  }
}
