import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import {
  getRecordingPresetValues,
  type RecordingPresetId,
} from './recording-preset'

export type PrimaryGame = 'valorant' | 'cs2' | 'deadlock'

export interface AppSettings {
  /** Active game context — drives dashboard copy, settings sections, and web links. */
  primaryGame: PrimaryGame
  /** Coaching (720p) or creator (1080p60) recording preset. */
  recordingPreset: RecordingPresetId
  recordingQuality: '720p' | '1080p'
  recordingBitrate: number // Mbps — derived from recordingPreset
  recordingFps: 24 | 30 | 60
  audioEnabled: boolean
  savePath: string
  launchOnStartup: boolean
  autoDelete: boolean // delete recording after successful upload
  /** Game modes to record. Empty array means record nothing. */
  recordedModes: string[]
  autoAnalyse: boolean // automatically upload & analyse after game ends
  firstRun: boolean
  /** Set after welcome / onboarding wizard — avoids re-prompting on every launch */
  onboardingComplete?: boolean
  /** Which monitor to capture. 'auto' detects from the game window; numbers are 0-based display index. */
  captureMonitor: 'auto' | number
  /** Last completed analysis insight — persisted for dashboard display */
  lastInsight?: { text: string; score: number; agent: string | null; analysisId: number | null; date: string } | null
  /** Rolling RPG-style skill scores updated after each analysis */
  skillProfile?: import('../../src/lib/skill-profile').SkillProfileSnapshot | null
  /** Previous snapshot for trend arrows on dashboard */
  skillProfilePrevious?: import('../../src/lib/skill-profile').SkillProfileSnapshot | null
  /** Process names to auto-kill when a game is detected starting */
  pregameKillList: string[]
  /** Auto-delete local-only clips older than this many days (0 = disabled) */
  clipRetentionDays: number
  /** Auto-delete local-only match recordings older than this many days (0 = disabled) */
  recordingRetentionDays: number
  /** When false, only save replay-buffer highlight clips (no full-match VOD). */
  fullMatchRecording: boolean
  /** Play a sound when a notification fires */
  notificationSound: boolean
  /** Show match status in Discord Rich Presence (requires Discord desktop + activity sharing on) */
  discordRichPresence: boolean
  /**
   * How in-game hotkey feedback is delivered.
   * - notifications: Windows toasts + beep (works in Valorant fullscreen)
   * - overlay: in-game overlay only (needs Windowed Fullscreen in Valorant)
   * - all: both channels
   */
  inGameFeedback: 'notifications' | 'overlay' | 'all'
  /** Last detected hardware encoder — cached to skip detection on next launch */
  cachedEncoder: string | null
  /** Whether ddagrab was available last launch */
  cachedUseDdagrab: boolean | null
  /** Override path for the CS2 demo directory (undefined = auto-detect via Steam registry) */
  cs2DemoDir?: string
  /** Developer / admin mode — unlocked by tapping the version number 5 times in Settings */
  devModeEnabled: boolean
  /** OBS WebSocket recording — always on; kept for settings migration */
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
    movementSpeed: number   // m/s — how fast the player moves in trainer scenarios
    trainerVolume: number   // 0–100 — hit/miss sound volume
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
  /** Auto-open the results page in the browser when analysis completes */
  autoOpenBrowser: boolean
  /**
   * When true, cloud-archived VODs may be used for anonymised model training (separate from storage).
   * Does not affect analysis quota.
   */
  trainingConsent: boolean
}

export type InGameFeedbackMode = AppSettings['inGameFeedback']

function applyRecordingPresetFields(
  settings: Partial<AppSettings>,
  allowCreator = true,
): Pick<
  AppSettings,
  'recordingPreset' | 'recordingQuality' | 'recordingBitrate' | 'recordingFps'
> {
  let presetId: RecordingPresetId = settings.recordingPreset === 'creator' ? 'creator' : 'coaching'
  if (presetId === 'creator' && !allowCreator) {
    presetId = 'coaching'
  }
  const preset = getRecordingPresetValues(presetId)
  return {
    recordingPreset: presetId,
    recordingQuality: preset.quality,
    recordingBitrate: preset.bitrate,
    recordingFps: preset.fps,
  }
}

const DEFAULTS: AppSettings = {
  primaryGame: 'valorant',
  ...applyRecordingPresetFields({ recordingPreset: 'coaching' }),
  audioEnabled: true,
  savePath: '',
  launchOnStartup: false,
  autoDelete: true,
  recordedModes: ['COMPETITIVE', 'PREMIER'],
  autoAnalyse: true,
  firstRun: true,
  captureMonitor: 'auto',
  pregameKillList: [],
  clipRetentionDays: 0,
  recordingRetentionDays: 14,
  fullMatchRecording: true,
  notificationSound: true,
  discordRichPresence: true,
  inGameFeedback: 'notifications',
  cachedEncoder: null,
  cachedUseDdagrab: null,
  devModeEnabled: false,
  obsEnabled: true,
  obsHost: '127.0.0.1',
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
    movementSpeed: 6.75,
    trainerVolume: 80,
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
  autoOpenBrowser: false,
  trainingConsent: false,
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
      // localhost → 127.0.0.1: on Windows localhost often resolves to IPv6 while OBS listens on IPv4
      if (parsed.obsHost === 'localhost') {
        parsed.obsHost = '127.0.0.1'
      }
      // Users who finished welcome before onboardingComplete existed
      if (parsed.firstRun === false && parsed.onboardingComplete === undefined) {
        parsed.onboardingComplete = true
      }
      // Migrate trainerMouse.game → primaryGame for existing installs
      if (!parsed.primaryGame && parsed.trainerMouse?.game) {
        const g = parsed.trainerMouse.game
        if (g === 'valorant' || g === 'cs2' || g === 'deadlock') {
          parsed.primaryGame = g
        }
      }
      const merged = { ...DEFAULTS, ...parsed, obsEnabled: true }
      if (!String(merged.savePath ?? '').trim()) {
        merged.savePath = DEFAULTS.savePath
      }
      return { ...merged, ...applyRecordingPresetFields(merged) }
    } catch {
      return { ...DEFAULTS }
    }
  }

  get(): AppSettings {
    return { ...this.settings }
  }

  save(partial: Partial<AppSettings>, opts?: { allowCreator?: boolean }): AppSettings {
    const allowCreator = opts?.allowCreator ?? true
    this.settings = {
      ...this.settings,
      ...partial,
      ...applyRecordingPresetFields({ ...this.settings, ...partial }, allowCreator),
    }
    if (!String(this.settings.savePath ?? '').trim()) {
      this.settings.savePath = DEFAULTS.savePath
    }
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2))
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOSPC') {
        console.error('[SettingsManager] Disk full — could not save settings')
      } else {
        console.error('[SettingsManager] Failed to save settings:', err)
      }
    }
    return this.settings
  }
}
