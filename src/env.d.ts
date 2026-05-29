/// <reference types="vite/client" />

declare global {
  const __APP_VERSION__: string
}

export interface TrainingScenarioStats {
  best_score: number | null
  trend: number | null
  sessions: Array<{
    id: number
    scenario: string
    score: number
    accuracy_pct: number
    avg_reaction_ms: number
    consistency_score: number
    targets_hit: number
    targets_missed: number
    completed_at: string
  }>
}

export interface TrainingBenchmark {
  [scenario: string]: {
    user_best: number | null
    user_avg: number | null
    global_avg: number | null
    global_best: number | null
    percentile: number | null
    label: string | null
    peers: number
  }
}


export interface TrainingHistory {
  total: number
  sessions: Array<{
    id: number
    scenario: string
    score: number
    accuracy_pct: number
    avg_reaction_ms: number
    consistency_score: number
    targets_hit: number
    targets_missed: number
    completed_at: string
  }>
  by_scenario: Record<string, TrainingScenarioStats>
}

export interface CoachingDrill {
  id: number
  category: string
  title: string
  instructions: string | null
  success_metric: string | null
  practice_mode: string | null
  baseline_score: number
  target_score: number
  status: string
}

export interface AppSettings {
  recordingQuality: '720p' | '1080p'
  recordingBitrate: number
  recordingFps: 24 | 30 | 60
  audioEnabled: boolean
  savePath: string
  launchOnStartup: boolean
  autoDelete: boolean
  /** Game modes to record. Empty array means record all. */
  recordedModes: string[]
  autoAnalyse: boolean
  firstRun: boolean
  /** Which monitor to capture. 'auto' detects from game window; numbers are 0-based display index. */
  captureMonitor: 'auto' | number
  /** Process names to auto-kill when a game is detected starting */
  pregameKillList: string[]
  /** Auto-delete clips older than this many days (0 = disabled) */
  clipRetentionDays: number
  /** Play a sound when a notification fires */
  notificationSound: boolean
  /** Auto-open the results page in the browser when analysis completes */
  autoOpenBrowser: boolean
  /** Last detected hardware encoder — cached to skip detection on next launch */
  cachedEncoder: string | null
  /** Whether ddagrab was available last launch */
  cachedUseDdagrab: boolean | null
  /** Developer / admin mode — unlocked by tapping version 5× in Settings */
  devModeEnabled: boolean
  /** Set to true once the first-run onboarding wizard has been completed */
  onboardingComplete?: boolean
  /** Unlocked achievement IDs mapped to ISO date strings */
  achievements?: Record<string, string>
  /** Use OBS WebSocket for recording instead of desktopCapturer (Pro tier) */
  obsEnabled: boolean
  /** OBS WebSocket host */
  obsHost: string
  /** OBS WebSocket port */
  obsPort: number
  /** OBS WebSocket password */
  obsPassword: string
  /** Replay buffer length in seconds */
  obsReplayBufferSeconds: number
  /** Mouse & trainer sensitivity settings */
  trainerMouse: {
    dpi: number
    game: 'valorant' | 'cs2' | 'deadlock' | 'apex' | 'overwatch2' | 'custom'
    sensitivity: number
    fov: number
    rawInput: boolean
    pollingRate: 125 | 250 | 500 | 1000 | 2000 | 4000
    movementSpeed: number
    trainerVolume: number
  }
  /** Crosshair appearance for the aim trainer */
  crosshairSettings: {
    colorIndex: number
    customColor: string
    dotShow: boolean
    dotRadius: number
    dotOpacity: number
    innerShow: boolean
    innerThickness: number
    innerLength: number
    innerOffset: number
    innerOpacity: number
    outerShow: boolean
    outerThickness: number
    outerLength: number
    outerOffset: number
    outerOpacity: number
    shadowShow: boolean
  }
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
  timeline?: {
    playerKills?: Array<{ killerName: string; victimName: string; weapon?: string; videoOffsetMs?: number; round?: number }>
    playerDeaths?: Array<{ killerName: string; victimName: string; weapon?: string; videoOffsetMs?: number; round?: number }>
  } | null
}

