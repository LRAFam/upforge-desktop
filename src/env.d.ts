/// <reference types="vite/client" />

declare global {
  const __APP_VERSION__: string
}

export interface AppSettings {
  recordingQuality: '720p' | '1080p'
  recordingBitrate: number
  savePath: string
  launchOnStartup: boolean
  autoDelete: boolean
  /** Game modes to record. Empty array means record all. */
  recordedModes: string[]
  autoAnalyse: boolean
  firstRun: boolean
}

export interface PendingRecording {
  id: string
  path: string
  game: string
  map: string | null
  agent: string | null
  gameMode: string
  recordedAt: number
  analysed: boolean
  jobId?: string
  fileSizeBytes?: number
}

export interface ValorantStats {
  player_name: string | null
  player_tag: string | null
  current_rank: string | null
  peak_rank: string | null
  rr: number | null
  kd_ratio: number | null
  win_rate: number | null
  avg_combat_score: number | null
  headshot_percentage: number | null
  most_played_agent: string | null
  most_played_map: string | null
  player_card_id: string | null
  last_updated: string | null
}

export interface ProfileData {
  user: {
    id: number
    name: string
    email: string
    tier: string
    riot_name: string | null
    riot_tag: string | null
    riot_region: string | null
    discord_username: string | null
    analysis_stats: {
      total: number
      limit: number
    }
  }
  latest_stats: ValorantStats | null
}

export interface ClipRecord {
  id: string
  title: string
  videoPath: string
  thumbnailPath: string | null
  trigger: 'manual' | 'kill' | 'ace' | 'clutch'
  map: string | null
  agent: string | null
  durationSeconds: number
  round: number | null
  createdAt: number
  analysisJobId: string | null
  uploadedAt: number | null
  apiClipId: number | null
  shareToken: string | null
  publishedAt: number | null
  analysisStatus: 'none' | 'pending' | 'completed' | 'failed'
  analysisVerdict: string | null
  analysisSuggestion: string | null
  analysisScore: number | null
}

export interface AnalysisItem {
  id: number
  job_id: string | null
  status: string
  map: string | null
  agent: string | null
  game_mode: string | null
  won: boolean | null
  kills: number | null
  deaths: number | null
  assists: number | null
  kda: number | null
  combat_score: number | null
  overall_score: number | null
  rounds_won: number | null
  rounds_lost: number | null
  hs_pct: number | null
  rank: string | null
  created_at: string
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
          waitingForMatch: boolean
          authenticated: boolean
          isDev: boolean
          firstRun: boolean
          platform: string
          version: string
          ffmpegOk: boolean
          recordedModes: string[]
          user: {
            name: string
            email: string
            tier: string
            riot_name: string | null
            riot_tag: string | null
          } | null
        }>
        getActivityLog: () => Promise<{ time: number; message: string }[]>
      }
      profile: {
        get: () => Promise<ProfileData | null>
      }
      analyses: {
        get: (limit?: number) => Promise<AnalysisItem[]>
      }
      recordings: {
        get: () => Promise<PendingRecording[]>
        analyse: (id: string) => Promise<{ ok?: boolean; error?: string }>
        dismiss: (id: string) => Promise<void>
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
      recorder: {
        stop: () => Promise<{ ok: boolean; reason?: string }>
      }
      updater: {
        check: () => Promise<void>
      }
      debug: {
        testRiotApi: () => Promise<{ portOpen: boolean; gameMode: string | null; processRunning: boolean }>
      }
      storage: {
        getUsage: () => Promise<{ bytes: number; count: number }>
        openFolder: () => Promise<void>
      }
      clips: {
        get: () => Promise<ClipRecord[]>
        getThumbnail: (id: string) => Promise<string | null>
        delete: (id: string) => Promise<{ ok: boolean }>
        updateTitle: (id: string, title: string) => Promise<{ ok: boolean }>
        openFolder: (id: string) => Promise<void>
        getHotkeys: () => Promise<Record<string, string>>
        setHotkey: (action: string, accelerator: string) => Promise<{ ok: boolean }>
        upload: (id: string) => Promise<{ ok: boolean; apiClipId?: number; error?: string }>
        requestAnalysis: (id: string) => Promise<{ ok: boolean; error?: string }>
        share: (id: string) => Promise<{ ok: boolean; shareToken?: string; error?: string }>
        publish: (id: string, caption?: string) => Promise<{ ok: boolean; error?: string }>
      }
      squad: {
        getTeam: () => Promise<{
          team: { name: string; members: { id: number; name: string; riot_name?: string; riot_tag?: string }[] } | null
          activity: { id: number; user_id: number; map?: string; agent?: string; result?: string }[]
          presence: Record<number, { online: boolean; is_recording: boolean }>
        } | null>
        sendPresence: (recording: boolean, game: string | null) => Promise<{ ok: boolean }>
      }
      overlay: {
        toggle: () => Promise<void>
      }
      on: (channel: string, callback: (...args: unknown[]) => void) => (() => void)
    }
  }
}
