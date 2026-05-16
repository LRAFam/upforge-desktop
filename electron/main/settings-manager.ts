import { app } from 'electron'
import fs from 'fs'
import path from 'path'

export interface AppSettings {
  recordingQuality: '720p' | '1080p'
  recordingBitrate: number // Mbps: 4, 6, 8, 12, 15, 20
  recordingFps: 24 | 30 | 60
  audioEnabled: boolean
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
  /** Auto-delete clips older than this many days (0 = disabled) */
  clipRetentionDays: number
  /** Play a sound when a notification fires */
  notificationSound: boolean
  /** Last detected hardware encoder — cached to skip detection on next launch */
  cachedEncoder: string | null
  /** Whether ddagrab was available last launch */
  cachedUseDdagrab: boolean | null
  /** Developer / admin mode — unlocked by tapping the version number 5 times in Settings */
  devModeEnabled: boolean
  /** Use OBS WebSocket for recording (Pro tier) instead of desktopCapturer */
  obsEnabled: boolean
  /** OBS WebSocket host (default: localhost) */
  obsHost: string
  /** OBS WebSocket port (default: 4455, OBS 28+) */
  obsPort: number
  /** OBS WebSocket password (leave empty if auth is disabled in OBS) */
  obsPassword: string
  /** Replay buffer length in seconds — how much footage to save per kill clip */
  obsReplayBufferSeconds: number
  /** Mouse & trainer sensitivity settings */
  trainerMouse: {
    dpi: number
    game: 'valorant' | 'cs2' | 'deadlock' | 'apex' | 'overwatch2' | 'custom'
    sensitivity: number
    fov: number
    rawInput: boolean
    pollingRate: 125 | 250 | 500 | 1000 | 2000 | 4000
  }
  /** Crosshair appearance for the aim trainer */
  crosshairSettings: {
    colorIndex: number  // 0=white, 1=green, 2=yellow, 3=cyan, 4=pink, 5=red, 6=custom
    customColor: string // hex without '#', e.g. '00FF6B'
    dotShow: boolean
    dotRadius: number   // 0.5–6
    dotOpacity: number  // 0–1
    innerShow: boolean
    innerThickness: number // 0.5–8
    innerLength: number    // 0–30
    innerOffset: number    // 0–20
    innerOpacity: number   // 0–1
    outerShow: boolean
    outerThickness: number
    outerLength: number
    outerOffset: number
    outerOpacity: number
    shadowShow: boolean
  }
}

const DEFAULTS: AppSettings = {
  recordingQuality: '1080p',
  recordingBitrate: 6,
  recordingFps: 30,
  audioEnabled: true,
  savePath: '',
  launchOnStartup: false,
  autoDelete: false,
  recordedModes: ['COMPETITIVE', 'PREMIER'],
  autoAnalyse: true,
  firstRun: true,
  captureMonitor: 'auto',
  pregameKillList: [],
  clipRetentionDays: 0,
  notificationSound: true,
  cachedEncoder: null,
  cachedUseDdagrab: null,
  devModeEnabled: false,
  obsEnabled: false,
  obsHost: 'localhost',
  obsPort: 4455,
  obsPassword: '',
  obsReplayBufferSeconds: 30,
  trainerMouse: {
    dpi: 800,
    game: 'valorant',
    sensitivity: 0.5,
    fov: 103,
    rawInput: true,
    pollingRate: 1000,
  },
  crosshairSettings: {
    colorIndex: 1,        // Valorant green default
    customColor: '00FF6B',
    dotShow: true,
    dotRadius: 1.5,
    dotOpacity: 1.0,
    innerShow: true,
    innerThickness: 2,
    innerLength: 10,
    innerOffset: 4,
    innerOpacity: 1.0,
    outerShow: false,
    outerThickness: 2,
    outerLength: 5,
    outerOffset: 10,
    outerOpacity: 1.0,
    shadowShow: true,
  },
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
