/**
 * Durable post-match job queue (JSON file, atomic replace).
 */

import fs from 'fs'
import path from 'path'

export type PostMatchJobStage =
  | 'queued'
  | 'remux'
  | 'upload'
  | 'duels'
  | 'complete_api'
  | 'polling'
  | 'done'
  | 'failed'
  | 'deferred'

export interface PostMatchJob {
  id: string
  recordingId: string
  videoPath: string
  game: string
  matchCorrelationId: string | null
  stage: PostMatchJobStage
  attempts: number
  lastError: string | null
  createdAt: number
  updatedAt: number
  riotName: string
  riotTag: string
  map: string | null
  agent: string | null
}

interface JobStoreFile {
  version: 1
  jobs: PostMatchJob[]
}

const RUNNABLE: PostMatchJobStage[] = ['queued', 'deferred', 'remux', 'upload', 'duels', 'complete_api', 'failed']

export function getPostMatchJobStorePath(userDataPath: string): string {
  return path.join(userDataPath, 'post-match-jobs.json')
}

export class PostMatchJobStore {
  private readonly filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }

  list(): PostMatchJob[] {
    return this.read().jobs.slice()
  }

  get(id: string): PostMatchJob | undefined {
    return this.read().jobs.find((j) => j.id === id)
  }

  upsert(job: PostMatchJob): void {
    const data = this.read()
    const idx = data.jobs.findIndex((j) => j.id === job.id)
    const next = { ...job, updatedAt: Date.now() }
    if (idx >= 0) data.jobs[idx] = next
    else data.jobs.push(next)
    this.write(data)
  }

  update(id: string, patch: Partial<PostMatchJob>): void {
    const data = this.read()
    const idx = data.jobs.findIndex((j) => j.id === id)
    if (idx < 0) return
    data.jobs[idx] = { ...data.jobs[idx]!, ...patch, updatedAt: Date.now() }
    this.write(data)
  }

  remove(id: string): void {
    const data = this.read()
    data.jobs = data.jobs.filter((j) => j.id !== id)
    this.write(data)
  }

  /**
   * Claim next runnable job (FIFO by createdAt).
   * Skips done/polling. Optionally returns null while a match is recording.
   */
  claimNextRunnable(opts: {
    deferIfRecording: boolean
    isRecording: () => boolean
  }): PostMatchJob | null {
    if (opts.deferIfRecording && opts.isRecording()) return null
    const data = this.read()
    const candidates = data.jobs
      .filter((j) => RUNNABLE.includes(j.stage))
      .sort((a, b) => a.createdAt - b.createdAt)
    return candidates[0] ?? null
  }

  private read(): JobStoreFile {
    try {
      if (!fs.existsSync(this.filePath)) return { version: 1, jobs: [] }
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as JobStoreFile
      if (!raw || raw.version !== 1 || !Array.isArray(raw.jobs)) return { version: 1, jobs: [] }
      return { version: 1, jobs: raw.jobs }
    } catch {
      return { version: 1, jobs: [] }
    }
  }

  private write(data: JobStoreFile): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
    fs.renameSync(tmp, this.filePath)
  }
}
