/// <reference types="vite/client" />

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
        platform: string
        user: { name: string; tier: string; riot_name: string | null; riot_tag: string | null } | null
      }>
    }
    dev: {
      simulateGame: (game?: string, durationMs?: number) => Promise<{ ok: boolean }>
    }
    window: {
      minimize: () => Promise<void>
      close: () => Promise<void>
    }
    on: (channel: string, callback: (...args: unknown[]) => void) => void
    off: (channel: string, callback: (...args: unknown[]) => void) => void
  }
}
