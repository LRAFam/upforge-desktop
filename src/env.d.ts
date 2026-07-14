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
    global_rank: number | null
    total_ranked: number
  }
}

export interface TrainerLeaderboardEntry {
  rank: number
  user_id: number
  name: string
  tag: string | null
  score: number
  accuracy_pct: number
  avg_reaction_ms: number
  is_current_user?: boolean
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
  trainer_scenario?: string | null
  trainer_difficulty?: string | null
  trainer_duration_seconds?: number | null
  baseline_score: number
  target_score: number
  status: string
  godot_config?: {
    scenario?: string
    difficulty?: string
    duration_seconds?: number
  } | null
}

export type PrimaryGame = 'valorant' | 'cs2' | 'deadlock' | 'lol'

export interface ClipCaptureSettings {
  /** Single-kill highlights (routine frags). */
  singleKills: boolean
  /** Multi-kills — 3K and 4K rounds. */
  multiKills: boolean
  /** Aces — 5K rounds. */
  aces: boolean
  /** Clutch rounds (1vX won). */
  clutches: boolean
}

export interface AppSettings {
  /** Active game context — drives dashboard, settings sections, and web links. */
  primaryGame: PrimaryGame
  /** Coaching (720p) or creator (1080p60) recording preset. */
  recordingPreset: 'coaching' | 'creator'
  recordingQuality: '720p' | '1080p'
  recordingBitrate: number
  recordingFps: 24 | 30 | 60
  audioEnabled: boolean
  savePath: string
  /** Resolved folder for the logged-in user (per-account default or custom savePath). */
  effectiveSavePath?: string
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
  /** Auto-delete routine kill clips after N days (0 = off). Favorites and highlight triggers kept. */
  clipKillRetentionDays: number
  /** Which auto-extracted highlight clip types to keep. Manual hotkey clips are always saved. */
  clipCapture: ClipCaptureSettings
  /** Auto-delete local-only match recordings after this many days (0 = disabled) */
  recordingRetentionDays: number
  /** When false, only replay-buffer highlight clips are saved (no full-match VOD). */
  fullMatchRecording: boolean
  /** Play a sound when a notification fires */
  notificationSound: boolean
  /** Show match status in Discord Rich Presence */
  discordRichPresence: boolean
  /** In-game hotkey feedback: notifications (default), overlay, or both */
  inGameFeedback: 'notifications' | 'overlay' | 'all'
  /** Auto-open the results page in the browser when analysis completes */
  autoOpenBrowser: boolean
  /** Opt-in: anonymised use of cloud-archived VODs for model training (separate from storage). */
  trainingConsent: boolean
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
  /** OBS WebSocket recording — required for match capture */
  obsEnabled: boolean
  /** OBS WebSocket host */
  obsHost: string
  /** OBS WebSocket port */
  obsPort: number
  /** OBS WebSocket password */
  obsPassword: string
  /** Replay buffer length in seconds */
  obsReplayBufferSeconds: number
  /** Keep active OBS scene when recording starts (for stream layouts with face cam) */
  obsPreserveActiveScene: boolean
  /** Override path for CS2 demo directory (undefined = auto-detect via Steam) */
  cs2DemoDir?: string
  cs2SteamName?: string
  /** Mouse & trainer sensitivity settings */
  trainerMouse: {
    dpi: number
    game: 'valorant' | 'cs2' | 'deadlock' | 'lol' | 'apex' | 'overwatch2' | 'custom'
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
  /** Rolling RPG-style skill scores (desktop, updated after each analysis) */
  skillProfile?: import('./lib/skill-profile').SkillProfileSnapshot | null
  skillProfilePrevious?: import('./lib/skill-profile').SkillProfileSnapshot | null
  lastInsight?: { text: string; score: number; agent: string | null; analysisId: number | null; date: string } | null
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
  analysisId?: number
  archiveId?: string
  cloudArchived?: boolean
  fileSizeBytes?: number
  pipelineStatus?: 'pending' | 'uploading' | 'analysing'
  uploadProgress?: number
  analysisProgress?: number
  analysisStep?: string | null
  lastAnalysisError?: string | null
  lastAnalysisErrorHint?: string | null
  lastAnalysisCreditRefunded?: boolean
  lastAnalysisFailureDiagnostics?: Record<string, unknown> | null
  lastAnalysisCreditRefunded?: boolean
  pipelineDeferReason?: 'recording' | null
  pipelineArchiveOnly?: boolean
  clipsOnly?: boolean
  clipOnlyReason?: 'clips_only_mode' | 'no_recording'
  clipCount?: number
  matchId?: string | null
  /** Present on recordings:get — file still on disk. */
  hasLocalFile?: boolean
  /** Present on recordings:get — full VOD uploaded to S3. */
  cloudUploaded?: boolean
  analysisReadiness?: {
    ready: boolean
    state: 'ready' | 'syncing' | 'no_deaths' | 'unavailable' | 'file_missing' | 'finalizing' | 'mode_unsupported' | 'file_unreadable'
    message: string
    duelMomentCount: number
  }
  timeline?: {
    playerName?: string | null
    playerKills?: Array<{ killerName: string; victimName: string; weapon?: string; videoOffsetMs?: number; round?: number }>
    playerDeaths?: Array<{ killerName: string; victimName: string; weapon?: string; videoOffsetMs?: number; round?: number }>
    roundSummaries?: Array<{ roundNumber: number; winningTeam?: string | null }>
    finalStats?: {
      kills: number
      deaths: number
      assists: number
      score: number
      headshotPct: number | null
      won?: boolean
    } | null
    finalScore?: { allyScore: number; enemyScore: number } | null
    roundScores?: Array<{ allyScore: number; enemyScore: number }>
  } | null
}

export interface RecordingTimeline {
  id: string
  jobId?: string | null
  analysisId?: number | null
  archiveId?: string | null
  videoPath: string | null
  /** True when the local file (and remux sibling) is gone from disk. */
  localFileMissing?: boolean
  /** True when a playable local file exists on disk. */
  hasLocalFile?: boolean
  /** True when the VOD was uploaded for analysis or saved to cloud. */
  uploadedToCloud?: boolean
  cloudUploaded?: boolean
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
  spatialSummary?: import('./lib/spatial-types').MatchSpatialSummary | null
  duelMoments?: import('./lib/duel-moments').DuelMomentManifest[]
  videoSyncOffsetMs?: number
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
    stripe_subscription_status?: string | null
    riot_name: string | null
    riot_tag: string | null
    riot_region: string | null
    lol_riot_name?: string | null
    lol_riot_tag?: string | null
    lol_platform?: string | null
    discord_username: string | null
    analysis_stats: {
      total: number
      limit: number | null
      subscription_ends_at?: string | null
    }
    archive_stats?: {
      count: number
      limit: number | null
      remaining: number | null
      retention_days: number | null
      storage_bytes_used: number
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
  matchId: string | null
  /** valorant | cs2 | deadlock — omitted on legacy clips (treated as valorant) */
  game?: 'valorant' | 'cs2' | 'deadlock' | null
  gameMode: string | null
  uploadStatus: 'local' | 'uploading' | 'uploaded' | 'failed'
  apiClipId: number | null
  shareToken: string | null
  analysisStatus: 'none' | 'queued' | 'processing' | 'completed' | 'failed'
  verdict: string | null
  suggestion: string | null
  coachingTags: string[]
  overallScore: number | null
  published: boolean
  /** Whether the user has starred/favourited this clip */
  favorited: boolean
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
  /** CS2 only — demo upload, FACEIT cloud, or desktop VOD coaching. */
  cs2_source?: 'demo_upload' | 'faceit_api' | 'desktop_vod'
}

export interface Cs2AnalysisItem {
  id: number
  job_id: string | null
  status: string
  player_name: string | null
  map: string | null
  rounds_played: number | null
  score: string | null
  kd_ratio: number | null
  overall_rating: number | null
  created_at: string
  completed_at: string | null
  source?: 'demo_upload' | 'faceit_api' | 'desktop_vod'
  unified_id?: string
}

export interface DeadlockAnalysisItem {
  id: number
  job_id: string
  status: string
  hero: string | null
  player_name: string | null
  match_result: string | null
  duration_minutes: number | null
  overall_rating: number | null
  kd_ratio: number | null
  kills: number | null
  deaths: number | null
  assists: number | null
  created_at: string
  completed_at: string | null
}

export interface LolMatchSummary {
  match_id: string
  queue_id: number
  champion: string
  role: string
  lane: string
  win: boolean
  kills: number
  deaths: number
  assists: number
  game_duration_seconds: number
  game_creation: number
}

export interface LolAnalysisItem {
  id: number
  job_id: string | null
  match_id: string
  status: string
  readiness_state: string | null
  champion: string | null
  role: string | null
  lane: string | null
  queue_id: number | null
  source: string | null
  created_at: string | null
  completed_at: string | null
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
    start_time?: number
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
  meta_insights?: Array<{
    hero_id: number
    hero_name: string
    hero_icon: string | null
    player_win_rate: number
    meta_win_rate: number | null
    delta_vs_meta: number | null
    matches_played: number
    signal: 'outperforming' | 'underperforming' | 'on_par' | null
  }>
  top_meta_heroes?: Array<{
    hero_id: number
    hero_name: string
    hero_icon: string | null
    win_rate: number
    matches: number
  }>
}

declare global {
  interface Window {
    api: {
      auth: {
        login: (email: string, password: string) => Promise<{ ok: boolean; user?: unknown; error?: string }>
        logout: () => Promise<void>
        getUser: () => Promise<unknown>
        refreshUser: () => Promise<unknown>
        updateRiotAccount: (payload: { riot_name: string; riot_tag: string; riot_region?: string }) => Promise<{ ok: boolean; error?: string }>
        linkLolAccount: (payload: { riot_name: string; riot_tag: string; lol_platform: string }) => Promise<{ ok: boolean; error?: string }>
        unlinkLolAccount: () => Promise<{ ok: boolean; error?: string }>
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
          obsConnected: boolean
          recordedModes: string[]
          recordingBackend: 'obs'
          currentQueueMode: string | null
          user: {
            name: string
            email: string
            tier: string
            is_admin: boolean
            riot_name: string | null
            riot_tag: string | null
          } | null
        }>
        getActivityLog: () => Promise<{ time: number; message: string; game?: string }[]>
        showClips: () => Promise<{ ok: boolean }>
        openUrl: (url: string) => Promise<{ ok: boolean }>
        refreshDashboard: () => Promise<{ ok: boolean }>
        openVodReview: (id: string, seekMs?: number) => Promise<{ ok: boolean }>
      }
      profile: {
        get: () => Promise<ProfileData | null>
      }
      billing: {
        openPortal: () => Promise<{ ok: boolean; error?: string }>
      }
      analyses: {
        get: (limit?: number) => Promise<AnalysisItem[]>
        remove: (analysisId: number, jobId?: string | null) => Promise<{ ok: boolean; removed: boolean; deletedLocal: boolean }>
        getTimeline: (id: number) => Promise<RecordingTimeline | null>
        refreshPlayback: (id: number) => Promise<string | null>
        getDetail: (id: number) => Promise<import('./lib/analysis-enrichment').AnalysisDetailEnriched | null>
        getPercentiles: (id: number) => Promise<{
          success: boolean
          percentiles: Record<string, { score: number; percentile: number; peers: number; label: string }>
          note?: string | null
          tier?: string | null
        }>
        reconcileStuck: () => Promise<{ ok: boolean; reconciled: number }>
        submitFeedback: (opts: {
          analysisId: number
          rating: 'thumbs_up' | 'thumbs_down'
          feedbackText?: string
        }) => Promise<{ ok: boolean; error?: string }>
      }
      archives: {
        refreshPlayback: (archiveId: string) => Promise<string | null>
      }
      recordings: {
        get: () => Promise<PendingRecording[]>
        analyse: (id: string) => Promise<{ ok?: boolean; error?: string }>
        saveToCloud: (id: string) => Promise<{ ok: boolean; archiveId?: string; alreadySaved?: boolean; error?: string }>
        dismiss: (id: string, opts?: { deleteLocal?: boolean }) => Promise<{ ok: boolean; deletedLocal?: boolean }>
        abortInFlight: (id: string) => Promise<{ ok: boolean; error?: string }>
        getTimeline: (id: string) => Promise<RecordingTimeline | null>
        refreshPlayback: (id: string) => Promise<string | null>
        refreshDemoTimeline: (id: string) => Promise<{
          ok: boolean
          analysisReadiness: PendingRecording['analysisReadiness'] | null
        }>
        listDemoCandidates: (id: string) => Promise<{
          candidates: Array<{
            name: string
            path: string
            sizeBytes: number
            modifiedAt: number
            score: number
            recommended: boolean
            fit: 'best' | 'possible' | 'unlikely'
            timingLabel: string
            timingDetail: string
          }>
          recording: {
            id: string
            game: string
            map: string | null
            recordedAt: number
            matchStartTime: number | null
          } | null
          recordingHint: {
            map: string | null
            kills: number | null
            deaths: number | null
            allyScore: number | null
            enemyScore: number | null
          } | null
          error?: string
        }>
        previewDemo: (recordingId: string, demoPath: string) => Promise<{
          preview: {
            ok: boolean
            error?: string
            identityWarning?: string
            configuredPlayerName?: string | null
            partialParse?: boolean
            likelyIncomplete?: boolean
            totalKillEvents: number
            matchKillSample: boolean
            map: string | null
            playerName: string | null
            kills: number | null
            deaths: number | null
            assists: number
            rounds: number
            allyScore: number
            enemyScore: number
            won: boolean | null
            killHighlights: Array<{ round: number; label: string }>
          } | null
          assessment: {
            confidence: 'strong' | 'possible' | 'weak' | 'mismatch'
            headline: string
            details: string[]
          } | null
          recordingHint: {
            map: string | null
            kills: number | null
            deaths: number | null
            allyScore: number | null
            enemyScore: number | null
          } | null
          error?: string
        }>
        attachDemo: (id: string, demoPath?: string) => Promise<{
          ok: boolean
          error?: string
          analysisReadiness: PendingRecording['analysisReadiness'] | null
        }>
        nudgeSync: (id: string, deltaMs: number) => Promise<{ ok: boolean; videoSyncOffsetMs?: number }>
        resetSync: (id: string) => Promise<{ ok: boolean; videoSyncOffsetMs?: number }>
        trim: (id: string, startSec: number, endSec: number) => Promise<{
          ok: boolean
          error?: string
          newDurationSec?: number
          cloudStale?: boolean
        }>
        previewDuelWindow: (
          id: string,
          opts: { windowStartMs: number; windowEndMs: number; momentId: string },
        ) => Promise<{ ok: true; path: string; bytes: number } | { ok: false; error: string }>
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
          analysisPipeline: {
            summary: string
            mode: 'idle' | 'analyse' | 'archive'
            activePollJobId: string | null
            primaryJobId: string | null
            pendingJob: {
              job_id: string
              savedAt: number
              agent?: string
              map?: string
              game?: string
              ageMs: number
            } | null
            serverStatus: {
              status: string
              progress: number
              current_step: string | null
              error: string | null
              analysis_id: number | null
            } | null
            recording: {
              id: string
              map: string | null
              agent: string | null
              game: string
              pipelineStatus: string | null
              uploadProgress: number | null
              analysisProgress: number | null
              analysisStep: string | null
              jobId: string | null
              analysisId: number | null
              cloudArchived: boolean
              archiveId: string | null
              localFileExists: boolean
            } | null
            inFlightCount: number
            steps: Array<{
              id: string
              label: string
              description: string
              state: 'pending' | 'active' | 'done' | 'error' | 'skipped'
              detail: string | null
            }>
            recentEvents: Array<{ time: number; message: string }>
          }
          activityLog: Array<{ time: number; message: string }>
        }>
      }
      window: {
        minimize: () => Promise<void>
        close: () => Promise<void>
        openPostGame?: () => Promise<void>
        setContentHeight?: (height: number) => Promise<void>
        applyLayout?: (routePath: string) => Promise<{ ok: boolean }>
      }
      postGame: {
        sync: () => Promise<{
          phase: 'preparing' | 'uploading' | 'analysing' | 'ready' | 'error' | 'pending' | 'archived'
          game?: string
          map?: string | null
          agent?: string | null
          uploadProgress: number
          compressing: boolean
          compressKind: 'remux' | 'transcode' | 'shrink' | null
          preparingSyncMessage: string | null
          recordingId: string | null
          archiveOnly: boolean
          analysisReadiness: { ready: boolean; state: string; message: string } | null
          pendingAnalysisReady: boolean
          pendingAnalysisMessage: string | null
          pendingAnalysisState: string | null
          matchDataStatus: string | null
          killsInTimeline: number
          debriefLoading: boolean
          debriefText: string | null
          debriefFailed: boolean
          debriefDiscordLinked: boolean
          updatedAt: number
        } | null>
        retryDemoScan: () => Promise<{ ok: boolean; error?: string }>
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
        getUsage: () => Promise<{
          bytes: number
          count: number
          freeDiskBytes: number
          recordingsBytes: number
          recordingsCount: number
          clipsBytes: number
          clipsCount: number
          legacyRecordingsBytes: number
          orphanBytes: number
          orphanCount: number
        }>
        getBreakdown: () => Promise<{
          pendingCount: number
          pendingBytes: number
          cloudBackedCount: number
          cloudBackedBytes: number
          orphanCount: number
          orphanBytes: number
          legacyDuplicateBytes: number
        }>
        purgeCloudBacked: () => Promise<{ freedBytes: number; removed: number; skipped: number }>
        purgeOrphans: () => Promise<{ removed: number; freedBytes: number }>
        uploadPending: () => Promise<
          | { ok: false; error: string }
          | { ok: true; uploaded: number; failed: number; stoppedEarly: boolean; stopReason?: string }
        >
        openFolder: () => Promise<void>
        getEstimate: () => Promise<{
          estimatedGbPerMatch: number
          estimatedGbPerWeek: number
          assumedMatchesPerWeek: number
          recent: {
            bytesInPeriod: number
            filesInPeriod: number
            bytesPerDay: number
            lookbackDays: number
          }
        }>
      }
      clips: {
        get: (opts?: { game?: string; allGames?: boolean }) => Promise<ClipRecord[]>
        getThumbnail: (id: string) => Promise<string | null>
        delete: (id: string) => Promise<{ ok: boolean }>
        deleteMany: (ids: string[]) => Promise<{ ok: boolean; count?: number; error?: string }>
        bulkFavorite: (ids: string[], favorited: boolean) => Promise<{ ok: boolean; count?: number }>
        updateTitle: (id: string, title: string) => Promise<{ ok: boolean }>
        openFolder: (id: string) => Promise<void>
        revealFile: (id: string) => Promise<void>
        toggleFavorite: (id: string) => Promise<{ ok: boolean; favorited?: boolean }>
        getHotkeys: () => Promise<Record<string, string>>
        getHotkeyStatus: () => Promise<{ saveClipRegistered: boolean; toggleOverlayRegistered: boolean }>
        setHotkey: (action: string, accelerator: string) => Promise<{ ok: boolean }>
        upload: (id: string) => Promise<{ ok: boolean; apiClipId?: number; error?: string; needsUpgrade?: boolean; message?: string; upgradeUrl?: string; uploadResolution?: 'hd' | '720p' }>
        requestAnalysis: (id: string) => Promise<{ ok: boolean; error?: string; needsUpgrade?: boolean; message?: string; upgradeUrl?: string }>
        share: (id: string) => Promise<{ ok: boolean; shareToken?: string; error?: string }>
        publish: (id: string, caption?: string) => Promise<{ ok: boolean; error?: string }>
        saveBookmark: () => Promise<{ ok: boolean; bookmarkCount?: number; reason?: string }>
        trim: (id: string, startSec: number, endSec: number) => Promise<{ ok: boolean; error?: string }>
      }
      recap: {
        exportStitched: (opts: {
          recordingId: string
          highlights: Array<{ id: string; clipId?: string | null; videoOffsetMs?: number | null; rank?: number }>
          maxMoments?: number
        }) => Promise<{ ok: boolean; path?: string; error?: string }>
      }
      squad: {
        getTeam: () => Promise<{
          team: { name: string; plan?: string; max_members?: number; credits_remaining?: number; credits_total?: number; invite_code?: string; members: { id: number; name: string; riot_name?: string; riot_tag?: string; role?: string }[] } | null
          activity: { id: number; user_id: number; user_name?: string; map?: string; agent?: string; result?: string; kills?: number | null; deaths?: number | null; assists?: number | null; share_token?: string; created_at?: string }[]
          presence: Record<number, { online: boolean; is_recording: boolean; game?: string | null }>
          stats?: { user_id: number; name: string; current_rank?: string | null; rr?: number | null; kd_ratio?: number | null; win_rate?: number | null; headshot_percentage?: number | null; most_played_agent?: string | null; has_stats?: boolean }[]
          leaderboard?: { user_id: number; name: string; analyses_count?: number; role?: string }[]
          error?: string
        } | null>
        sendPresence: (recording: boolean, game: string | null) => Promise<{ ok: boolean }>
        syncPresence: () => Promise<{ ok: boolean }>
      }
      coach: {
        getMyCoaches: () => Promise<Array<{
          coach_id: number
          display_name: string
          avatar_url: string | null
          current_rank: string | null
          specialties: string[]
          roster_is_live?: boolean
          can_request_review?: boolean
          review_limits?: {
            active_reviews: number
            active_reviews_limit: number
            reviews_this_month: number
            reviews_month_limit: number
          }
        }>>
        requestRosterReview: (opts: {
          analysisId: number
          coachId: number
          question?: string
          roundNumbers?: number[]
        }) => Promise<{ ok: boolean; review?: unknown; error?: string }>
        getAnalysisReview: (analysisId: number) => Promise<{
          id: number
          status: string
          source: string
          student_question: string | null
          round_numbers: number[] | null
          coach_perspective?: string | null
          coach?: { id: number; display_name: string }
          annotations?: Array<{
            id: number
            round_number: number | null
            video_offset_ms: number | null
            body: string
          }>
        } | null>
        getReviewAnnotations: (reviewId: number) => Promise<{
          status: string
          student_question: string | null
          round_numbers: number[] | null
          coach_perspective: string | null
          annotations: Array<{
            id: number
            round_number: number | null
            video_offset_ms: number | null
            body: string
            created_at: string
          }>
        } | null>
      }
      stats: {
        rrHistory: () => Promise<Array<{ id: number; date: string; rank: string | null; rr: number; elo: number }>>
      }
      progress: {
        playstyleProfile: () => Promise<{
          matches_tracked: number
          vods_analyzed?: number
          profile_milestone?: {
            level: number
            label: string
            vods: number
            next_level_vods: number | null
          }
          last_match_at: string | null
          metrics: Record<string, unknown> & {
            combat?: {
              untraded_death_rate_pct?: number
              death_hotspots?: Array<{ callout: string; count: number }>
              duel_win_rate_pct?: number
            }
          }
          focus_areas: Array<{
            id: string
            category: string
            text: string
            severity: 'low' | 'medium' | 'high'
            agent?: string
          }>
          brain_habits?: Array<{
            id: string
            category: string
            text: string
            severity: 'low' | 'medium' | 'high'
          }>
          agent_pool: Record<string, number>
        } | null>
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
        connect: () => Promise<{
          ok: boolean
          error?: string
          version?: string
          processRunning?: boolean
          setup?: { ok: boolean; sceneCreated: boolean; inputCreated: boolean; error?: string }
        }>
        launchAndConnect: () => Promise<
          | { ok: true; alreadyConnected?: boolean; alreadyRunning?: boolean; launched?: boolean; processRunning?: boolean }
          | { ok: false; error?: string; launched?: boolean; processRunning?: boolean; needsManualRestart?: boolean }
        >
        disconnect: () => Promise<void>
        getProcessState: () => Promise<{
          installed: boolean
          processRunning: boolean
          connected: boolean
        }>
        getStatus: () => Promise<{
          connected: boolean
          recording: boolean
          replayBufferActive: boolean
          outputPath: string | null
          lastError: string | null
          obsVersion: string | null
        }>
        setupScene: () => Promise<{ ok: boolean; sceneCreated: boolean; inputCreated: boolean; error?: string }>
        installProfile: () => Promise<{ ok: boolean; installed: boolean; error?: string; profilePath?: string; websocketConfigured?: boolean }>
        installStudio: () => Promise<{ ok: boolean; installed?: boolean; alreadyInstalled?: boolean; error?: string }>
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
        getLeaderboard: (scenario: string, period?: 'week' | 'month' | 'all') => Promise<TrainerLeaderboardEntry[]>
      }
      deadlock: {
        listReplays: () => Promise<{
          files: Array<{ name: string; path: string; sizeBytes: number; modifiedAt: number }>
          dir: string
          exists: boolean
        }>
        openReplaysFolder: () => Promise<{ ok: boolean }>
        openAnalyze: () => Promise<{ ok: boolean }>
        openResults: (jobId: string) => Promise<{ ok: boolean }>
        openDashboard: () => Promise<{ ok: boolean }>
        openConnectSteam: () => Promise<{ ok: boolean }>
        searchPlayers: (query: string) => Promise<Array<{ account_id: number; personaname: string }>>
        lookupPlayer: (accountId: number) => Promise<{ account_id: number; personaname: string } | null>
        connectAccount: (accountId: number) => Promise<{ ok: boolean; error?: string }>
        getStats: (opts?: { fresh?: boolean }) => Promise<{
          stats: DeadlockProfileStats | null
          linked: boolean
          error: 'not_authenticated' | 'fetch_failed' | null
        }>
        getAnalyses: (limit?: number) => Promise<DeadlockAnalysisItem[]>
        uploadDemo: (demoPath: string) => Promise<{ ok: true; jobId: string } | { ok: false; error: string }>
        getDetectionStatus: () => Promise<{
          phase: string
          mapName: string | null
          heroKey: string | null
          logPath: string | null
          logReceiving: boolean
          logGrowing: boolean
          lastLogLine: string
          replayLive: boolean
          condebugLikely: boolean
          replayDir: string | null
          readyToRecord: boolean
          matchLive: boolean
          liveKills: number
          liveDeaths: number
          lobbyMatchId: number | null
          logCandidates: Array<{ path: string; size: number; exists: boolean }>
          steamCacheDir?: string | null
          activeMatchId?: number | null
          hasReplaySalt?: boolean
          knownMatchCount?: number
        }>
        ensureCondebug: () => Promise<{
          ok: boolean
          alreadyConfigured: boolean
          needsGameRestart: boolean
          error?: string
        }>
      }
      cs2: {
        detectDemoDir: () => Promise<{ dir: string | null; root: string | null }>
        listDemos: () => Promise<{
          files: Array<{ name: string; path: string; sizeBytes: number; modifiedAt: number }>
          dir: string | null
          exists: boolean
        }>
        openDemosFolder: () => Promise<{ ok: boolean }>
        openAnalyze: () => Promise<{ ok: boolean }>
        openDashboard: () => Promise<{ ok: boolean }>
        openConnectFaceit: () => Promise<{ ok: boolean }>
        connectFaceit: (nickname: string) => Promise<{ ok: boolean; error?: string }>
        getAnalyses: (limit?: number) => Promise<Cs2AnalysisItem[]>
        getProfile: () => Promise<{
          identity: { steam_display_name: string | null; steam_id: string | null; linked: boolean }
          valve_stats: {
            matches_tracked: number
            avg_kd: number | null
            premier_rating: number | null
            map_breakdown: Array<{ map: string; matches: number }>
            source: string
          }
          faceit: {
            connected: boolean
            nickname?: string
            elo?: number | null
            level?: number | null
            synced_at?: string | null
          }
        } | null>
        syncIdentity: (steamDisplayName: string) => Promise<{ ok: boolean }>
        getFaceitConnection: () => Promise<{
          connected: boolean
          nickname?: string
          elo?: number | null
          level?: number | null
          synced_at?: string | null
          has_auto_sync?: boolean
        }>
      }
      lol: {
        getAnalyses: (limit?: number) => Promise<LolAnalysisItem[]>
        getRecentMatches: (force?: boolean) => Promise<LolMatchSummary[]>
        openAnalyze: () => Promise<{ ok: boolean }>
        openHistory: () => Promise<{ ok: boolean }>
        openResults: (analysisId: number | string) => Promise<{ ok: boolean }>
        openConnectRiot: () => Promise<{ ok: boolean }>
      }
      forgeRank: {
        prestige: () => Promise<{ success: boolean; forge_rank?: ForgeRankInfo; message?: string }>
      }
      discord: {
        setState: (state: 'idle' | 'reviewing') => Promise<void>
        getStatus: () => Promise<{
          connected: boolean
          enabled: boolean
          buttonsRegistered: boolean
          buttonLabels: string[]
          details: string | null
          state: string | null
        }>
      }
      on: (channel: string, callback: (...args: unknown[]) => void) => (() => void)
    }
  }
}
