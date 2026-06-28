import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { MatchData } from './riot-local-api'
import { recordingPathVariants, sourcePathForCompressed, deleteLocalRecordingFiles } from './vod-compressor'
import { recordingMatchesLinkedRiot, userDataRoot, type LinkedRiotId } from './user-data-paths'

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

export type RecordingPipelineStatus = 'pending' | 'uploading' | 'analysing'
export type PipelineDeferReason = 'recording'
export type ClipOnlyReason = 'clips_only_mode' | 'no_recording'

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
  /** Set when analysis completes — enables cloud VOD playback after local file deletion. */
  analysisId?: number
  /** Cloud archive UUID when saved without analysis. */
  archiveId?: string
  /** True when VOD is on cloud via archive-only upload. */
  cloudArchived?: boolean
  fileSizeBytes?: number
  /** Upload / analysis in progress — keeps the row visible on the dashboard. */
  pipelineStatus?: RecordingPipelineStatus
  uploadProgress?: number
  analysisProgress?: number
  analysisStep?: string | null
  /** Last analysis failure message for dashboard retry UX. */
  lastAnalysisError?: string | null
  lastAnalysisErrorHint?: string | null
  lastAnalysisCreditRefunded?: boolean
  /** Per-moment Gemini / clip debug when fight-footage verification fails. */
  lastAnalysisFailureDiagnostics?: Record<string, unknown> | null
  /** When we last showed an OS notification for this recording's analysis failure. */
  analysisFailureNotifiedAt?: number
  /** Upload queued but paused while OBS is recording. */
  pipelineDeferReason?: PipelineDeferReason | null
  /** True when an in-flight upload is archive-only (no analysis quota). */
  pipelineArchiveOnly?: boolean
  /** Highlights-only session with no full-match VOD on disk. */
  clipsOnly?: boolean
  clipOnlyReason?: ClipOnlyReason
  clipCount?: number
  matchId?: string | null
}

export type NewRecording = Omit<PendingRecording, 'id' | 'recordedAt' | 'analysed'>

function isLocalOnlyRecording(rec: PendingRecording): boolean {
  if (rec.clipsOnly) return false
  const onCloud =
    (rec.analysed && rec.analysisId != null)
    || (rec.cloudArchived && rec.archiveId != null)
  return !onCloud
}

