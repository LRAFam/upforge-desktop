import { app } from 'electron'
import fs from 'fs'
import path from 'path'

export interface AppSettings {
  recordingQuality: '720p' | '1080p'
  recordingBitrate: number // Mbps: 4, 6, 8, 12
  savePath: string
  launchOnStartup: boolean
  autoDelete: boolean // delete recording after successful upload
  /** Game modes to record. Empty array means record all. */
  recordedModes: string[]
  autoAnalyse: boolean // automatically upload & analyse after game ends
  firstRun: boolean
  /** Which monitor to capture. 'auto' detects from the game window; numbers are 0-based display index. */
  captureMonitor: 'auto' | number
  /** Last completed analysis insight — persisted for dashboard display */
  lastInsight?: { text: string; score: number; agent: string | null; analysisId: number | null; date: string } | null
  /** Process names to auto-kill when a game is detected starting */
  pregameKillList: string[]
}

const DEFAULTS: AppSettings = {
  recordingQuality: '1080p',
  recordingBitrate: 6,
  savePath: '',
  launchOnStartup: false,
  autoDelete: true,
  recordedModes: ['COMPETITIVE', 'PREMIER'],
  autoAnalyse: true,
  firstRun: true,
  captureMonitor: 'auto',
  pregameKillList: [],
}

export class SettingsManager {
  private settings: AppSettings
  private filePath: string

  constructor() {
    const userDataPath = app.getPath('userData')
    this.filePath = path.join(userDataPath, 'settings.json')
    DEFAULTS.savePath = path.join(userDataPath, 'recordings')
    this.settings = this.load()
  }

  private load(): AppSettings {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      // Migrate from old recordingMode field
      if (parsed.recordingMode !== undefined && parsed.recordedModes === undefined) {
        const ALL_MODES = ['COMPETITIVE', 'PREMIER', 'CLASSIC', 'DEATHMATCH', 'SPIKERUSH', 'SWIFTPLAY']
        parsed.recordedModes = parsed.recordingMode === 'all' ? ALL_MODES : ['COMPETITIVE', 'PREMIER']
        delete parsed.recordingMode
      }
      // Guard against null/non-array recordedModes from corrupted saves
      if (!Array.isArray(parsed.recordedModes)) {
        delete parsed.recordedModes
      }
      return { ...DEFAULTS, ...parsed }
    } catch {
      return { ...DEFAULTS }
    }
  }

  get(): AppSettings {
    return { ...this.settings }
  }

  save(partial: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...partial }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2))
    return this.settings
  }
}
