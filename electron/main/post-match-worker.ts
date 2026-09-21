/**
 * Single-flight post-match worker — one job at a time from the durable store.
 */

import type { PostMatchJob, PostMatchJobStore } from './post-match-job-store'

/** An explicit pause until match capture releases background work. */
export class PostMatchDeferredError extends Error {}

export interface PostMatchWorkerDeps {
  store: PostMatchJobStore
  isRecording: () => boolean
  /** Canonical readiness gate. Missing match data keeps the job queued locally. */
  isJobReady: (job: PostMatchJob) => boolean
  /** Whether this persisted job is owned by and allowed for the active user. */
  canRunJob?: (job: PostMatchJob) => boolean
  runJob: (job: PostMatchJob) => Promise<void>
  log?: (msg: string) => void
}

export class PostMatchWorker {
  private busy = false
  private readonly deps: PostMatchWorkerDeps

  constructor(deps: PostMatchWorkerDeps) {
    this.deps = deps
  }

  isBusy(): boolean {
    return this.busy
  }

  enqueue(job: PostMatchJob): void {
    this.deps.store.upsert({ ...job, stage: job.stage === 'done' ? 'queued' : (job.stage || 'queued') })
    this.kick()
  }

  kick(): void {
    if (this.busy) return
    void this.pump()
  }

  private async pump(): Promise<void> {
    if (this.busy) return
    const job = this.deps.store.claimNextRunnable({
      deferIfRecording: true,
      isRecording: this.deps.isRecording,
      isEligible: (candidate) => (
        this.deps.isJobReady(candidate)
        && (this.deps.canRunJob?.(candidate) ?? true)
      ),
    })
    if (!job) return

    this.busy = true
    let deferred = false
    this.deps.log?.(`Post-match worker starting ${job.id} (${job.game})`)
    try {
      this.deps.store.update(job.id, { stage: 'upload', attempts: job.attempts + 1, lastError: null })
      await this.deps.runJob(job)
      this.deps.store.update(job.id, { stage: 'done', lastError: null })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      deferred = err instanceof PostMatchDeferredError
      this.deps.store.update(job.id, {
        stage: deferred ? 'deferred' : 'failed',
        lastError: msg.slice(0, 500),
      })
      this.deps.log?.(`Post-match worker ${deferred ? 'deferred' : 'failed'} ${job.id}: ${msg}`)
    } finally {
      this.busy = false
      // Capture resumption calls kick(). Do not immediately reclaim a deferred job.
      if (!deferred) this.kick()
    }
  }
}