export interface RecordingTimeline {
  id: string
  videoPath: string | null
  map: string | null
  agent: string | null
  game: string
  gameMode: string
  recordedAt: number
  kills: Array<{ killerName: string; victimName: string; weapon?: string; videoOffsetMs?: number; round?: number; killerPuuid?: string; victimPuuid?: string }>
  deaths: Array<{ killerName: string; victimName: string; weapon?: string; videoOffsetMs?: number; round?: number; killerPuuid?: string; victimPuuid?: string }>
  roundSummaries: Array<{ roundNumber: number; winningTeam: string | null; spikePlanted: boolean; spikeDefused: boolean }>
  finalStats: { kills: number; deaths: number; assists: number; won?: boolean } | null
  teamSnapshot: Array<{
    summonerName: string
    agent: string | null
    team: string
    kills: number
    deaths: number
    assists: number
    score: number
    level: number
    puuid: string | null
    competitiveTier: number
    competitiveTierName: string
    abilityCasts: { grenade: number; ability1: number; ability2: number; ultimate: number } | null
  }>
}

export interface ValorantStats {
  player_tag: string | null
  current_rank: string | null
  peak_rank: string | null
  rr: number | null
  elo: number | null
  last_rr_change: number | null
  leaderboard_rank: number | null
  peak_season: string | null
  account_level: number | null
  seasonal_history: unknown[] | null
  kd_ratio: number | null
  win_rate: number | null
  avg_combat_score: number | null
  headshot_percentage: number | null
  most_played_agent: string | null
  most_played_map: string | null
  player_card_id: string | null
  last_updated: string | null
}

export interface ForgeRankInfo {
  level: number
  tier: number
  tier_name: string
  sub_rank: number
  sub_rank_label: string
  rank_name: string
  xp: number
  xp_for_level: number
  xp_for_next: number | null
  xp_progress: number
  xp_needed: number | null
  progress_pct: number
  prestige_stars: number
  can_prestige: boolean
  is_max_level: boolean
  prestige_xp: number
}

export interface ProfileData {
  user: {
    id: number
    name: string
    email: string
    tier: string
    is_admin: boolean
    riot_name: string | null
    riot_tag: string | null
    riot_region: string | null
    discord_username: string | null
    analysis_stats: {
      total: number
      limit: number
      subscription_ends_at?: string | null
    }
    forge_rank?: ForgeRankInfo
  }
  latest_stats: ValorantStats | null
}

