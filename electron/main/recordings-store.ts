import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { MatchData } from './riot-local-api'

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
}

export type NewRecording = Omit<PendingRecording, 'id' | 'recordedAt' | 'analysed'>

export class RecordingsStore {
  private recordings: PendingRecording[] = []
  private filePath: string

  constructor() {
    const userDataPath = app.getPath('userData')
    this.filePath = path.join(userDataPath, 'recordings.json')
    this.recordings = this.load()
  }

  private load(): PendingRecording[] {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return []
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(this.recordings, null, 2))
  }

  add(data: NewRecording): PendingRecording {
    const recording: PendingRecording = {
      ...data,
      id: randomUUID(),
      recordedAt: Date.now(),
      analysed: false
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

  /** Returns recordings that haven't been analysed and whose file still exists */
  getPending(): PendingRecording[] {
    return this.recordings.filter(r => !r.analysed && fs.existsSync(r.path))
  }

  remove(id: string): void {
    this.recordings = this.recordings.filter(r => r.id !== id)
    this.persist()
  }
}
