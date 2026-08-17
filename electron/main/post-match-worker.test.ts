import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { PostMatchJobStore, type PostMatchJob } from './post-match-job-store'
import { PostMatchWorker } from './post-match-worker'

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