export interface ClipRecord {
  id: string
  /** Path to the extracted clip MP4 on disk */
  path: string
  /** Path to thumbnail JPG on disk, if generated */
  thumbPath: string | null
  trigger: 'manual' | 'kill' | 'ace' | 'multikill' | 'clutch' | 'hotkey'
  map: string | null
  agent: string | null
  durationSeconds: number
  round: number | null
  killCount: number | null
  title: string | null
  savedAt: number
  analysisJobId: string | null
  uploadStatus: 'local' | 'uploading' | 'uploaded' | 'failed'
  apiClipId: number | null
  shareToken: string | null
  analysisStatus: 'none' | 'queued' | 'processing' | 'completed' | 'failed'
  verdict: string | null
  suggestion: string | null
  coachingTags: string[]
  overallScore: number | null
  published: boolean
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

export interface DeadlockProfileStats {
  current_rank: { name: string; subtier: number | null; image: string | null } | null
  summary: { wins: number; losses: number; win_rate: number; avg_kda: string }
  recent_matches: Array<{
    match_id: number
    match_result: number
    hero_name: string
    hero_icon: string | null
    hero_color: number[]
    player_kills: number
    player_deaths: number
    player_assists: number
    net_worth: number
    match_duration_s: number
  }>
  hero_stats: Array<{
    hero_id: number
    hero_name: string
    hero_icon: string | null
    hero_color: number[]
    matches_played: number
    win_rate: number
  }>
  mmr_history: Array<{ rank: number | null }>
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
          recordingStartedAt: number | null
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
            is_admin: boolean
            riot_name: string | null
            riot_tag: string | null
          } | null
        }>
        getActivityLog: () => Promise<{ time: number; message: string }[]>
        showClips: () => Promise<{ ok: boolean }>
      }
      profile: {
        get: () => Promise<ProfileData | null>
      }
      analyses: {
        get: (limit?: number) => Promise<AnalysisItem[]>
        getTimeline: (id: number) => Promise<RecordingTimeline | null>
        getDetail: (id: number) => Promise<{ verdict: string | null; top_issue: string | null; priority_improvements: string[]; coaching_tags: string[]; ally_score: number | null; enemy_score: number | null } | null>
      }
      recordings: {
        get: () => Promise<PendingRecording[]>
        analyse: (id: string) => Promise<{ ok?: boolean; error?: string }>
        dismiss: (id: string) => Promise<void>
        getTimeline: (id: string) => Promise<RecordingTimeline | null>
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
        getDiagnostics: () => Promise<{
          app: { version: string; platform: string; arch: string; electronVersion: string; nodeVersion: string; isDev: boolean }
          riot: {
            lockfileFound: boolean
            ownPuuid: string | null
            region: string | null
            playerName: string | null
            playerTag: string | null
            accessTokenPresent: boolean
            entitlementsTokenPresent: boolean
            clientVersion: string
            matchDataActive: boolean
            currentMatchId: string | null
            circuitBreakerOpen: boolean
            sessionStateFailures: number
            lastSessionLoopState: string
          }
          recording: { active: boolean; duration: number; lastError: string | null; lastPath: string | null; lastSizeMb: number }
          lastMatch: {
            timestamp: number
            matchId: string | null
            map: string | null
            agent: string | null
            gameMode: string
            recordingDuration: number
            fileSizeMb: number
            killsInTimeline: number
            clipsExtracted: number
            matchDetailsStatus: string
          } | null
          clips: { total: number }
          activityLog: Array<{ time: number; message: string }>
        }>
      }
      window: {
        minimize: () => Promise<void>
        close: () => Promise<void>
        openPostGame?: () => Promise<void>
      }
      recorder: {
        stop: () => Promise<{ ok: boolean; reason?: string }>
        getAudioStatus: () => Promise<{ winAudioMode: string | false | null; audioEnabled: boolean }>
        fixAudio: () => Promise<{ winAudioMode: string | false | null }>
      }
      updater: {
        check: () => Promise<{ status: string; message: string } | undefined>
        getState: () => Promise<{ phase: string; version?: string; percent?: number; error?: string }>
        install: () => Promise<void>
      }
      debug: {
        testRiotApi: () => Promise<{ portOpen: boolean; gameMode: string | null; processRunning: boolean }>
        findHotkeyConflict: () => Promise<{ supported: boolean; found: Array<{ exe: string; name: string; fix: string }> }>
      }
      screenshots: {
        capture: () => Promise<string | null>
        save: (dataUrl: string) => Promise<{ ok: boolean; path?: string }>
      }
      desktopCapture: {
        getSources: () => Promise<Array<{ id: string; name: string }>>
        setSource: (sourceId: string) => Promise<void>
        sendChunk: (chunk: ArrayBuffer) => void
        sendStarted: (noAudio: boolean) => void
        sendComplete: () => void
        sendError: (message: string) => void
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
        getHotkeyStatus: () => Promise<{ saveClipRegistered: boolean; toggleOverlayRegistered: boolean }>
        setHotkey: (action: string, accelerator: string) => Promise<{ ok: boolean }>
        upload: (id: string) => Promise<{ ok: boolean; apiClipId?: number; error?: string; needsUpgrade?: boolean; message?: string; upgradeUrl?: string }>
        requestAnalysis: (id: string) => Promise<{ ok: boolean; error?: string; needsUpgrade?: boolean; message?: string; upgradeUrl?: string }>
        share: (id: string) => Promise<{ ok: boolean; shareToken?: string; error?: string }>
        publish: (id: string, caption?: string) => Promise<{ ok: boolean; error?: string }>
        saveBookmark: () => Promise<{ ok: boolean; bookmarkCount?: number; reason?: string }>
        trim: (id: string, startSec: number, endSec: number) => Promise<{ ok: boolean; error?: string }>
      }
      squad: {
        getTeam: () => Promise<{
          team: { name: string; plan?: string; max_members?: number; members: { id: number; name: string; riot_name?: string; riot_tag?: string }[] } | null
          activity: { id: number; user_id: number; map?: string; agent?: string; result?: string; kills?: number | null; deaths?: number | null; assists?: number | null; created_at?: string }[]
          presence: Record<number, { online: boolean; is_recording: boolean; game?: string | null }>
          error?: string
        } | null>
        sendPresence: (recording: boolean, game: string | null) => Promise<{ ok: boolean }>
        syncPresence: () => Promise<{ ok: boolean }>
      }
      stats: {
        rrHistory: () => Promise<Array<{ id: number; date: string; rank: string | null; rr: number; elo: number }>>
      }
      overlay: {
        toggle: () => Promise<void>
        setInteractive: (interactive: boolean) => void
      }
      performance: {
        getStatus: () => Promise<{ boosted: boolean; powerPlan: string; platform: string }>
        boost: () => Promise<Array<{ name: string; success: boolean; message: string }>>
        restore: () => Promise<Array<{ name: string; success: boolean; message: string }>>
        diagnostics: () => Promise<{
          gpuName: string
          gpuUsagePct: number
          gpuTempC: number
          cpuUsagePct: number
          cpuSpeedMhz: number
          cpuMaxMhz: number
          ramUsedMb: number
          ramTotalMb: number
          ramSpeedMhz: number
          topProcesses: { name: string; cpuPct: number }[]
          xmpEnabled: boolean | null
          bottleneck: 'cpu' | 'gpu' | 'none' | 'unknown'
          warnings: string[]
        } | null>
        killProcess: (name: string) => Promise<{ name: string; success: boolean; message: string }>
        getPregameKillList: () => Promise<string[]>
        setPregameKillList: (list: string[]) => Promise<string[]>
      }
      obs: {
        connect: () => Promise<{ ok: boolean; error?: string; version?: string }>
        disconnect: () => Promise<void>
        getStatus: () => Promise<{
          connected: boolean
          recording: boolean
          replayBufferActive: boolean
          outputPath: string | null
          lastError: string | null
          obsVersion: string | null
        }>
        saveReplayClip: () => Promise<{ path: string | null }>
      }
      trainer: {
        launch: (config: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
        kill: () => Promise<{ ok: boolean }>
        getHistory: () => Promise<TrainingHistory | null>
        getCoachingDrills: () => Promise<CoachingDrill[]>
        getCorrelation: () => Promise<string[]>
        getBenchmark: () => Promise<TrainingBenchmark | null>
        getAiCoaching: () => Promise<{
          focus_area: string
          headline: string
          message: string
          tips: string[]
          encouragement: string
        } | null>
      }
      deadlock: {
        listReplays: () => Promise<{
          files: Array<{ name: string; path: string; sizeBytes: number; modifiedAt: number }>
          dir: string
          exists: boolean
        }>
        openReplaysFolder: () => Promise<{ ok: boolean }>
        openAnalyze: () => Promise<{ ok: boolean }>
        openDashboard: () => Promise<{ ok: boolean }>
        getStats: () => Promise<DeadlockProfileStats | null>
      }
      forgeRank: {
        prestige: () => Promise<{ success: boolean; forge_rank?: ForgeRankInfo; message?: string }>
      }
      discord: {
        setState: (state: 'idle' | 'reviewing') => Promise<void>
      }
      on: (channel: string, callback: (...args: unknown[]) => void) => (() => void)
    }
  }
}
