/// <reference types="vite/client" />

declare const __APP_VERSION__: string

export interface AppSettings {
  recordingQuality: '720p' | '1080p'
  recordingBitrate: number
  savePath: string
  launchOnStartup: boolean
  autoDelete: boolean
  firstRun: boolean
}

declare global {
  interface Window {
    api: {
      auth: {
        login: (email: string, password: string) => Promise<{ ok: boolean; user?: unknown; error?: string }>
        logout: () => Promise<void>
        getUser: () => Promise<unknown>
        loadStored: () => Promise<{ ok: boolean; user?: unknown }>
      }
      app: {
        getStatus: () => Promise<{
          recording: boolean
          currentGame: string | null
          authenticated: boolean
          isDev: boolean
          firstRun: boolean
          platform: string
          version: string
          user: {
            name: string
            email: string
            tier: string
            riot_name: string | null
            riot_tag: string | null
          } | null
        }>
      }
      settings: {
        get: () => Promise<AppSettings>
        save: (partial: Partial<AppSettings>) => Promise<AppSettings>
      }
      dialog: {
        openDirectory: () => Promise<string | null>
      }
      dev: {
        simulateGame: (game?: string, durationMs?: number) => Promise<{ ok: boolean }>
      }
      window: {
        minimize: () => Promise<void>
        close: () => Promise<void>
        openPostGame?: () => Promise<void>
      }
      updater: {
        check: () => Promise<void>
      }
      on: (channel: string, callback: (...args: unknown[]) => void) => void
      off: (channel: string, callback: (...args: unknown[]) => void) => void
    }
  }
}
