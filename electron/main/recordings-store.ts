import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { MatchData } from './riot-local-api'
import { recordingPathVariants, sourcePathForCompressed } from './vod-compressor'
import { userDataRoot } from './user-data-paths'

function recordingStemKey(filePath: string): string {
  const stem = path.basename(filePath, '.mp4')
  const normalizedStem = stem.endsWith('_upforge') ? stem.slice(0, -'_upforge'.length) : stem
  return path.join(path.dirname(filePath), normalizedStem).toLowerCase()
}

function preferRecordingEntry(a: PendingRecording, b: PendingRecording): PendingRecording {
  const aCompressed = sourcePathForCompressed(a.path) != null
  const bCompressed = sourcePathForCompressed(b.path) != null
  if (aCompressed !== bCompressed) return aCompressed ? a : b
  if (a.analysed !== b.analysed) return a.analysed ? a : b
  if ((a.timeline != null) !== (b.timeline != null)) return a.timeline ? a : b
  return a.recordedAt >= b.recordedAt ? a : b
}

export interface PendingRecording {
  id: string
  path: string
  riotName: string
  riotTag: string
  game: string
  map: string | null
  agent: string | null
  gameMode: string
  timeline: MatchData | null
  recordedAt: number
  analysed: boolean
  jobId?: string
  fileSizeBytes?: number
}

export type NewRecording = Omit<PendingRecording, 'id' | 'recordedAt' | 'analysed'>

export class RecordingsStore {
  private recordings: PendingRecording[] = []
  private filePath: string
  private userId: number | null = null

  constructor() {
    const userDataPath = app.getPath('userData')
    this.filePath = path.join(userDataPath, 'recordings.json')
    this.recordings = this.load()
  }

  setUserScope(userId: number | null): void {
    if (userId === this.userId) return
    this.userId = userId
    if (userId == null) {
      this.recordings = []
      return
    }
    const root = userDataRoot(userId)
    fs.mkdirSync(root, { recursive: true })
    this.filePath = path.join(root, 'recordings.json')
    this.recordings = this.load()
  }

  private load(): PendingRecording[] {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const all: PendingRecording[] = JSON.parse(raw)
      // Prune entries whose video file no longer exists to keep the store clean
      const pruned = all.filter(r => r.analysed || fs.existsSync(r.path))
      const deduped = this.dedupeSiblingRecordings(pruned)
      if (deduped.length !== all.length) {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
        fs.writeFileSync(this.filePath, JSON.stringify(deduped, null, 2))
      }
      return deduped
    } catch {
      return []
    }
  }

  private persist(): void {
    if (this.userId == null) return
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      fs.writeFileSync(this.filePath, JSON.stringify(this.recordings, null, 2))
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOSPC') {
        console.error('[RecordingsStore] Disk full — could not persist recordings list')
      } else {
        console.error('[RecordingsStore] Failed to persist recordings:', err)
      }
    }
  }

  add(data: NewRecording): PendingRecording {
    let fileSizeBytes: number | undefined
    try {
      fileSizeBytes = fs.statSync(data.path).size
    } catch { /* file might not be readable yet */ }

    const recording: PendingRecording = {
      ...data,
      id: randomUUID(),
      recordedAt: Date.now(),
      analysed: false,
      fileSizeBytes
    }
    this.recordings.unshift(recording)
    // Keep last 50 recordings
    if (this.recordings.length > 50) this.recordings = this.recordings.slice(0, 50)
    this.persist()
    return recording
  }

  markAnalysed(id: string, jobId: string): void {
    const rec = this.recordings.find(r => r.id === id)
    if (rec) {
      rec.analysed = true
      rec.jobId = jobId
      this.persist()
    }
  }

  getById(id: string): PendingRecording | undefined {
    return this.recordings.find(r => r.id === id)
  }

  /** Local file path for a desktop upload job, if the recording still exists on disk. */
  getPathByJobId(jobId: string): string | null {
    const recording = this.recordings.find(r => r.jobId === jobId && fs.existsSync(r.path))
    return recording?.path ?? null
  }

  updateTimeline(id: string, timeline: MatchData): boolean {
    const rec = this.recordings.find(r => r.id === id)
    if (!rec) return false
    rec.timeline = timeline
    this.persist()
    return true
  }

  /** Returns recordings that haven't been analysed and whose file still exists */
  getPending(): PendingRecording[] {
    return this.recordings.filter(r => !r.analysed && fs.existsSync(r.path))
  }

  getKnownPaths(): Set<string> {
    const paths = new Set<string>()
    for (const recording of this.recordings) {
      for (const variant of recordingPathVariants(recording.path)) {
        paths.add(path.normalize(variant))
      }
    }
    return paths
  }

  /** Point a pending recording at the compressed file after upload prep. */
  updatePath(id: string, newPath: string): boolean {
    const rec = this.recordings.find(r => r.id === id)
    if (!rec) return false
    rec.path = newPath
    try {
      rec.fileSizeBytes = fs.statSync(newPath).size
    } catch { /* ignore */ }
    this.persist()
    return true
  }

  private dedupeSiblingRecordings(all: PendingRecording[]): PendingRecording[] {
    const groups = new Map<string, PendingRecording[]>()
    for (const recording of all) {
      const key = recordingStemKey(recording.path)
      const group = groups.get(key) ?? []
      group.push(recording)
      groups.set(key, group)
    }

    const kept: PendingRecording[] = []
    for (const group of groups.values()) {
      if (group.length === 1) {
        kept.push(group[0]!)
        continue
      }
      kept.push(group.reduce(preferRecordingEntry))
    }
    return kept
  }

  remove(id: string): void {
    this.recordings = this.recordings.filter(r => r.id !== id)
    this.persist()
  }
}
