import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

export type ClipTrigger = 'manual' | 'kill' | 'ace' | 'multikill' | 'clutch' | 'hotkey'
export type ClipUploadStatus = 'local' | 'uploading' | 'uploaded' | 'failed'
export type ClipAnalysisStatus = 'none' | 'queued' | 'processing' | 'completed' | 'failed'

export interface ClipRecord {
  id: string
  /** Path to the extracted clip MP4 on disk */
  path: string
  /** Path to thumbnail JPG on disk, if generated */
  thumbPath: string | null
  /** What triggered this clip */
  trigger: ClipTrigger
  map: string | null
  agent: string | null
  /** Duration in seconds */
  durationSeconds: number
  /** Which round the key moment occurred in */
  round: number | null
  /** For multi-kill and clutch clips: number of kills in the round (3=3k, 4=4k, 5=ace etc.) */
  killCount: number | null
  /** Title set by user */
  title: string | null
  savedAt: number
  /** ID of the analysis job this clip came from (for linking to match) */
  analysisJobId: string | null
  uploadStatus: ClipUploadStatus
  /** API clip ID once uploaded */
  apiClipId: number | null
  /** Public share token returned by API */
  shareToken: string | null
  analysisStatus: ClipAnalysisStatus
  /** AI coaching verdict e.g. "Good positioning" */
  verdict: string | null
  /** 1-2 sentence coaching suggestion */
  suggestion: string | null
  /** Tags e.g. ["positioning", "util_usage"] */
  coachingTags: string[]
  /** 1-10 score */
  overallScore: number | null
  /** Whether the clip has been published to the community feed */
  published: boolean
  /** Whether the user has starred/favourited this clip */
  favorited: boolean
}

export type NewClip = Pick<ClipRecord,
  'path' | 'thumbPath' | 'trigger' | 'map' | 'agent' | 'durationSeconds' | 'round' | 'analysisJobId' | 'killCount'
>

export class ClipStore {
  private clips: ClipRecord[] = []
  private filePath: string

  constructor() {
    const userDataPath = app.getPath('userData')
    this.filePath = path.join(userDataPath, 'clips.json')
    this.clips = this._load()
  }

  private _load(): ClipRecord[] {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const all: ClipRecord[] = JSON.parse(raw)
      // Prune clips whose file no longer exists (unless uploaded to API)
      return all.filter(c => c.apiClipId != null || fs.existsSync(c.path))
    } catch {
      return []
    }
  }

  private _persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(this.clips, null, 2))
  }

  add(data: NewClip): ClipRecord {
    const clip: ClipRecord = {
      id: randomUUID(),
      path: data.path,
      thumbPath: data.thumbPath,
      trigger: data.trigger,
      map: data.map,
      agent: data.agent,
      durationSeconds: data.durationSeconds,
      round: data.round ?? null,
      title: null,
      savedAt: Date.now(),
      analysisJobId: data.analysisJobId,
      killCount: data.killCount ?? null,
      uploadStatus: 'local',
      apiClipId: null,
      analysisStatus: 'none',
      verdict: null,
      suggestion: null,
      coachingTags: [],
      overallScore: null,
      published: false,
      shareToken: null,
      favorited: false,
    }
    this.clips.unshift(clip)
    // Keep last 200 clips in the store
    if (this.clips.length > 200) this.clips = this.clips.slice(0, 200)
    this._persist()
    return clip
  }

  update(id: string, patch: Partial<ClipRecord>): void {
    const clip = this.clips.find(c => c.id === id)
    if (clip) {
      Object.assign(clip, patch)
      this._persist()
    }
  }

  remove(id: string): ClipRecord | null {
    const idx = this.clips.findIndex(c => c.id === id)
    if (idx === -1) return null
    const [removed] = this.clips.splice(idx, 1)
    this._persist()
    return removed
  }

  getById(id: string): ClipRecord | undefined {
    return this.clips.find(c => c.id === id)
  }

  getAll(): ClipRecord[] {
    return this.clips.slice()
  }

  /** Return clips matching optional filters */
  query(opts: { map?: string; agent?: string; trigger?: ClipTrigger } = {}): ClipRecord[] {
    return this.clips.filter(c => {
      if (opts.map && c.map !== opts.map) return false
      if (opts.agent && c.agent !== opts.agent) return false
      if (opts.trigger && c.trigger !== opts.trigger) return false
      return true
    })
  }

  /** Delete local-only clips older than `days` days and persist. */
  pruneByAge(days: number): number {
    if (days <= 0) return 0
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    const before = this.clips.length
    this.clips = this.clips.filter(c => {
      if (c.apiClipId != null || c.savedAt >= cutoff) return true
      for (const p of [c.path, c.thumbPath]) {
        if (p) try { if (fs.existsSync(p)) fs.unlinkSync(p) } catch { /* ignore */ }
      }
      return false
    })
    if (this.clips.length !== before) this._persist()
    return before - this.clips.length
  }

  /** Remove thumbnail files that have no matching clip record. */
  pruneOrphanedThumbnails(): void {
    const clipsDir = path.join(path.dirname(this.filePath), 'clips')
    if (!fs.existsSync(clipsDir)) return
    const knownThumbs = new Set(this.clips.map(c => c.thumbPath).filter(Boolean))
    try {
      for (const file of fs.readdirSync(clipsDir)) {
        if (!file.endsWith('_thumb.jpg')) continue
        const full = path.join(clipsDir, file)
        if (!knownThumbs.has(full)) {
          try { fs.unlinkSync(full) } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
}
