import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const runtime = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { getPath: () => runtime.root } }))
vi.mock('./vod-compressor', () => ({
  recordingPathVariants: (value: string) => [value],
  sourcePathForCompressed: () => null,
  deleteLocalRecordingFiles: vi.fn(),
}))

import { RecordingsStore, isDeadlockReviewJobId, type NewRecording } from './recordings-store'

beforeEach(() => { runtime.root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-dl-review-')) })
afterEach(() => { fs.rmSync(runtime.root, { recursive: true, force: true }) })

function recording(game: string): NewRecording {
  const filePath = path.join(runtime.root, `${game}.mp4`)
  fs.writeFileSync(filePath, 'recording')
  return { path: filePath, game, riotName: '', riotTag: '', map: null, agent: 'hero_13', gameMode: 'competitive', timeline: null }
}

describe('Deadlock review job on a recording', () => {
  it('persists a valid job id across a reload', () => {
    const store = new RecordingsStore()
    const rec = store.add(recording('deadlock'))
    expect(store.setDeadlockReviewJob(rec.id, 'job-12345678')).toBe(true)
    expect(new RecordingsStore().getById(rec.id)?.deadlockReviewJobId).toBe('job-12345678')
  })

  it('rejects malformed ids and non-Deadlock recordings', () => {
    const store = new RecordingsStore()
    const dl = store.add(recording('deadlock'))
    const cs = store.add(recording('cs2'))
    expect(store.setDeadlockReviewJob(dl.id, '../../etc')).toBe(false)
    expect(store.setDeadlockReviewJob(cs.id, 'job-12345678')).toBe(false)
    expect(store.getById(dl.id)?.deadlockReviewJobId).toBeUndefined()
    expect(isDeadlockReviewJobId('short')).toBe(false)
  })

  it('clears the job with null', () => {
    const store = new RecordingsStore()
    const rec = store.add(recording('deadlock'))
    store.setDeadlockReviewJob(rec.id, 'job-12345678')
    expect(store.setDeadlockReviewJob(rec.id, null)).toBe(true)
    expect(store.getById(rec.id)?.deadlockReviewJobId).toBeUndefined()
  })
})
