/**
 * Persist multipart S3 part ETags so a mid-upload crash can resume
 * within the same S3 upload_id session.
 */

import fs from 'fs'
import path from 'path'

export interface MultipartResumeState {
  version: 1
  recordingId: string
  jobId: string
  uploadId: string
  partSize: number
  totalBytes: number
  completedParts: Array<{ part_number: number; etag: string }>
  updatedAt: number
}

export function multipartStatePath(userDataPath: string, recordingId: string, ownerUserId: number | null): string {
  const safe = recordingId.replace(/[^a-zA-Z0-9._-]/g, '_')
  const owner = ownerUserId === null ? 'pending-local' : path.join('users', String(ownerUserId))
  return path.join(userDataPath, owner, 'multipart-state', `${safe}.json`)
}

/** Only the authenticated API's current ListParts result can authorize skipping a part. */
export function serverCompletedParts(value: unknown, partCount: number): MultipartResumeState['completedParts'] {
  // Older API deployments have no ListParts contract: safely re-upload all parts.
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('Invalid uploaded_parts response')
  const seen = new Set<number>()
  return value.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid uploaded_parts response')
    const { part_number, etag } = raw as Record<string, unknown>
    if (typeof part_number !== 'number' || !Number.isInteger(part_number) || part_number < 1 || part_number > partCount
      || seen.has(part_number) || typeof etag !== 'string' || !etag.trim()) throw new Error('Invalid uploaded_parts response')
    seen.add(part_number)
    return { part_number, etag }
  }).sort((a, b) => a.part_number - b.part_number)
}

export function readMultipartState(filePath: string): MultipartResumeState | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as MultipartResumeState
    if (!raw || raw.version !== 1 || !Array.isArray(raw.completedParts)) return null
    return raw
  } catch {
    return null
  }
}

export function writeMultipartState(filePath: string, state: MultipartResumeState): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ ...state, updatedAt: Date.now() }, null, 2), 'utf8')
  fs.renameSync(tmp, filePath)
}

export function clearMultipartState(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    /* ignore */
  }
}

/** Merge a completed part into state (dedupe by part_number). */
export function withCompletedPart(
  state: MultipartResumeState,
  part: { part_number: number; etag: string },
): MultipartResumeState {
  const others = state.completedParts.filter((p) => p.part_number !== part.part_number)
  return {
    ...state,
    completedParts: [...others, part].sort((a, b) => a.part_number - b.part_number),
    updatedAt: Date.now(),
  }
}
