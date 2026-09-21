import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { PostMatchJobStore, type PostMatchJob } from './post-match-job-store'
import { PostMatchDeferredError, PostMatchWorker } from './post-match-worker'

function job(id: string, createdAt: number): PostMatchJob {
  return {
    id,
    ownerUserId: 7,
    requestKind: 'automatic',
    recordingId: id,
    videoPath: `/tmp/${id}.mp4`,
    game: 'valorant',
    matchCorrelationId: null,
    stage: 'queued',
    attempts: 0,
    lastError: null,
    createdAt,
    updatedAt: createdAt,
    riotName: 'P',
    riotTag: 'T',
    map: null,
    agent: null,
  }
}

describe('PostMatchWorker', () => {
  it('stops on the displayed quota error, drains the next job, and permits an explicit retry', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-worker-'))
    try {
      const store = new PostMatchJobStore(join(dir, 'jobs.json'))
      const quotaMessage = 'Your match is ready, but you need an analysis credit. Upgrade or pay per analysis to unlock coaching.'
      let quotaReached = true
      const runJob = vi.fn(async (candidate: PostMatchJob) => {
        if (candidate.id === 'quota' && quotaReached) throw new Error(quotaMessage)
      })
      const worker = new PostMatchWorker({
        store,
        isRecording: () => false,
        // Cap attempts so the old immediate retry loop fails safely.
        isJobReady: (candidate) => candidate.attempts < 3,
        runJob,
      })
      store.upsert(job('quota', 1))
      store.upsert(job('next', 2))
      worker.kick()
      await vi.waitFor(() => expect(store.get('next')?.stage).toBe('done'))
      expect(store.get('quota')).toMatchObject({ stage: 'failed', attempts: 1, lastError: quotaMessage })
      expect(runJob).toHaveBeenCalledTimes(2)

      worker.kick()
      expect(runJob).toHaveBeenCalledTimes(2)

      quotaReached = false
      worker.enqueue({ ...store.get('quota')!, stage: 'queued', requestKind: 'manual' })
      await vi.waitFor(() => expect(store.get('quota')?.stage).toBe('done'))
      expect(store.get('quota')?.attempts).toBe(2)
      expect(runJob).toHaveBeenCalledTimes(3)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('waits for a resume signal after capture deferral, then drains the queue', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-worker-'))
    try {
      const store = new PostMatchJobStore(join(dir, 'jobs.json'))
      let shouldDefer = true
      const runJob = vi.fn(async () => {
        if (shouldDefer) throw new PostMatchDeferredError('upload aborted: match capture')
      })
      const worker = new PostMatchWorker({
        store,
        isRecording: () => false,
        isJobReady: (candidate) => candidate.attempts < 2,
        runJob,
      })
      store.upsert(job('a', 1))
      store.upsert(job('b', 2))
      worker.kick()
      await vi.waitFor(() => expect(worker.isBusy()).toBe(false))
      expect(runJob).toHaveBeenCalledTimes(1)
      expect(store.get('a')?.stage).toBe('deferred')
      expect(store.get('b')?.stage).toBe('queued')

      shouldDefer = false
      worker.kick()
      await vi.waitFor(() => expect(store.get('b')?.stage).toBe('done'))
      expect(store.get('a')?.stage).toBe('done')
      expect(runJob).toHaveBeenCalledTimes(3)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('does not retry a permanent post-match error just because its message contains match', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-worker-'))
    try {
      const store = new PostMatchJobStore(join(dir, 'jobs.json'))
      const runJob = vi.fn(async () => { throw new Error('post-match pipeline did not complete') })
      const worker = new PostMatchWorker({
        store,
        isRecording: () => false,
        // Bound the old retry loop so this regression can fail safely.
        isJobReady: (candidate) => candidate.attempts < 2,
        runJob,
      })
      worker.enqueue(job('failed-match', 1))
      await vi.waitFor(() => expect(worker.isBusy()).toBe(false))
      expect(runJob).toHaveBeenCalledTimes(1)
      expect(store.get('failed-match')?.stage).toBe('failed')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('runs one job at a time then drains the next', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-worker-'))
    try {
      const store = new PostMatchJobStore(join(dir, 'jobs.json'))
      let concurrent = 0
      let maxConcurrent = 0
      const order: string[] = []

      const runJob = vi.fn(async (j: PostMatchJob) => {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        order.push(j.id)
        await new Promise((r) => setTimeout(r, 30))
        concurrent--
      })

      const worker = new PostMatchWorker({
        store,
        isRecording: () => false,
        isJobReady: () => true,
        runJob,
      })

      worker.enqueue(job('a', 1))
      worker.enqueue(job('b', 2))

      await vi.waitFor(() => expect(store.get('b')?.stage).toBe('done'), { timeout: 2000 })
      expect(maxConcurrent).toBe(1)
      expect(order).toEqual(['a', 'b'])
      expect(worker.isBusy()).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('does not claim while recording', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-worker-'))
    try {
      const store = new PostMatchJobStore(join(dir, 'jobs.json'))
      const runJob = vi.fn(async () => {})
      const worker = new PostMatchWorker({
        store,
        isRecording: () => true,
        isJobReady: () => true,
        runJob,
      })
      worker.enqueue(job('a', 1))
      await new Promise((r) => setTimeout(r, 50))
      expect(runJob).not.toHaveBeenCalled()
      expect(store.get('a')?.stage).toBe('queued')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('keeps a persisted automatic job pending while auto-analyse is disabled', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-worker-'))
    try {
      const store = new PostMatchJobStore(join(dir, 'jobs.json'))
      const runJob = vi.fn(async () => {})
      let autoAnalyseEnabled = false
      const worker = new PostMatchWorker({
        store,
        isRecording: () => false,
        isJobReady: () => true,
        canRunJob: () => autoAnalyseEnabled,
        runJob,
      })

      store.upsert(job('saved-auto-job', 1))
      worker.kick()
      await new Promise((r) => setTimeout(r, 50))

      expect(runJob).not.toHaveBeenCalled()
      expect(store.get('saved-auto-job')?.stage).toBe('queued')

      autoAnalyseEnabled = true
      worker.kick()
      await vi.waitFor(() => expect(store.get('saved-auto-job')?.stage).toBe('done'), { timeout: 2000 })
      expect(runJob).toHaveBeenCalledTimes(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('keeps an automatic job queued until canonical match data is ready', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-worker-'))
    try {
      const store = new PostMatchJobStore(join(dir, 'jobs.json'))
      const runJob = vi.fn(async () => {})
      let matchDataReady = false
      const worker = new PostMatchWorker({
        store,
        isRecording: () => false,
        isJobReady: () => matchDataReady,
        runJob,
      })

      worker.enqueue(job('waiting-for-stats', 1))
      await new Promise((r) => setTimeout(r, 50))

      expect(runJob).not.toHaveBeenCalled()
      expect(store.get('waiting-for-stats')?.stage).toBe('queued')
      expect(store.get('waiting-for-stats')?.attempts).toBe(0)

      matchDataReady = true
      worker.kick()

      await vi.waitFor(() => expect(store.get('waiting-for-stats')?.stage).toBe('done'))
      expect(runJob).toHaveBeenCalledTimes(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('does not immediately retry a failed job in a tight loop', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-worker-'))
    try {
      const store = new PostMatchJobStore(join(dir, 'jobs.json'))
      const worker = new PostMatchWorker({
        store,
        isRecording: () => false,
        isJobReady: () => true,
        runJob: vi.fn(async () => { throw new Error('network down') }),
      })
      worker.enqueue(job('failed-once', 1))
      await vi.waitFor(() => expect(store.get('failed-once')?.stage).toBe('failed'))
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(store.get('failed-once')?.attempts).toBe(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