function matchesLinkedAccount(r: PendingRecording, linkedRiot?: LinkedRiotId | null): boolean {
  const name = r.riotName?.trim() || r.timeline?.playerName?.trim()
  const tag = r.riotTag?.trim() || r.timeline?.playerTag?.trim()
  return recordingMatchesLinkedRiot(name, tag, linkedRiot)
}

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
      const pruned = all.filter(r => {
        if (r.clipsOnly) return true
        if (r.path && fs.existsSync(r.path)) return true
        if (r.analysed && r.analysisId != null) return true
        if (r.cloudArchived && r.archiveId != null) return true
        if (r.analysed && r.pipelineStatus === 'analysing' && r.analysisId == null) return true
        return false
      })
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
    if (data.path && !data.clipsOnly) {
      try {
        fileSizeBytes = fs.statSync(data.path).size
      } catch { /* file might not be readable yet */ }
    }

    const recording: PendingRecording = {
      ...data,
      id: randomUUID(),
      recordedAt: Date.now(),
      analysed: false,
      pipelineStatus: data.pipelineStatus ?? 'pending',
      fileSizeBytes,
    }
    this.recordings.unshift(recording)
    if (this.recordings.length > 50) {
      const evicted = this.recordings.slice(50)
      this.recordings = this.recordings.slice(0, 50)
      for (const rec of evicted) {
        if (!isLocalOnlyRecording(rec)) continue
        if (!rec.path || !fs.existsSync(rec.path)) continue
        deleteLocalRecordingFiles(rec.path)
      }
    }
    this.persist()
    return recording
  }

  markArchived(id: string, archiveId: string): void {
    const rec = this.recordings.find(r => r.id === id)
    if (rec) {
      rec.cloudArchived = true
      rec.archiveId = archiveId
      this.persist()
    }
  }

  markAnalysed(id: string, jobId: string, analysisId?: number): void {
    const rec = this.recordings.find(r => r.id === id)
    if (rec) {
      rec.analysed = true
      rec.jobId = jobId
      rec.uploadProgress = undefined
      if (analysisId != null) {
        rec.analysisId = analysisId
        rec.pipelineStatus = undefined
        rec.analysisProgress = undefined
        rec.analysisStep = undefined
      } else {
        rec.pipelineStatus = 'analysing'
      }
      this.persist()
    }
  }

  setAnalysisId(id: string, analysisId: number): void {
    const rec = this.recordings.find(r => r.id === id)
    if (rec) {
      rec.analysisId = analysisId
      rec.pipelineStatus = undefined
      rec.analysisProgress = undefined
      rec.analysisStep = undefined
      rec.lastAnalysisError = undefined
      rec.lastAnalysisErrorHint = undefined
      rec.lastAnalysisCreditRefunded = undefined
      rec.lastAnalysisFailureDiagnostics = undefined
      this.persist()
    }
  }

  /** Clear in-flight upload/analysis UI state when a job finishes without a linked analysis id. */
  clearAnalysisPipeline(id: string): void {
    const rec = this.recordings.find(r => r.id === id)
    if (!rec) return
    rec.pipelineStatus = undefined
    rec.analysisProgress = undefined
    rec.analysisStep = undefined
    this.persist()
  }

  setAnalysisFailure(
    id: string,
    message: string,
    meta?: {
      hint?: string | null
      creditRefunded?: boolean
      failureDiagnostics?: Record<string, unknown> | null
    },
  ): void {
    const rec = this.recordings.find(r => r.id === id)
    if (!rec) return
    rec.pipelineStatus = undefined
    rec.analysisProgress = undefined
    rec.analysisStep = undefined
    rec.pipelineDeferReason = undefined
    rec.pipelineArchiveOnly = undefined
    rec.uploadProgress = undefined
    rec.jobId = undefined
    rec.lastAnalysisError = message
    rec.lastAnalysisErrorHint = meta?.hint ?? null
    rec.lastAnalysisCreditRefunded = meta?.creditRefunded ?? false
    rec.lastAnalysisFailureDiagnostics = meta?.failureDiagnostics ?? null
    rec.analysisFailureNotifiedAt = undefined
    // Keep jobId — cloud upload succeeded; needed for retry and support diagnostics.
    this.persist()
  }

  markAnalysisFailureNotified(id: string): void {
    const rec = this.recordings.find(r => r.id === id)
    if (!rec) return
    rec.analysisFailureNotifiedAt = Date.now()
    this.persist()
  }

  clearAnalysisFailure(id: string): void {
    const rec = this.recordings.find(r => r.id === id)
    if (!rec?.lastAnalysisError) return
    rec.lastAnalysisError = undefined
    rec.lastAnalysisErrorHint = undefined
    rec.lastAnalysisCreditRefunded = undefined
    rec.lastAnalysisFailureDiagnostics = undefined
    rec.analysisFailureNotifiedAt = undefined
    this.persist()
  }

  setPipelineDeferReason(id: string, reason: PipelineDeferReason): void {
    const rec = this.recordings.find(r => r.id === id)
    if (!rec) return
    rec.pipelineDeferReason = reason
    rec.pipelineStatus = 'pending'
    rec.uploadProgress = undefined
    this.persist()
  }

  clearPipelineDeferReason(id: string): void {
    const rec = this.recordings.find(r => r.id === id)
    if (!rec?.pipelineDeferReason) return
    rec.pipelineDeferReason = undefined
    this.persist()
  }

  setPipelineArchiveOnly(id: string, archiveOnly: boolean): void {
    const rec = this.recordings.find(r => r.id === id)
    if (!rec) return
    rec.pipelineArchiveOnly = archiveOnly
    this.persist()
  }

  /** Recordings with an active upload or analysis pipeline (dashboard in-flight rows). */
  listInFlightPipelines(): PendingRecording[] {
    return this.recordings.filter(
      (r) => r.pipelineStatus === 'uploading' || r.pipelineStatus === 'analysing',
    )
  }

  /** Recordings with a job id that still look in-flight on the dashboard. */
  listStuckAnalysisJobs(): PendingRecording[] {
    return this.recordings.filter(r => {
      if (!r.jobId) return false
      if (r.lastAnalysisError) return false
      if (r.pipelineStatus === 'analysing' || r.pipelineStatus === 'uploading') return true
      return r.analysed && r.analysisId == null
    })
  }

  /**
   * Reset upload rows left mid-S3 after a crash (no active upload in this process).
   * Returns count reset so the dashboard shows Analyse/Save again.
   */
  resetInterruptedUploads(activeUploadIds: ReadonlySet<string> = new Set()): number {
    let reset = 0
    for (const rec of this.recordings) {
      if (rec.pipelineStatus !== 'uploading') continue
      if (activeUploadIds.has(rec.id)) continue
      rec.pipelineStatus = 'pending'
      rec.uploadProgress = undefined
      reset++
    }
    if (reset > 0) this.persist()
    return reset
  }

  setPipelineStatus(id: string, status: RecordingPipelineStatus): void {
    const rec = this.recordings.find(r => r.id === id)
    if (!rec) return
    rec.pipelineStatus = status
    if (status === 'pending') {
      rec.uploadProgress = undefined
      rec.analysisProgress = undefined
      rec.analysisStep = undefined
    } else if (status === 'uploading') {
      rec.uploadProgress = rec.uploadProgress ?? 0
      rec.lastAnalysisError = undefined
      rec.lastAnalysisErrorHint = undefined
      rec.lastAnalysisCreditRefunded = undefined
      rec.pipelineDeferReason = undefined
    } else if (status === 'analysing') {
      rec.lastAnalysisError = undefined
      rec.lastAnalysisErrorHint = undefined
      rec.lastAnalysisCreditRefunded = undefined
      rec.pipelineDeferReason = undefined
      rec.pipelineArchiveOnly = undefined
    }
    this.persist()
  }

  setUploadProgress(id: string, progress: number): void {
    const rec = this.recordings.find(r => r.id === id)
    if (!rec) return
    rec.pipelineStatus = 'uploading'
    rec.uploadProgress = Math.min(100, Math.max(0, Math.round(progress)))
    this.persist()
  }

  setAnalysisProgress(id: string, progress: number, step: string | null): void {
    const rec = this.recordings.find(r => r.id === id)
    if (!rec) return
    rec.pipelineStatus = 'analysing'
    rec.analysisProgress = Math.min(100, Math.max(0, Math.round(progress)))
    rec.analysisStep = step
    this.persist()
  }

  updateClipOnlyMeta(
    id: string,
    patch: { clipCount?: number; timeline?: MatchData | null },
  ): void {
    const rec = this.recordings.find(r => r.id === id)
    if (!rec?.clipsOnly) return
    if (patch.clipCount != null) rec.clipCount = patch.clipCount
    if (patch.timeline !== undefined) rec.timeline = patch.timeline
    this.persist()
  }

  findRecentClipOnly(opts: {
    matchId: string | null
    agent: string | null
    withinMs: number
  }): PendingRecording | undefined {
    const cutoff = Date.now() - opts.withinMs
    return this.recordings.find(r => {
      if (!r.clipsOnly || r.recordedAt < cutoff) return false
      if (opts.matchId && r.matchId === opts.matchId) return true
      if (opts.agent && r.agent === opts.agent && !opts.matchId) return true
      return false
    })
  }

  getAnalysisId(id: string): number | null {
    return this.recordings.find(r => r.id === id)?.analysisId ?? null
  }

  getById(id: string): PendingRecording | undefined {
    return this.recordings.find(r => r.id === id)
  }

  getByJobId(jobId: string): PendingRecording | undefined {
    return this.recordings.find(r => r.jobId === jobId)
  }

  /** Local file path for a desktop upload job, if the recording still exists on disk. */
  getPathByJobId(jobId: string): string | null {
    const recording = this.recordings.find(r => r.jobId === jobId && r.path && fs.existsSync(r.path))
    return recording?.path ?? null
  }

  /** Match timeline captured for a desktop analysis job (for clip coaching context). */
  getTimelineByJobId(jobId: string): MatchData | null {
    return this.recordings.find((r) => r.jobId === jobId)?.timeline ?? null
  }

  updateTimeline(id: string, timeline: MatchData): boolean {
    const rec = this.recordings.find(r => r.id === id)
    if (!rec) return false
    rec.timeline = timeline
    this.persist()
    return true
  }

  /** Sessions visible on the dashboard: pending locals, in-flight upload/analysis, clip-only stubs. */
  getPending(linkedRiot?: LinkedRiotId | null): PendingRecording[] {
    return this.recordings.filter(r => {
      if (!matchesLinkedAccount(r, linkedRiot)) return false

      if (r.clipsOnly) return true

      if (r.analysed) {
        if (r.analysisId != null) return false
        return r.pipelineStatus === 'analysing' || r.pipelineStatus === 'uploading'
      }

      const hasLocal = r.path ? fs.existsSync(r.path) : false
      const hasCloud = r.cloudArchived && r.archiveId != null
      if (!hasLocal && !hasCloud) return false
      return true
    })
  }

  /** Recordings on cloud (analysed or archive-only) that still have a local file. */
  getCloudBackedLocal(linkedRiot?: LinkedRiotId | null): PendingRecording[] {
    return this.recordings.filter(r => {
      if (r.clipsOnly) return false
      const onCloud = (r.analysed && r.analysisId != null) || (r.cloudArchived && r.archiveId != null)
      if (!onCloud || !r.path || !fs.existsSync(r.path)) return false
      return matchesLinkedAccount(r, linkedRiot)
    })
  }

  getKnownPaths(): Set<string> {
    const paths = new Set<string>()
    for (const recording of this.recordings) {
      if (!recording.path) continue
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
      const key = recording.clipsOnly || !recording.path
        ? `clips-only:${recording.id}`
        : recordingStemKey(recording.path)
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

export { isLocalOnlyRecording }
