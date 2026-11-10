import fs from 'fs'
import path from 'path'

export interface PendingJob {
  job_id: string
  savedAt: number
  agent?: string
  map?: string
  game?: string
}

function isPendingJob(value: unknown): value is PendingJob {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<PendingJob>
  return typeof row.job_id === 'string' && row.job_id.length > 0
    && typeof row.savedAt === 'number' && Number.isFinite(row.savedAt)
}

/** The containing user directory owns legacy single-job files; never import another user's file. */
export function readPendingJobRegistry(filePath: string, ownerUserId: number | null): PendingJob[] {
  let raw: string
  try { raw = fs.readFileSync(filePath, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const parsed: unknown = JSON.parse(raw)
  if (isPendingJob(parsed)) return [parsed]
  const data = parsed as { version?: unknown; ownerUserId?: unknown; jobs?: unknown } | null
  if (data?.version !== 2 || data.ownerUserId !== ownerUserId || !Array.isArray(data.jobs)
    || !data.jobs.every(isPendingJob)) {
    throw new Error('Invalid or differently owned pending-job registry')
  }
  return data.jobs
}

function writeRegistry(filePath: string, ownerUserId: number | null, jobs: PendingJob[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temp = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(temp, JSON.stringify({ version: 2, ownerUserId, jobs }), { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(temp, filePath)
}

/** Synchronous read/replace is serialized by Electron's main thread; rename makes crashes atomic. */
export function savePendingJobEntry(filePath: string, ownerUserId: number | null, job: PendingJob): void {
  const jobs = readPendingJobRegistry(filePath, ownerUserId)
  const prior = jobs.find(row => row.job_id === job.job_id)
  const next = { ...prior, ...job, savedAt: prior?.savedAt ?? job.savedAt }
  writeRegistry(filePath, ownerUserId, [...jobs.filter(row => row.job_id !== job.job_id), next])
}

export function removePendingJobEntry(filePath: string, ownerUserId: number | null, jobId: string): void {
  const jobs = readPendingJobRegistry(filePath, ownerUserId)
  const remaining = jobs.filter(row => row.job_id !== jobId)
  if (remaining.length === jobs.length) return
  if (remaining.length) writeRegistry(filePath, ownerUserId, remaining)
  else fs.unlinkSync(filePath)
}
