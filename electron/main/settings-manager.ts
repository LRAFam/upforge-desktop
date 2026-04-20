import { app } from 'electron'
import fs from 'fs'
import path from 'path'

export interface AppSettings {
  recordingQuality: '720p' | '1080p'
  recordingBitrate: number // Mbps: 4, 6, 8, 12
  savePath: string
  launchOnStartup: boolean
  autoDelete: boolean // delete recording after successful upload
}

const DEFAULTS: AppSettings = {
  recordingQuality: '1080p',
  recordingBitrate: 6,
  savePath: '',
  launchOnStartup: false,
  autoDelete: true
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
      return { ...DEFAULTS, ...JSON.parse(raw) }
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
