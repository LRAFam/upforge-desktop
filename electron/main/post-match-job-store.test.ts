import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { PostMatchJobStore, type PostMatchJob } from './post-match-job-store'

function baseJob(overrides: Partial<PostMatchJob> = {}): PostMatchJob {
  const now = Date.now()
  return {
    id: 'rec-1',
    ownerUserId: 7,
    requestKind: 'automatic',
    recordingId: 'rec-1',
    videoPath: '/tmp/a.mp4',
    game: 'valorant',
    matchCorrelationId: null,
    stage: 'queued',
    attempts: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    riotName: 'Player',
    riotTag: 'TAG',
    map: 'Ascent',
    agent: 'Jett',
    ...overrides,
  }
}

describe('PostMatchJobStore', () => {
  it('upserts and lists jobs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-jobs-'))
    try {
      const store = new PostMatchJobStore(join(dir, 'jobs.json'))
      store.upsert(baseJob())
      store.upsert(baseJob({ id: 'rec-2', recordingId: 'rec-2', createdAt: Date.now() + 1 }))
      expect(store.list().map((j) => j.id)).toEqual(['rec-1', 'rec-2'])
      expect(store.get('rec-1')?.map).toBe('Ascent')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('claims FIFO runnable jobs and skips done/polling', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-jobs-'))
    try {
      const store = new PostMatchJobStore(join(dir, 'jobs.json'))
      store.upsert(baseJob({ id: 'a', recordingId: 'a', createdAt: 1, stage: 'done' }))
      store.upsert(baseJob({ id: 'b', recordingId: 'b', createdAt: 2, stage: 'queued' }))
      store.upsert(baseJob({ id: 'c', recordingId: 'c', createdAt: 3, stage: 'queued' }))
      const first = store.claimNextRunnable({ deferIfRecording: false, isRecording: () => false })
      expect(first?.id).toBe('b')
      store.update('b', { stage: 'polling' })
      const second = store.claimNextRunnable({ deferIfRecording: false, isRecording: () => false })
      expect(second?.id).toBe('c')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('defers claim while recording when requested', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-jobs-'))
    try {
      const store = new PostMatchJobStore(join(dir, 'jobs.json'))
      store.upsert(baseJob({ stage: 'queued' }))
      const claimed = store.claimNextRunnable({
        deferIfRecording: true,
        isRecording: () => true,
      })
      expect(claimed).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('does not claim jobs that fail the ownership or consent predicate', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-jobs-'))
    try {
      const store = new PostMatchJobStore(join(dir, 'jobs.json'))
      store.upsert(baseJob({ ownerUserId: 7 }))
      expect(store.claimNextRunnable({
        deferIfRecording: false,
        isRecording: () => false,
        isEligible: (job) => job.ownerUserId === 8,
      })).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
