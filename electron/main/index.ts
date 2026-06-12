import {
  app,
  BrowserWindow,
  Tray,
  ipcMain,
  shell,
  globalShortcut,
} from 'electron'
import { join } from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { showAppNotification } from './app-notifications'
import { setupAutoUpdater, markStartupComplete } from './updater'
import { GameDetector } from './game-detector'
import { Recorder } from './recorder'
import { OBSRecorder } from './obs-recorder'
import { buildRecorderConfig } from './obs-output-settings'
import { hasProAccess } from './subscription'
import {
  MIN_RECORDING_DURATION_SECONDS,
  MIN_RECORDING_FILE_BYTES,
  MAX_RECORDING_FILE_BYTES,
  formatRecordingTooLargeMessage,
} from './recording-limits'
import { formatRecordingLabel } from './recording-preset'
import {
  resolveUploadVideoPath,
  deleteCompressedSibling,
} from './vod-compressor'
import {
  resolveReadyRecordingPath,
  listUnregisteredRecordingFiles,
} from './recording-path-resolver'
import { broadcastObsConnection, probeObsConnection, startObsHealthMonitor } from './obs-health'
import {
  RiotLocalApi,
  recomputeTimelineVideoOffsets,
  nudgeTimelineSyncOffset,
  DEFAULT_VIDEO_SYNC_OFFSET_MS,
} from './riot-local-api'
import { applySpatialEnrichment } from './spatial/enrich'
import { UploadManager, savePendingJob, clearPendingJob } from './upload-manager'
import {
  activateUserSession,
  clearUserSession,
  readActivePendingJob,
  clearActivePendingJob,
  getActiveUserId,
} from './user-session'
import { resolveRecordingSavePath } from './user-data-paths'
import { startAnalysisPoll, stopActiveAnalysisPoll, reconcileOrphanedJob } from './analysis-poll'
import { AuthManager } from './auth-manager'
import { SettingsManager } from './settings-manager'
import { setupIpcHandlers, setupClipHandlers, cancelAllPollingTimers } from './ipc-handlers'
import {
  formatRecordingFailure,
  formatCorruptRecordingMessage,
  type RecordingBackend,
} from './capture-backend'
import { reportRecordingError } from './recording-errors'
import { UpgradeRequiredError } from './errors'
import { RecordingsStore } from './recordings-store'
import { ClipExtractor } from './clip-extractor'
import { ClipStore } from './clip-store'
import { HotkeyManager } from './hotkey-manager'
import { createOverlayWindow, toggleOverlay, destroyOverlay, sendOverlayData, isOverlayVisible, showOverlay, hideOverlay } from './overlay-window'
import { deliverInGameFeedback, usesOverlayFeedback } from './in-game-feedback'
import { captureAndSaveScreenshot } from './screenshot-capture'
import { PerformanceManager } from './performance-manager'
import { TrainerBridge } from './trainer-bridge'
import type { MatchData } from './riot-types'
import log from 'electron-log'
import { setupMainProcessErrorHandlers, reportError } from './error-reporter'
import { findLatestCS2Demo } from './cs2-demo-finder'
import { fetchRecordingPlaybackUrl } from './recording-playback'
import { getStorageBreakdown, purgeCloudBackedLocals } from './storage-cleanup'
import { CS2DemoUploader } from './cs2-demo-uploader'
import { DiscordRPC } from './discord-rpc'
import {
  createMainWindow as _createMainWindow,
  createPostGameWindow as _createPostGameWindow,
  createSplashWindow as _createSplashWindow,
  createTray as _createTray,
  whenWebContentsReady,
} from './window-manager'
import { ClipPipeline } from './clip-pipeline'
import { requestPregameBrief as _requestPregameBrief, requestPostGameDebrief as _requestPostGameDebrief } from './post-game-api'

/** Human-readable label for a game identifier. */
function gameLabel(game?: string | null): string {
  if (game === 'cs2') return 'CS2'
  if (game === 'deadlock') return 'Deadlock'
  return 'Valorant'
}

/** Idle tray tooltip for a given game (or generic if unknown). */
function idleTooltip(game?: string | null): string {
  return `UpForge — ${gameLabel(game)} AI Coaching`
}

// Disable GPU acceleration in dev to prevent GPU process crashes on macOS
if (!app.isPackaged) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-features', 'OutOfProcessSystemDnsResolution')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
}

// Catch any floating promise rejections in the main process before they
// crash Electron silently. Log them so they show up in support logs.
// Full error reporting is set up after AuthManager is ready (see below).

// Enforce single instance — if another UpForge process is already running,
// focus its window and quit this one immediately.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  log.warn('[App] Another instance is already running — quitting duplicate.')
  app.quit()
  process.exit(0)
}

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let postGameWindow: BrowserWindow | null = null
let isQuitting = false
let trayRefreshInterval: ReturnType<typeof setInterval> | null = null
let updateTrayMenuFn: (() => void) | null = null
let ffmpegOk = true // clip extraction preflight only

const gameDetector = new GameDetector()
/** Bundled ffmpeg — post-match clip extraction only (not used for live recording). */
const clipFfmpegProbe = new Recorder()
const obsRecorder = new OBSRecorder(
  () => {
    const s = settingsManager?.get()
    return {
      host: s?.obsHost ?? 'localhost',
      port: s?.obsPort ?? 4455,
      password: s?.obsPassword ?? '',
      replayBufferSeconds: s?.obsReplayBufferSeconds ?? 30,
    }
  },
  () => {
    const s = settingsManager?.get()
    return s ? buildRecorderConfig(s, hasProAccess(authManager.getUser()), getActiveUserId()) : undefined
  },
)

let stopObsHealthMonitor: (() => void) | null = null
let obsWasConnected = false
let lastObsDisconnectNotifyAt = 0
const OBS_DISCONNECT_NOTIFY_COOLDOWN_MS = 10 * 60 * 1000

function maybeNotifyObsDisconnect(error: string | null | undefined): void {
  if (!error) return
  const now = Date.now()
  if (now - lastObsDisconnectNotifyAt < OBS_DISCONNECT_NOTIFY_COOLDOWN_MS) return
  lastObsDisconnectNotifyAt = now
  showAppNotification({
    title: 'UpForge — OBS Disconnected',
    body: error === 'OBS disconnected'
      ? 'OBS closed or disconnected. Reopen OBS and connect in Settings → Recording.'
      : error,
    silent: notifySilent(),
  })
}

function wireObsConnectionEvents(): void {
  obsRecorder.onConnectionChange = (connected, error) => {
    const lostConnection = obsWasConnected && !connected
    obsWasConnected = connected
    broadcastObsConnection(mainWindow, obsRecorder, error)
    updateTrayMenuFn?.()
    // Only notify when an established OBS session is lost — not on failed connect probes.
    if (lostConnection) {
      maybeNotifyObsDisconnect(error)
    }
  }
}

function scheduleObsProbeOnWindowLoad(win: BrowserWindow, notify: boolean): void {
  win.webContents.once('did-finish-load', () => {
    void probeObsConnection(obsRecorder, win, {
      notify,
      notifySilent,
      logActivity,
    })
  })
}

const OBS_SETUP_HINT =
  'OBS is not connected. Enable WebSocket in OBS (Tools → WebSocket Server Settings), copy the password from Show Connect Info, then Connect in UpForge Settings → Recording.'

async function ensureObsReady(): Promise<void> {
  if (obsRecorder.isConnected()) return
  const result = await obsRecorder.connect()
  if (!result.ok) {
    throw new Error(`${OBS_SETUP_HINT}${result.error ? ` (${result.error})` : ''}`)
  }
}

/** Set by setupGameDetection — handles unexpected mid-match capture loss. */
let onRecordingLost: ((error: string) => void) | null = null

function discordMatchContext(): { map: string | null; agent: string | null } {
  const game = gameDetector.currentGame()
  if (game === 'valorant') return riotLocalApi.getLiveMatchContext()
  return { map: null, agent: null }
}

function wireRecorderStatus(rec: OBSRecorder, label: string): void {
  rec.onStatusChange = (recording, error) => {
    mainWindow?.webContents.send('recording:status-changed', { recording, error: error ?? null })
    updateTrayMenuFn?.()
    const game = gameDetector.currentGame() || 'valorant'
    if (recording) {
      const start =
        currentRecordingStartTime != null ? new Date(currentRecordingStartTime) : new Date()
      discordRPC.setRecording(game, start, discordMatchContext())
    } else if (gameDetector.currentGame()) {
      discordRPC.setInGame(game, discordMatchContext())
    } else {
      discordRPC.setIdle()
    }
    if (!recording && error) {
      log.warn(`[Main] ${label} recording stopped with error:`, error)
      reportRecordingError('mid-match', error, { label })
      onRecordingLost?.(error)
      tray?.setToolTip('UpForge — Recording stopped!')
      showAppNotification({
        title: 'UpForge — Recording Stopped',
        body: 'Recording stopped unexpectedly. Open UpForge to see details.',
        silent: notifySilent(),
      })
      setTimeout(() => tray?.setToolTip(idleTooltip()), 10_000)
    }
  }
}
const clipExtractor = new ClipExtractor()
const clipStore = new ClipStore()
const hotkeyManager = new HotkeyManager()
const trainerBridge = new TrainerBridge(() => mainWindow)
let settingsManager: SettingsManager
const discordRPC = new DiscordRPC(
  () => settingsManager?.get().discordRichPresence !== false,
)
const riotLocalApi = new RiotLocalApi()
const authManager = new AuthManager()

// Set up crash/error reporting now that authManager is available
setupMainProcessErrorHandlers(authManager)
trainerBridge.setAuthManager(authManager)

wireRecorderStatus(obsRecorder, 'OBS')

// When OBS saves a replay buffer clip during a live match, add it to the clip store immediately
obsRecorder.onReplayClipSaved = (clipPath, _trigger) => {
  log.info('[Main] OBS replay clip saved during match:', clipPath)
  const rec = clipStore.add({
    path: clipPath,
    thumbPath: null,
    trigger: 'kill',
    map: null,
    agent: null,
    durationSeconds: settingsManager?.get().obsReplayBufferSeconds ?? 30,
    round: null,
    killCount: 1,
    analysisJobId: null,
  })
  logActivity('OBS kill clip saved')
  mainWindow?.webContents.send('clips:new', [rec.id])
  mainWindow?.webContents.send('obs:replay-saved', { clipId: rec.id, path: clipPath })
}

const performanceManager = new PerformanceManager()
let uploadManager: UploadManager
let recordingsStore: RecordingsStore

// Set by setupGameDetection — cancel pending match-wait when game quits from lobby
let cancelMatchWait: (() => void) | null = null
let waitingForMatch = false
// Prevents double-handling when onMatchEnded + game-stopped both fire for same match
let matchHandled = false
/** Bumped on each game-started so superseded lobby-wait loops exit cleanly. */
let matchFlowGeneration = 0
/** Serializes handleMatchEnd — prevents double upload/post-game from concurrent end signals. */
let matchFinalizeInFlight: Promise<boolean> | null = null
// Overlay polling timer — cleared when match ends or game stops
let overlayPollTimer: ReturnType<typeof setInterval> | null = null

// Activity log — recent events shown on dashboard for user visibility
const MAX_LOG_ENTRIES = 30
const activityLog: { time: number; message: string }[] = []

// Hotkey bookmarks — timestamps (ms) relative to recording start pressed during a match
const hotkeyBookmarks: number[] = []
// Recording start time — set when recorder.start() succeeds
let currentRecordingStartTime: number | null = null
// Auto-hide timer for overlay flash feedback (clip bookmarked while overlay is hidden)
let overlayAutoHideTimer: ReturnType<typeof setTimeout> | null = null

function flashOverlayBriefly(durationMs = 3000): void {
  if (!settingsManager || !usesOverlayFeedback(settingsManager.get().inGameFeedback ?? 'notifications')) return
  if (isOverlayVisible()) return
  if (overlayAutoHideTimer) clearTimeout(overlayAutoHideTimer)
  showOverlay()
  overlayAutoHideTimer = setTimeout(() => {
    hideOverlay()
    overlayAutoHideTimer = null
  }, durationMs)
}

const inGameFeedbackDeps = () => ({
  getSettings: () => settingsManager.get(),
  sendOverlayEvent: (channel: string, data?: unknown) => sendOverlayData(channel, data),
  flashOverlay: (durationMs: number) => flashOverlayBriefly(durationMs),
})

// Last match diagnostic — captured at handleMatchEnd for the developer panel
interface LastMatchDiagnostic {
  timestamp: number
  matchId: string | null
  map: string | null
  agent: string | null
  gameMode: string
  recordingDuration: number
  fileSizeMb: number
  killsInTimeline: number
  clipsExtracted: number
  matchDetailsStatus: 'fetched' | 'no_match_id' | 'no_region' | 'no_auth' | 'fetch_failed' | 'pending'
}
let lastMatchDiagnostic: LastMatchDiagnostic | null = null

function logActivity(message: string): void {
  const entry = { time: Date.now(), message }
  activityLog.push(entry)
  if (activityLog.length > MAX_LOG_ENTRIES) activityLog.shift()
  mainWindow?.webContents.send('app:activity-log', activityLog.slice())
}

/** Dashboard banner + optional OS notification for recording outcomes. */
function notifyRecordingUx(message: string, notificationTitle = 'UpForge — Recording'): void {
  mainWindow?.webContents.send('app:warning', { message })
  showAppNotification({ title: notificationTitle, body: message, silent: notifySilent() })
}

/** Backend that will be used for the next (or current) match capture. */
function getRecordingBackendForStatus(): RecordingBackend {
  return 'obs'
}

let orphanedRecordingsScanned = false

function userSessionDeps() {
  return {
    clipStore,
    recordingsStore,
    settingsManager,
    getMainWindow: () => mainWindow,
    onScopeChanged: () => {
      orphanedRecordingsScanned = false
      activityLog.length = 0
      mainWindow?.webContents.send('app:activity-log', [])
      mainWindow?.webContents.send('recordings:updated')
      mainWindow?.webContents.send('clips:updated')
      mainWindow?.webContents.send('dashboard:refresh')
      const config = settingsManager?.get()
      if (config) {
        void obsRecorder.applyRecordingSettings(
          buildRecorderConfig(config, hasProAccess(authManager.getUser()), getActiveUserId()),
        )
      }
    },
  }
}

function syncUserSessionFromAuth(): void {
  const user = authManager.getUser()
  if (user?.id) {
    activateUserSession(user.id, userSessionDeps())
  }
  enforceRecordingPresetAccess()
}

function enforceRecordingPresetAccess(): void {
  if (!settingsManager) return
  const allowCreator = hasProAccess(authManager.getUser())
  const current = settingsManager.get()
  if (current.recordingPreset === 'creator' && !allowCreator) {
    settingsManager.save({ recordingPreset: 'coaching' }, { allowCreator: false })
  }
}

function recordingSavePath(): string {
  return resolveRecordingSavePath(settingsManager?.get().savePath, getActiveUserId())
}

function linkedRiotFromAuth() {
  const user = authManager.getUser()
  if (!user?.riot_name?.trim() || !user?.riot_tag?.trim()) return null
  return { name: user.riot_name, tag: user.riot_tag }
}

/** Pick up recent local MP4s that never made it into recordings.json (e.g. post-game window closed early). */
function scanForOrphanedRecordings(force = false): number {
  if (!settingsManager || !recordingsStore) return 0
  if (orphanedRecordingsScanned && !force) return 0
  orphanedRecordingsScanned = true

  const savePath = recordingSavePath()
  const known = recordingsStore.getKnownPaths()
  const orphans = listUnregisteredRecordingFiles(
    savePath,
    known,
    Date.now() - 24 * 60 * 60 * 1000,
  )
  if (orphans.length === 0) return 0

  for (const file of orphans) {
    recordingsStore.add({
      path: file.path, // already preferred (compressed when sibling exists)
      riotName: '',
      riotTag: '',
      game: 'valorant',
      map: null,
      agent: null,
      gameMode: 'UNKNOWN',
      timeline: null,
    })
  }
  log.info(`[Recordings] Imported ${orphans.length} local file(s) into dashboard`)
  logActivity(`Found ${orphans.length} local recording(s) — added to dashboard`)
  mainWindow?.webContents.send('recordings:updated')
  return orphans.length
}

/** Set by setupGameDetection — ends the active match (upload/post-game) when user clicks Stop. */
let manualEndMatchRecording: ((game: string) => Promise<{ ok: boolean; reason?: string }>) | null = null

function notifySilent(): boolean {
  return !(settingsManager?.get().notificationSound ?? true)
}

const clipPipeline = new ClipPipeline({
  clipStore,
  clipExtractor,
  hotkeyBookmarks,
  getRecordingStartTime: () => currentRecordingStartTime,
  logActivity: (msg) => logActivity(msg),
  notifySilent: () => notifySilent(),
  notifyMainWindow: (channel, data) => mainWindow?.webContents.send(channel, data),
  onClipsExtracted: (count) => {
    if (lastMatchDiagnostic) lastMatchDiagnostic.clipsExtracted = (lastMatchDiagnostic.clipsExtracted ?? 0) + count
  },
})

async function extractKillClipsOnly(
  videoPath: string,
  timeline: MatchData,
  analysisJobId: string | null
): Promise<void> {
  return clipPipeline.extractKillClipsOnly(videoPath, timeline, analysisJobId)
}

/**
 * Extract highlight clips from a completed match recording.
 * Called post-match once the recording file is finalised.
 */
async function extractMatchClips(
  videoPath: string,
  timeline: MatchData | null,
  analysisJobId: string | null
): Promise<void> {
  return clipPipeline.extractMatchClips(videoPath, timeline, analysisJobId)
}

function requestPregameBrief(context?: {
  agent?: string | null
  map?: string | null
  mode?: string | null
  allyAgents?: string[]
  enemyAgents?: string[]
}): void {
  _requestPregameBrief(() => authManager.getToken(), logActivity, context, process.env['VITE_API_URL'])
}

async function requestPostGameDebrief(opts: {
  riotName: string
  riotTag: string
  agent: string | null
  map: string | null
  timeline: MatchData
  sendToWindow: (channel: string, payload?: unknown) => void
}): Promise<void> {
  return _requestPostGameDebrief({
    ...opts,
    getToken: () => authManager.getToken(),
    apiUrl: process.env['VITE_API_URL'],
  })
}

function createMainWindow(startAuthenticated: boolean = false): BrowserWindow {
  return _createMainWindow(startAuthenticated, () => isQuitting)
}

function createPostGameWindow(): BrowserWindow {
  return _createPostGameWindow()
}

function createTray(): void {
  const result = _createTray({
    getMainWindow: () => mainWindow,
    setMainWindow: (win) => { mainWindow = win },
    isRecording: () => obsRecorder.isRecording(),
    getPendingCount: () => recordingsStore?.getPending(linkedRiotFromAuth()).length ?? 0,
    createMainWindowFn: () => createMainWindow(),
  })
  tray = result.tray
  updateTrayMenuFn = result.updateMenu
  trayRefreshInterval = result.refreshInterval
}

function setupGameDetection(): void {
  onRecordingLost = (error: string) => {
    const game = gameDetector.currentGame() ?? 'valorant'
    const obsLost = /obs disconnected/i.test(error)
    logActivity(
      obsLost
        ? 'OBS disconnected mid-match — OBS may still be recording; will recover when the match ends'
        : `Recording lost mid-match: ${error}`,
    )
    notifyRecordingUx(
      obsLost
        ? 'OBS disconnected from UpForge. Keep OBS open — your match should still save when it ends. Reconnect in Settings → Recording before the next game.'
        : 'Recording stopped unexpectedly — the match continues but may not be saved. Check permissions and disk space.',
      obsLost ? 'UpForge — OBS Disconnected' : 'UpForge — Recording Lost',
    )
    tray?.setToolTip(obsLost ? 'UpForge — OBS disconnected' : 'UpForge — Recording lost!')
    setTimeout(() => tray?.setToolTip(idleTooltip(game)), 10_000)
  }

  // All known Valorant game modes returned by the Riot Local Client API
  const ALL_MODES = new Set(['COMPETITIVE', 'PREMIER', 'CLASSIC', 'DEATHMATCH', 'TEAMDEATHMATCH', 'SPIKERUSH', 'SWIFTPLAY', 'SNOWBALL'])

  /** Invalidate older game-started handlers and cancel their lobby-wait loops. */
  function beginMatchFlow(): { isStale: () => boolean } {
    matchFlowGeneration++
    const generation = matchFlowGeneration
    matchHandled = false
    riotLocalApi.cancelMenuWatch()
    riotLocalApi.onMatchEnded = null
    cancelMatchWait?.()
    cancelMatchWait = null
    if (waitingForMatch) {
      waitingForMatch = false
      mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })
    }
    return { isStale: () => generation !== matchFlowGeneration }
  }

  /** Exit superseded lobby-wait loops and reset dashboard "waiting for match" UI. */
  function abortIfStale(isStale: () => boolean, game: string): boolean {
    if (!isStale()) return false
    waitingForMatch = false
    cancelMatchWait = null
    mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })
    tray?.setToolTip(idleTooltip(game))
    return true
  }

  function clearOverlayPolling(): void {
    if (overlayPollTimer) { clearInterval(overlayPollTimer); overlayPollTimer = null }
    sendOverlayData('overlay:data', {
      round: null, allyScore: null, enemyScore: null,
      yourCredits: null, enemyEstimate: null, recording: false,
    })
  }

  /**
   * Single entry for match end — prevents onMatchEnded + game-stopped + manual stop
   * from running handleMatchEnd/upload twice (common with fast queue / process exit races).
   */
  async function finalizeMatchOnce(game: string, source: string): Promise<boolean> {
    if (matchHandled) {
      console.log(`[MatchEnd] Ignoring duplicate end signal (${source})`)
      return false
    }
    matchHandled = true
    clearOverlayPolling()
    riotLocalApi.onMatchEnded = null
    mainWindow?.webContents.send('recording:starting', { starting: false })

    const run = async (): Promise<boolean> => {
      try {
        await handleMatchEnd(game)
        return true
      } catch (err) {
        log.error(`[MatchEnd] handleMatchEnd failed (${source}):`, err)
        matchHandled = false
        throw err
      }
    }

    matchFinalizeInFlight = run().finally(() => { matchFinalizeInFlight = null })
    return matchFinalizeInFlight
  }

  /** Re-enter detection after a skipped match (Valorant stays running between queues). */
  async function rearmValorantDetection(game: string, waitForMatchEnd = false): Promise<void> {
    if (game !== 'valorant') return
    const emitNextMatchWatch = async () => {
      await new Promise((r) => setTimeout(r, 5000))
      if (await gameDetector.isMatchProcessRunning()) {
        console.log('[GameDetector] Re-arming after skipped match — watching for next queue')
        logActivity('Watching for next match...')
        gameDetector.emit('game-started', game)
      }
    }
    if (waitForMatchEnd) {
      // onMatchEnded only fires when start() is running presence polls — skipped matches
      // never call start(), so watch menus directly until the player leaves the map.
      riotLocalApi.watchUntilMenus(emitNextMatchWatch)
      return
    }
    await emitNextMatchWatch()
  }

  let handleMatchEndRunning = false
  async function handleMatchEnd(game: string): Promise<void> {
    if (handleMatchEndRunning) {
      log.warn('[HandleMatchEnd] Re-entrant call blocked')
      return
    }
    handleMatchEndRunning = true
    try {
    const config = settingsManager?.get()
    const savePath = recordingSavePath()

    // Duration from OBS clock, or wall clock if WebSocket dropped mid-match.
    let recordingDuration = obsRecorder.getRecordingDuration()
    if (recordingDuration === 0 && currentRecordingStartTime) {
      recordingDuration = Math.floor((Date.now() - currentRecordingStartTime) / 1000)
    }
    const matchSessionStart = currentRecordingStartTime ?? (Date.now() - recordingDuration * 1000)

    const [timeline] = await Promise.all([
      riotLocalApi.stop(),
      obsRecorder.stop(),
    ])

    const resolvedFile = resolveReadyRecordingPath(
      obsRecorder.getLastRecordingPath(),
      savePath,
      matchSessionStart,
    )
    const videoPath = resolvedFile?.path ?? obsRecorder.getLastRecordingPath()
    const fileSize = resolvedFile?.sizeBytes ?? obsRecorder.getLastRecordingSize()

    if (resolvedFile && obsRecorder.hadDisconnectedDuringRecording()) {
      log.info(`[HandleMatchEnd] Recovered recording after OBS disconnect: ${videoPath}`)
      logActivity('Recovered recording after OBS disconnect — continuing upload')
    }

    if (recordingDuration === 0 && fileSize >= MIN_RECORDING_FILE_BYTES && currentRecordingStartTime) {
      recordingDuration = Math.floor((Date.now() - currentRecordingStartTime) / 1000)
    }

    const user = authManager.getUser()
    const map = timeline?.map ?? null
    const agent = timeline?.agent ?? null
    const gameMode = riotLocalApi.getLastGameMode() ?? 'UNKNOWN'
    const autoAnalyse = config?.autoAnalyse !== false

    // Capture diagnostic state for the developer panel
    const riotDiag = riotLocalApi.getDiagnostics()
    const killsInTimeline = timeline?.playerKills?.length ?? 0
    lastMatchDiagnostic = {
      timestamp: Date.now(),
      matchId: timeline?.matchId ?? null,
      map,
      agent,
      gameMode,
      recordingDuration,
      fileSizeMb: fileSize / (1024 * 1024),
      killsInTimeline,
      clipsExtracted: 0, // updated after extractMatchClips completes
      matchDetailsStatus: timeline?.matchId
        ? (killsInTimeline > 0 ? 'fetched' : (riotDiag.region ? 'fetch_failed' : 'no_region'))
        : (riotDiag.accessTokenPresent ? 'no_match_id' : 'no_auth'),
    }

    log.info(
      `[HandleMatchEnd] duration=${recordingDuration}s videoPath=${videoPath} fileSize=${fileSize} ` +
      `kills=${timeline?.playerKills?.length ?? 0} matchId=${timeline?.matchId ?? 'none'}`
    )

    tray?.setToolTip(idleTooltip(game))

    const MIN_DURATION_SECONDS = MIN_RECORDING_DURATION_SECONDS
    const MIN_FILE_SIZE_BYTES = MIN_RECORDING_FILE_BYTES
    const MAX_FILE_SIZE_BYTES = MAX_RECORDING_FILE_BYTES

    if (recordingDuration > 0 && recordingDuration < MIN_DURATION_SECONDS) {
      console.log(`[GameDetector] Recording too short (${recordingDuration}s) — ignoring`)
      logActivity(`Recording too short (${recordingDuration}s) — discarded`)
      notifyRecordingUx(
        `Recording was only ${Math.round(recordingDuration)}s — at least 2 minutes is needed for analysis. The file was discarded.`,
        'UpForge — Recording Too Short'
      )
      if (videoPath && fs.existsSync(videoPath)) {
        try { fs.unlinkSync(videoPath) } catch { /* ignore */ }
      }
      return
    }

    // If recording never started and no file was recovered from disk, skip post-game.
    if (recordingDuration === 0 && fileSize < MIN_RECORDING_FILE_BYTES) {
      scanForOrphanedRecordings(true)
      const lastErr = obsRecorder.getLastError()
      const msg = lastErr ? `Match ended — no recording was made (${lastErr})` : 'Match ended — no active recording'
      logActivity(msg)
      notifyRecordingUx(lastErr ? `No recording was saved: ${lastErr}` : 'No recording was saved for this match.', 'UpForge — No Recording')
      return
    }

    // Close any existing post-game window first (consecutive match scenario —
    // match 2 can end before match 1's window is dismissed).
    postGameWindow?.close()
    const thisPostGameWindow = createPostGameWindow()
    postGameWindow = thisPostGameWindow
    thisPostGameWindow.on('closed', () => {
      if (postGameWindow === thisPostGameWindow) postGameWindow = null
    })
    // Flash the taskbar button so the user knows it's there even if Valorant
    // is still covering the screen (only stops flashing when user focuses it).
    thisPostGameWindow.flashFrame(true)
    thisPostGameWindow.once('focus', () => thisPostGameWindow.flashFrame(false))

    whenWebContentsReady(thisPostGameWindow, () => {
      try {
        if (!thisPostGameWindow.isDestroyed()) {
          thisPostGameWindow.webContents.send('post-game:preparing', { game, map, agent })
        }
      } catch { /* window may have closed */ }
    })

    // Fire post-game debrief in the background — non-blocking. Uses Riot Live Client
    // match data (kills, rounds, stats) for instant Claude coaching without needing the VOD.
    // Only runs for competitive/premier matches where meaningful data was captured.
    const hasMatchData = timeline && (
      (timeline.playerKills?.length ?? 0) > 0
      || (timeline.roundScores?.length ?? 0) > 0
      || timeline.finalStats != null
    )
    const isRankedMode = ['COMPETITIVE', 'PREMIER'].includes(gameMode?.toUpperCase() ?? '')
    if (hasMatchData && isRankedMode && user?.riot_name) {
      requestPostGameDebrief({
        riotName: user.riot_name,
        riotTag: user.riot_tag ?? 'NA1',
        agent,
        map,
        timeline,
        sendToWindow: (channel, payload) => {
          if (!thisPostGameWindow.isDestroyed()) thisPostGameWindow.webContents.send(channel, payload)
        },
      }).catch(err => log.warn('[Debrief] Background debrief failed:', err))
    }

    // Notify the user that the match recording has finished and upload is starting
    {
      const agentLabel = agent ?? gameLabel(game)
      const mapLabel = map ? ` on ${map}` : ''
      showAppNotification({
        title: 'Uploading match',
        body: `${agentLabel}${mapLabel} — coaching report on the way.`,
        silent: notifySilent(),
      })
    }

    // CS2 demo auto-pull — runs asynchronously and never blocks the main upload flow
    if (game === 'cs2') {
      ;(async () => {
        try {
          const cs2DemoDir = settingsManager?.get().cs2DemoDir
          log.info(`[CS2Demo] Match ended — searching for demo (startTime=${matchSessionStart}, dir=${cs2DemoDir ?? 'auto'})`)

          const sendToWindow = (channel: string, payload?: unknown) => {
            if (!thisPostGameWindow.isDestroyed()) thisPostGameWindow.webContents.send(channel, payload)
          }

          const demoResult = await findLatestCS2Demo(matchSessionStart, cs2DemoDir)

          if (!demoResult.found || !demoResult.demoPath) {
            log.info('[CS2Demo] No demo found — user may need cl_demo_auto_recording 1')
            sendToWindow('post-game:demo-status', { status: 'not-found' })
            return
          }

          const { demoPath } = demoResult
          log.info(`[CS2Demo] Demo found: ${demoPath} — starting upload`)
          sendToWindow('post-game:demo-status', { status: 'uploading', path: demoPath })

          const uploader = new CS2DemoUploader(authManager)
          const { jobId } = await uploader.upload({
            demoPath,
            steamId: null,
            onProgress: (pct) => sendToWindow('post-game:demo-progress', pct),
          })

          log.info(`[CS2Demo] Upload complete — jobId=${jobId}, starting poll`)
          sendToWindow('post-game:demo-status', { status: 'analysing', jobId })

          // Poll every 10s with exponential backoff up to 30s, for up to 10 minutes
          const MAX_POLL_MS = 10 * 60 * 1000
          const pollStart = Date.now()
          let interval = 10_000

          while (Date.now() - pollStart < MAX_POLL_MS) {
            await new Promise<void>((r) => setTimeout(r, interval))
            interval = Math.min(interval * 1.5, 30_000)

            try {
              const { status, error } = await uploader.pollStatus(jobId)
              log.info(`[CS2Demo] Poll status=${status}`)

              if (status === 'completed') {
                log.info(`[CS2Demo] Analysis complete — jobId=${jobId}`)
                sendToWindow('post-game:demo-status', { status: 'complete', jobId })
                return
              }
              if (status === 'failed') {
                log.warn(`[CS2Demo] Analysis failed — jobId=${jobId} error=${error}`)
                sendToWindow('post-game:demo-status', { status: 'error', error: error ?? 'Analysis failed' })
                return
              }
            } catch (pollErr) {
              log.warn('[CS2Demo] Poll error (non-fatal):', pollErr)
            }
          }

          log.warn(`[CS2Demo] Polling timed out after 10 minutes — jobId=${jobId}`)
        } catch (err) {
          log.warn('[CS2Demo] Demo upload flow error:', err)
          try {
            if (!thisPostGameWindow.isDestroyed()) {
              thisPostGameWindow.webContents.send('post-game:demo-status', { status: 'error', error: 'Demo upload failed' })
            }
          } catch { /* window may already be closed */ }
        }
      })().catch(() => { /* swallow — never propagate to caller */ })
    }

    const runPostGameUpload = async () => {
        const sendToWindow = (channel: string, payload?: unknown) => {
          const deliver = () => {
            try {
              if (!thisPostGameWindow.isDestroyed()) {
                thisPostGameWindow.webContents.send(channel, payload)
              }
            } catch { /* destroyed between check and send */ }
          }
          if (thisPostGameWindow.isDestroyed()) return
          if (thisPostGameWindow.webContents.isLoading()) {
            thisPostGameWindow.webContents.once('did-finish-load', deliver)
          } else {
            deliver()
          }
        }

      const savePath = recordingSavePath()
      const ready = resolveReadyRecordingPath(
        obsRecorder.getLastRecordingPath() ?? videoPath,
        savePath,
        matchSessionStart,
      )

      if (!ready) {
        scanForOrphanedRecordings(true)
        const backend = getRecordingBackendForStatus()
        const errorMsg = formatRecordingFailure(backend, obsRecorder.getLastError())
        logActivity('Recording file not found at expected path — check save folder in Settings')
        sendToWindow('post-game:upload-error', errorMsg)
        return
      }

      const { path: readyPath, sizeBytes: readySize } = ready

      if (readySize < MIN_FILE_SIZE_BYTES) {
        const sizeMB = (readySize / (1024 * 1024)).toFixed(2)
        const errorMsg = formatCorruptRecordingMessage(getRecordingBackendForStatus(), sizeMB)
        log.error(`[GameDetector] ${errorMsg}`)
        logActivity(`Recording file too small (${sizeMB} MB) — upload skipped`)
        sendToWindow('post-game:upload-error', errorMsg)
        return
      }

      const matchId = timeline?.matchId
      const hasRichMatchData = (timeline?.roundSummaries?.length ?? 0) > 0
        || (timeline?.killEvents?.length ?? 0) > 0
        || (timeline?.playerKills?.length ?? 0) > 0
      const lateRetryScheduled = !hasRichMatchData && !!matchId

      const doAutoDelete = () => {
        if (settingsManager?.get().autoDelete) {
          log.info('[App] Auto-deleting recording after clip extraction:', readyPath)
          obsRecorder.deleteRecording(readyPath)
          deleteCompressedSibling(readyPath)
        }
      }

      // Register on the dashboard immediately — before compression/upload can take minutes.
      if (timeline) recomputeTimelineVideoOffsets(timeline)
      const savedRecording = recordingsStore.add({
        path: readyPath,
        riotName: timeline?.playerName?.trim() ?? '',
        riotTag: timeline?.playerTag?.trim() ?? '',
        game,
        map,
        agent,
        gameMode,
        timeline,
      })
      mainWindow?.webContents.send('recordings:updated')
      logActivity(
        `Recording saved (${(readySize / (1024 ** 3)).toFixed(2)} GB) — visible on dashboard`,
      )

      let uploadPath = readyPath
      let uploadSize = readySize

      try {
        const resolved = await resolveUploadVideoPath(readyPath, (sizeGB) => {
          log.warn(`[HandleMatchEnd] Recording is ${sizeGB} GB — compressing before upload`)
          logActivity(`Recording is ${sizeGB} GB — compressing for upload…`)
          sendToWindow('post-game:compress-start', { sizeGB })
        })
        uploadPath = resolved.path
        uploadSize = resolved.sizeBytes
        if (resolved.compressed) {
          const newGB = (uploadSize / (1024 * 1024 * 1024)).toFixed(2)
          log.info(`[HandleMatchEnd] Compressed to ${newGB} GB`)
          logActivity(`Compressed recording to ${newGB} GB — uploading`)
          if (uploadPath !== readyPath) {
            recordingsStore.updatePath(savedRecording.id, uploadPath)
            mainWindow?.webContents.send('recordings:updated')
          }
        }
      } catch (err) {
        const prepMsg = err instanceof Error ? err.message : String(err)
        log.error('[HandleMatchEnd] Failed to prepare upload file:', err)
        logActivity(`Could not prepare recording for upload: ${prepMsg}`)
        sendToWindow('post-game:upload-error', {
          message: `Could not prepare recording for upload: ${prepMsg}`,
          recordingId: savedRecording.id,
        })
        return
      }

      if (uploadSize > MAX_FILE_SIZE_BYTES) {
        const sizeGB = (uploadSize / (1024 * 1024 * 1024)).toFixed(1)
        const errorMsg = formatRecordingTooLargeMessage(readySize, true)
        log.warn(`[GameDetector] Recording too large to upload: ${sizeGB} GB — extracting clips only`)
        logActivity(`Recording too large (${sizeGB} GB) — full upload skipped, saving clips`)

        extractMatchClips(readyPath, timeline, null)
          .catch(err => log.warn('[ClipExtract] Clip extraction (oversized) error:', err))

        if (lateRetryScheduled) {
          log.info('[HandleMatchEnd] No kills (oversized) — scheduling late retry in 90s')
          setTimeout(async () => {
            try {
              log.info('[LateClipExtract] Fetching match details for', matchId)
              const details = await riotLocalApi.fetchMatchDetailsLate(matchId!)
              if (!details) { log.warn('[LateClipExtract] Match details still unavailable'); return }
              if (timeline) {
                timeline.matchDetails = details
                riotLocalApi.populateMatchDataFromDetails(timeline, details)
                recordingsStore.updateTimeline(savedRecording.id, timeline)
                mainWindow?.webContents.send('recordings:updated')
              }
              if ((timeline?.playerKills?.length ?? 0) === 0) { log.warn('[LateClipExtract] No kills after retry'); return }
              log.info(`[LateClipExtract] Got ${timeline!.playerKills.length} kills — extracting clips`)
              await extractKillClipsOnly(readyPath, timeline!, null)
            } catch (err) {
              log.warn('[LateClipExtract] Error (oversized path):', err)
            }
          }, 90_000)
        }

        sendToWindow('post-game:upload-error', {
          message: errorMsg,
          recordingId: savedRecording.id,
          clipsOnly: true,
        })
        return
      }

      if (!autoAnalyse) {
        sendToWindow('post-game:pending', {
          recordingId: savedRecording.id,
          game,
          map,
          agent
        })

        {
          const agentLabel = agent ?? gameLabel(game)
          const mapLabel = map ? ` · ${map}` : ''
          showAppNotification({
            title: 'Match recorded',
            body: `${agentLabel}${mapLabel} — tap Analyse now in UpForge or review later from your dashboard.`,
            silent: notifySilent(),
          })
        }

        extractMatchClips(readyPath, timeline, null)
          .catch(err => log.warn('[ClipExtract] Clip extraction (no-analyse) error:', err))

        if (lateRetryScheduled) {
          log.info('[HandleMatchEnd] No kills (no-analyse) — scheduling late retry in 90s')
          setTimeout(async () => {
            try {
              log.info('[LateClipExtract] Fetching match details for', matchId)
              const details = await riotLocalApi.fetchMatchDetailsLate(matchId)
              if (!details) { log.warn('[LateClipExtract] Match details still unavailable'); return }
              if (timeline) {
                timeline.matchDetails = details
                riotLocalApi.populateMatchDataFromDetails(timeline, details)
                recordingsStore.updateTimeline(savedRecording.id, timeline)
                mainWindow?.webContents.send('recordings:updated')
              }
              if ((timeline?.playerKills?.length ?? 0) === 0) { log.warn('[LateClipExtract] No kills after retry'); return }
              log.info(`[LateClipExtract] Got ${timeline!.playerKills.length} kills — extracting clips`)
              await extractKillClipsOnly(readyPath, timeline!, null)
            } catch (err) {
              log.warn('[LateClipExtract] Error (no-analyse path):', err)
            }
          }, 90_000)
        }
        return
      }

      tray?.setToolTip('UpForge — Uploading...')

      const uploadResult = await doUploadAndAnalyse(savedRecording.id, uploadPath, user?.riot_name ?? '', user?.riot_tag ?? '',
        game, map, agent, timeline, thisPostGameWindow, matchSessionStart, /* skipAutoDelete= */ true)

      const jobId = uploadResult ?? null

      extractMatchClips(readyPath, timeline, jobId)
        .catch(err => log.warn('[ClipExtract] Background extraction error:', err))
        .finally(() => {
          if (!lateRetryScheduled) doAutoDelete()
        })

      if (lateRetryScheduled) {
        log.info('[HandleMatchEnd] No kills in timeline — scheduling late match details retry in 90s (auto-delete deferred)')
        setTimeout(async () => {
          try {
            log.info('[LateClipExtract] Fetching match details for', matchId)
            const details = await riotLocalApi.fetchMatchDetailsLate(matchId)
            if (!details) {
              log.warn('[LateClipExtract] Match details still unavailable after delay')
              return
            }
            if (timeline) timeline.matchDetails = details
            if (timeline) riotLocalApi.populateMatchDataFromDetails(timeline, details)
            if (timeline) {
              recordingsStore.updateTimeline(savedRecording.id, timeline)
              mainWindow?.webContents.send('recordings:updated')
            }
            const gotData = (timeline?.roundSummaries?.length ?? 0) > 0
              || (timeline?.playerKills?.length ?? 0) > 0
            if (!gotData) {
              log.warn('[LateClipExtract] Match details fetched but no round/kill data for this player')
              return
            }
            if (jobId && timeline) {
              await uploadManager.patchMatchData(jobId, timeline).catch((err) => {
                log.warn('[LateClipExtract] Failed to patch job match_data:', err)
              })
            }
            log.info(`[LateClipExtract] Got ${timeline!.playerKills.length} kills — extracting clips`)
            await extractKillClipsOnly(readyPath, timeline!, jobId)
          } catch (err) {
            log.warn('[LateClipExtract] Error:', err)
          } finally {
            doAutoDelete()
          }
        }, 90_000)
      }
    }

    void runPostGameUpload().catch((err) => {
      log.error('[HandleMatchEnd] Post-game upload failed:', err)
      logActivity(`Upload failed to start: ${err instanceof Error ? err.message : String(err)}`)
    })
    } finally {
      handleMatchEndRunning = false
      currentRecordingStartTime = null
    }
  }

  manualEndMatchRecording = async (game: string) => {
    if (!obsRecorder.isRecording() && currentRecordingStartTime === null) {
      return { ok: false, reason: 'not_recording' }
    }
    if (matchHandled) {
      return { ok: false, reason: 'already_handled' }
    }
    logActivity('Recording stopped manually — finishing match')
    try {
      const didFinalize = await finalizeMatchOnce(game, 'manual')
      if (!didFinalize) return { ok: false, reason: 'already_handled' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logActivity(`Failed to finish match after stop: ${msg}`)
      notifyRecordingUx(`Could not finish the match: ${msg}`, 'UpForge — Recording')
      return { ok: false, reason: msg }
    }
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized()) mainWindow.restore()
    destroyOverlay()
    await rearmValorantDetection(game)
    return { ok: true }
  }

  gameDetector.on('game-started', async (game: string) => {
    if (obsRecorder.isRecording()) {
      console.log('[GameDetector] game-started ignored — already recording')
      return
    }

    const { isStale } = beginMatchFlow()
    console.log(`[GameDetector] ${game} started (flow #${matchFlowGeneration})`)
    logActivity(`${game === 'cs2' ? 'CS2' : 'Valorant'} detected — waiting for match`)
    if (game === 'valorant') {
      void riotLocalApi.getPregameContext().then((ctx) => {
        discordRPC.setInGame(game, { map: ctx?.map ?? null, agent: ctx?.agent ?? null })
      }).catch(() => discordRPC.setInGame(game))
    } else {
      discordRPC.setInGame(game)
    }

    // Minimize the main window while gaming to reduce Chromium GPU/CPU overhead.
    // The user can restore it from the taskbar or tray if needed.
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      mainWindow.minimize()
    }

    const config = settingsManager?.get()

    const recordedModesEarly = config?.recordedModes
    if (Array.isArray(recordedModesEarly) && recordedModesEarly.length === 0) {
      logActivity('No game modes selected — recording disabled')
      notifyRecordingUx('Select at least one game mode in Settings → Recording to record matches.')
      tray?.setToolTip(idleTooltip(game))
      return
    }

    // Auto-kill user-configured background apps before the game starts
    if (config?.pregameKillList?.length && performanceManager) {
      for (const procName of config.pregameKillList) {
        performanceManager.killProcess(procName).catch(() => {})
      }
    }

    const recorderConfig = config ? buildRecorderConfig(config, hasProAccess(authManager.getUser()), getActiveUserId()) : undefined

    // Check disk space now so the warning shows while in lobby
    const savePath = recordingSavePath()
    if (!obsRecorder.isConnected()) {
      await probeObsConnection(obsRecorder, mainWindow, { notify: false, logActivity })
    }
    if (recorderConfig) {
      log.info(
        `[Recorder] OBS · ${formatRecordingLabel(recorderConfig.quality, recorderConfig.bitrate, recorderConfig.fps ?? 30)}` +
        `${recorderConfig.manageObsVideo === false ? ' (OBS video settings unchanged)' : ''} (synced to OBS before recording)`,
      )
    }
    const freeBytes = await obsRecorder.getFreeDiskSpace(savePath)
    const TWO_GB = 2 * 1024 * 1024 * 1024
    if (freeBytes < TWO_GB) {
      const freeGB = (freeBytes / (1024 ** 3)).toFixed(1)
      console.warn(`[Recorder] Low disk space: ${freeGB} GB free`)
      mainWindow?.webContents.send('app:warning', { message: `Low disk space (${freeGB} GB free) — recording may be cut short` })
      showAppNotification({
        title: 'UpForge — Low Disk Space',
        body: `Only ${freeGB} GB free. Recording may be cut short.`,
        silent: true,
      })
    }

    tray?.setToolTip('UpForge — Match loading...')
    mainWindow?.webContents.send('recording:waiting-for-match', { waiting: true })

    // Pre-game brief: fetch agent+map context from the Riot pregame API (available during
    // loading screen) and show a personalised coaching notification.
    // Falls back to a generic brief if the Riot Local API is not reachable.
    let pregameBriefFired = false

    // VALORANT-Win64-Shipping.exe is the in-game process — its presence confirms a map
    // is loading or actively in progress. The Riot Live Client Data API (port 2999) was
    // deprecated; we no longer gate recording on it.
    // Wait 90 seconds for the loading screen to pass, cancelling early if the process dies.
    let gameMode: string | null = null
    let cancelled = false
    cancelMatchWait = () => { cancelled = true }
    waitingForMatch = true

    const recordedModes = config?.recordedModes ?? ['COMPETITIVE', 'PREMIER']
    // Empty list = record nothing (dashboard/settings copy). Non-empty partial list = filter.
    const filterByMode = recordedModes.length > 0 &&
      !([...ALL_MODES].every(m => recordedModes.includes(m)))

    // ── Presence-based match detection ────────────────────────────────────
    // Try to use the Riot Local API to detect when the match actually goes
    // INGAME, so we avoid the old blind 90s wait.  Falls back to a 90s wait
    // if the lockfile / auth is not available (rare on modern installs).
    // ──────────────────────────────────────────────────────────────────────
    let matchStartTime: number | null = null
    let modeConfident = false
    const authOk = game === 'valorant' && await riotLocalApi.initAuth()

    if (authOk) {
      logActivity('Riot Client API ready — waiting for INGAME presence')
      // Wait up to 25 minutes for INGAME (handles long Agent Select)
      const PRESENCE_TIMEOUT_MS = 25 * 60 * 1000
      const deadline = Date.now() + PRESENCE_TIMEOUT_MS
      while (Date.now() < deadline && !cancelled) {
        if (abortIfStale(isStale, game)) return
        await new Promise((r) => setTimeout(r, 1000))
        if (cancelled) break
        const stillRunning = await gameDetector.isMatchProcessRunning()
        if (!stillRunning) { cancelled = true; break }
        try {
          const state = await riotLocalApi.getSessionState()

          // Resolve game mode from presence queueId (available from queue through agent select)
          if (state?.queueId) {
            const { normalizeQueueId } = await import('./riot-local-api')
            gameMode = normalizeQueueId(state.queueId)
            modeConfident = true
          }

          // Pre-game brief is only useful for competitive/premier matches.
          // Wait until mode is confirmed — do NOT default to true when unknown,
          // as that's what was causing the brief to fire for all queues.
          const modeKnown = gameMode !== null
          const isCompBrief = gameMode === 'COMPETITIVE' || gameMode === 'PREMIER'

          // Brief: once PREGAME starts, poll until the agent is locked in (CharacterID
          // is only set after lock-in). Fire as soon as we have agent+map, or fall back
          // to map-only/generic when INGAME is reached (loading screen).
          if (!pregameBriefFired && state?.sessionLoopState === 'PREGAME') {
            const ctx = await riotLocalApi.getPregameContext().catch(() => null)

            // Use QueueID from the pregame match endpoint as the definitive source
            if (ctx?.mode && !gameMode) {
              gameMode = ctx.mode
            }

            const resolvedIsComp = gameMode === 'COMPETITIVE' || gameMode === 'PREMIER'

            if (!resolvedIsComp && gameMode !== null) {
              // Non-competitive queue confirmed — skip brief
              pregameBriefFired = true
            } else if (resolvedIsComp && ctx?.agent) {
              // Competitive + agent locked in — fire with full context
              pregameBriefFired = true
              requestPregameBrief(ctx)
            }

            if (ctx?.map || ctx?.agent) {
              discordRPC.setInGame(game, { map: ctx.map, agent: ctx.agent })
            }
            // else: mode not yet known or agent not locked — keep looping, try again next tick
          }

          if (!pregameBriefFired && state?.sessionLoopState === 'INGAME') {
            if (modeKnown && isCompBrief) {
              // Competitive confirmed — fire fallback brief (agent may still be unknown)
              pregameBriefFired = true
              riotLocalApi.getPregameContext()
                .then(ctx => requestPregameBrief(ctx ?? undefined))
                .catch(() => requestPregameBrief())
            } else if (modeKnown) {
              // Non-competitive confirmed — suppress brief
              pregameBriefFired = true
            }
            // else: mode still unknown — keep polling; don't brief non-comp queues
          }

          if (state?.sessionLoopState === 'INGAME') {
            // Replay viewer shows INGAME presence — do not record replays
            if (state.isReplay) {
              console.log('[GameDetector] Replay detected (provisioningFlow=Replay) — skipping recording')
              logActivity('Replay detected — recording skipped')
              notifyRecordingUx('Replay viewer detected — only live matches are recorded.')
              tray?.setToolTip(idleTooltip(game))
              waitingForMatch = false
              cancelMatchWait = null
              mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })
              await rearmValorantDetection(game, true)
              return
            }
            matchStartTime = Date.now()
            if (state.queueId) {
              const { normalizeQueueId } = await import('./riot-local-api')
              gameMode = normalizeQueueId(state.queueId)
              modeConfident = true
            } else {
              const mode = await riotLocalApi.getGameMode()
              if (mode) {
                gameMode = mode
                modeConfident = true
              }
            }
            break
          }
        } catch { /* presence endpoint not yet up — keep waiting */ }
      }
    } else {
      // Fallback: wait 90 s for the loading screen
      const LOADING_DELAY_MS = 90_000
      logActivity('Riot Client API unavailable — recording starts in 90s')
      const deadline = Date.now() + LOADING_DELAY_MS
      while (Date.now() < deadline && !cancelled) {
        if (abortIfStale(isStale, game)) return
        await new Promise((r) => setTimeout(r, 5000))
        if (cancelled) break
        const stillRunning = await gameDetector.isMatchProcessRunning()
        if (!stillRunning) { cancelled = true; break }
      }
    }

    waitingForMatch = false
    cancelMatchWait = null
    mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })

    if (abortIfStale(isStale, game)) return

    if (cancelled) {
      logActivity('Match cancelled (game quit during loading)')
      console.log('[GameDetector] Game quit during loading — no recording')
      tray?.setToolTip(idleTooltip(game))
      return
    }

    // If presence API was available but INGAME was never seen, the player is idle
    // in the lobby (or queued and cancelled). Do NOT start recording — this is what
    // causes "hallucinated" matches when the app is left idle for 25+ minutes.
    if (authOk && matchStartTime === null) {
      logActivity('Presence timeout — no match started, returning to idle')
      console.log('[GameDetector] Presence loop timed out without INGAME — not recording')
      tray?.setToolTip(idleTooltip(game))
      // Re-arm: if the game process is still alive, re-enter the detection loop
      // so we catch the next match the player queues into.
      await new Promise((r) => setTimeout(r, 5000))
      if (await gameDetector.isMatchProcessRunning()) {
        console.log('[GameDetector] Game still running after presence timeout — re-arming detection')
        gameDetector.emit('game-started', game)
      }
      return
    }

    // If presence didn't give us a mode, try the log file as last resort (never overwrite queueId)
    if (!modeConfident) {
      const logMode = await riotLocalApi.getGameModeFromLog()
      if (logMode) {
        if (!gameMode) gameMode = logMode
        modeConfident = true
      } else if (gameMode) {
        modeConfident = true
      }
    }

    if (filterByMode && !modeConfident) {
      console.log('[GameDetector] Skipping recording — queue mode unknown')
      logActivity('Queue mode unknown — recording skipped (select all modes or wait for queue)')
      notifyRecordingUx(
        'Could not detect this queue type — recording skipped. Enable more modes in Settings or wait until the queue is identified.',
      )
      tray?.setToolTip(idleTooltip(game))
      await rearmValorantDetection(game, true)
      return
    }

    if (filterByMode && gameMode && !recordedModes.includes(gameMode)) {
      console.log(`[GameDetector] Skipping recording — mode is ${gameMode} (recordedModes=${recordedModes.join(',')})`)
      logActivity(`Mode ${gameMode} not in recorded modes (${recordedModes.join(', ')}) — skipped`)
      notifyRecordingUx(
        `${gameMode} is not in your recorded modes — this match was not captured. Change modes in Settings → Recording.`,
      )
      tray?.setToolTip(idleTooltip(game))
      await rearmValorantDetection(game, true)
      return
    }

    if (abortIfStale(isStale, game)) return
    if (obsRecorder.isRecording()) {
      console.log('[GameDetector] Match confirmed but recorder already active — skipping duplicate start')
      return
    }

    if (!gameMode) gameMode = 'COMPETITIVE'
    matchHandled = false

    if (!pregameBriefFired && (gameMode === 'COMPETITIVE' || gameMode === 'PREMIER')) {
      requestPregameBrief({ agent: null, map: null, mode: gameMode })
      pregameBriefFired = true
    }

    logActivity(`Match detected (${gameMode}${modeConfident ? '' : '?'}) — starting recording`)
    console.log(`[GameDetector] Match confirmed! gameMode=${gameMode} confident=${modeConfident} matchStartTime=${matchStartTime}`)

    // Wire up onMatchEnded — fires when Riot presence transitions INGAME → MENUS.
    // Only applicable to Valorant; CS2/Deadlock rely on the game process exiting.
    if (game === 'valorant') {
      riotLocalApi.cancelMenuWatch()
      riotLocalApi.onMatchEnded = async () => {
        const elapsedSec = currentRecordingStartTime
          ? Math.floor((Date.now() - currentRecordingStartTime) / 1000)
          : 0
        console.log(`[RiotLocalApi] onMatchEnded fired — stopping recording (${elapsedSec}s captured)`)
        logActivity(`Match ended (presence) — stopping recording (${elapsedSec > 0 ? `${Math.round(elapsedSec / 60)}m ${elapsedSec % 60}s` : 'unknown duration'})`)
        const didFinalize = await finalizeMatchOnce(game, 'presence')
        if (!didFinalize) return
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized()) mainWindow.restore()
        destroyOverlay()
        await new Promise((r) => setTimeout(r, 5000))
        if (await gameDetector.isMatchProcessRunning()) {
          console.log('[GameDetector] Game still running after match — watching for next match')
          logActivity('Watching for next match...')
          gameDetector.emit('game-started', game)
        }
      }

      // Start Riot local API tracking (kill/round events, match ID, post-match details)
      riotLocalApi.start(game, matchStartTime ?? undefined)
    }

    tray?.setToolTip('UpForge — Starting recorder...')
    mainWindow?.webContents.send('recording:starting', { starting: true })
    try {
      // Create the overlay window just before recording starts — deferred from startup
      // so it doesn't break Valorant's exclusive fullscreen before we actually need it.
      createOverlayWindow()
      await ensureObsReady()
      await obsRecorder.start(game, recorderConfig)
      // Update recordingStartTime to the moment the recorder actually began capturing.
      // Accurate videoOffsetMs: offset = (loadSkew − recordingLag) + timeSinceGameStart.
      const recStartTime = Date.now()
      riotLocalApi.setRecordingStartTime(recStartTime)
      currentRecordingStartTime = recStartTime
      hotkeyBookmarks.length = 0 // clear any stale bookmarks from previous match
      // Push recording=true to the overlay immediately — don't wait for the poll cycle
      sendOverlayData('overlay:data', { round: null, allyScore: null, enemyScore: null, yourCredits: null, enemyEstimate: null, recording: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('[Main] Failed to start recording:', msg)
      reportRecordingError('start', msg, { backend: getRecordingBackendForStatus() })
      logActivity(`Recording failed to start: ${msg}`)
      matchHandled = false
      riotLocalApi.onMatchEnded = null
      try { await riotLocalApi.stop() } catch { /* ignore */ }
      destroyOverlay()
      mainWindow?.webContents.send('recording:starting', { starting: false })
      notifyRecordingUx(`Could not start recording: ${msg}`, 'UpForge — Recording Failed')
      tray?.setToolTip('UpForge — Recording failed!')
      setTimeout(() => tray?.setToolTip(idleTooltip(game)), 10_000)
      await rearmValorantDetection(game, true)
      return
    }
    logActivity(`Recording started (${gameMode ?? 'unknown mode'}${obsRecorder.wasNoAudio() ? ' — no audio' : ''})`)

    // Poll overlay/session state — first INGAME tick sets gameplayStartTime for VOD sync.
    const pollOverlaySession = async () => {
      try {
        const state = await riotLocalApi.getSessionState()
        if (state?.sessionLoopState === 'INGAME') {
          riotLocalApi.setGameplayStartTime(Date.now())
          const round = (state.allyScore ?? 0) + (state.enemyScore ?? 0) + 1
          sendOverlayData('overlay:data', {
            round,
            allyScore: state.allyScore ?? 0,
            enemyScore: state.enemyScore ?? 0,
            yourCredits: null,
            enemyEstimate: null,
            recording: true,
          })
        }
        if (obsRecorder.isRecording()) {
          const start =
            currentRecordingStartTime != null ? new Date(currentRecordingStartTime) : new Date()
          discordRPC.setRecording(game, start, discordMatchContext())
        }
      } catch { /* ignore — session endpoint may be unavailable */ }
    }
    void pollOverlaySession()
    overlayPollTimer = setInterval(() => { void pollOverlaySession() }, 1_000)

    if (obsRecorder.wasNoAudio()) {
      mainWindow?.webContents.send('app:warning', {
        message: 'Recording started without audio — your system audio device was unavailable'
      })
    }

    const startupWarning = obsRecorder.getStartupWarning()
    if (startupWarning) {
      mainWindow?.webContents.send('app:warning', { message: startupWarning })
    }

    const user = authManager.getUser()
    const userLabel = (user?.riot_name && user?.riot_tag)
      ? `${user.riot_name}#${user.riot_tag}`
      : user?.name ?? 'your account'
    const gameLabel = game === 'cs2' ? 'CS2' : 'Valorant'
    tray?.setToolTip(`UpForge — Recording ${gameLabel} (${userLabel})`)

    const feedbackMode = settingsManager.get().inGameFeedback ?? 'notifications'
    deliverInGameFeedback(inGameFeedbackDeps(), {
      kind: 'recording-started',
      title: 'Recording started',
      body: `${gameLabel} match for ${userLabel} — F9 clip · F8 screenshot · F10 overlay`,
      beep: 'success',
      flashOverlayMs: feedbackMode === 'notifications' ? 0 : 7000,
    })
  })

  gameDetector.on('game-stopped', async (game: string) => {
    console.log(`[GameDetector] ${game} stopped`)
    discordRPC.setIdle()
    riotLocalApi.cancelMenuWatch()
    riotLocalApi.onMatchEnded = null

    // Game quit while still in lobby (before match started).
    // Only cancel the wait if the match hasn't already been handled by presence — if it has,
    // the re-arm is running inside cancelMatchWait and we should NOT cancel it: the
    // isMatchProcessRunning() check inside the loop will cancel it naturally when Shipping.exe
    // is no longer running.
    if (cancelMatchWait && !matchHandled) {
      cancelMatchWait()
      cancelMatchWait = null
      waitingForMatch = false
      mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })
      tray?.setToolTip(idleTooltip(game))
      console.log('[GameDetector] Game quit before match — no recording to save')
      logActivity('Game quit before match started — nothing recorded')
      // Restore main window now that game is gone
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized()) mainWindow.restore()
      destroyOverlay()
      return
    }

    // Match already finalized (or waiting for next queue) — clear lobby state if game quit
    if (matchHandled) {
      if (!obsRecorder.isRecording()) {
        cancelMatchWait?.()
        cancelMatchWait = null
        waitingForMatch = false
        mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })
        tray?.setToolTip(idleTooltip(game))
        logActivity('Game closed — returned to idle')
      } else {
        log.info('[GameDetector] Match already handled — skipping game-stopped')
      }
      riotLocalApi.onMatchEnded = null
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized()) mainWindow.restore()
      destroyOverlay()
      return
    }

    // Skipped-match menu watch or idle — no recorder running.
    if (!obsRecorder.isRecording()) {
      waitingForMatch = false
      mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })
      tray?.setToolTip(idleTooltip(game))
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized()) mainWindow.restore()
      destroyOverlay()
      return
    }

    // Process died without a clean presence transition (crash, force-quit, etc.)
    logActivity('Game process ended — stopping recording')
    await finalizeMatchOnce(game, 'process-exit')
    // Restore main window now that game is gone
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized()) mainWindow.restore()
    destroyOverlay()
  })

  gameDetector.start()
}

async function handleOrphanedJobAtStartup(
  orphanedJob: { job_id: string; savedAt: number; agent?: string; map?: string; game?: string }
): Promise<void> {
  const context = {
    agent: orphanedJob.agent,
    map: orphanedJob.map,
    game: orphanedJob.game ?? 'valorant',
  }

  const decision = await reconcileOrphanedJob(uploadManager, orphanedJob)

  if (decision.action === 'discard') {
    clearPendingJob()
    logActivity(`Cleared stale analysis job (${decision.reason})`)
    return
  }

  if (decision.action === 'failed') {
    clearPendingJob()
    logActivity(`Previous analysis failed: ${decision.error}`)
    tray?.setToolTip(idleTooltip(context.game))
    return
  }

  if (decision.action === 'completed') {
    clearPendingJob()
    const score = (decision.status.result as Record<string, unknown> | undefined)?.overall_score as number | undefined
    logActivity(`Previous analysis finished while app was closed${score != null ? ` — Score: ${score}/100` : ''}`)
    mainWindow?.webContents.send('dashboard:refresh')
    tray?.setToolTip(idleTooltip(context.game))
    const notifAgent = context.agent ?? gameLabel(context.game)
    const notifMap = context.map ? ` on ${context.map}` : ''
    const notifScore = score != null ? ` — Score: ${score}/100` : ''
    showAppNotification({
      title: 'UpForge — Analysis Ready',
      body: `${notifAgent}${notifMap}${notifScore}`,
      silent: notifySilent(),
    })
    return
  }

  await resumePollForJob(orphanedJob.job_id, context)
}

/**
 * Resume polling for a job that was in-flight when the app last crashed.
 * Runs the same exponential-backoff loop as doUploadAndAnalyse, but sends
 * results to the main window (no post-game window needed).
 */
async function resumePollForJob(
  jobId: string,
  context: { agent?: string; map?: string; game?: string }
): Promise<void> {
  const { agent = null, map = null, game = 'valorant' } = context
  logActivity(`Resuming analysis poll for job ${jobId}`)
  tray?.setToolTip('UpForge — Analysing (resumed)…')

  startAnalysisPoll({
    uploadManager,
    jobId,
    mainWindow,
    onCompleted: (status) => {
      const score = (status.result as Record<string, unknown> | undefined)?.overall_score as number | undefined
      logActivity(`Resumed analysis ready${score != null ? ` — Score: ${score}/100` : ''}`)
      mainWindow?.webContents.send('dashboard:refresh')
      tray?.setToolTip(idleTooltip(game))
      const notifAgent = agent ?? gameLabel(game)
      const notifMap = map ? ` on ${map}` : ''
      const notifScore = score != null ? ` — Score: ${score}/100` : ''
      showAppNotification({
        title: 'UpForge — Analysis Ready',
        body: `${notifAgent}${notifMap}${notifScore}`,
        silent: notifySilent(),
      })
    },
    onFailed: (_userMessage, rawError) => {
      logActivity(`Resumed analysis failed: ${rawError}`)
      tray?.setToolTip(idleTooltip(game))
      const body = rawError.length > 100 ? rawError.slice(0, 97) + '…' : rawError
      showAppNotification({
        title: 'UpForge — Analysis Failed',
        body,
        silent: notifySilent(),
      })
      mainWindow?.webContents.send('dashboard:refresh')
    },
    onConnectionLost: () => {
      logActivity('Resumed poll — lost connection to server (will retry when you reopen UpForge)')
      tray?.setToolTip(idleTooltip(game))
    },
    onPollEnded: (reason) => {
      if (reason === 'max_duration') {
        logActivity('Resumed analysis poll stopped after 90 minutes — job may still be processing')
        tray?.setToolTip('UpForge — Analysis still running…')
        showAppNotification({
          title: 'UpForge — Still analysing',
          body: 'Your match is still processing on our servers. We\'ll notify you when it\'s ready.',
          silent: notifySilent(),
        })
      }
    },
  })
}

/** Upload a recording and poll for the analysis result, sending IPC events to `targetWindow`. */
async function doUploadAndAnalyse(
  recordingId: string | null,
  videoPath: string,
  riotName: string,
  riotTag: string,
  game: string,
  map: string | null,
  agent: string | null,
  timeline: MatchData | null,
  targetWindow: BrowserWindow,
  sessionStart = 0,
  skipAutoDelete = false,
  /** When true, delete local file after upload even if autoDelete setting is off (storage cleanup flow). */
  deleteLocalAfterUpload = false,
): Promise<string | null> {
  const send = (channel: string, payload?: unknown) => {
    try {
      if (!targetWindow.isDestroyed()) targetWindow.webContents.send(channel, payload)
    } catch { /* destroyed between isDestroyed check and send */ }
  }
  stopActiveAnalysisPoll()

  let effectivePath = videoPath
  try {
    const resolved = await resolveUploadVideoPath(videoPath, (sizeGB) => {
      log.warn(`[Upload] Recording is ${sizeGB} GB — compressing before upload`)
      logActivity(`Recording is ${sizeGB} GB — compressing for upload…`)
      send('post-game:compress-start', { sizeGB })
    })
    effectivePath = resolved.path
    if (resolved.compressed) {
      const newGB = (resolved.sizeBytes / (1024 ** 3)).toFixed(2)
      logActivity(`Compressed recording to ${newGB} GB — uploading`)
      if (recordingId && effectivePath !== videoPath) {
        recordingsStore.updatePath(recordingId, effectivePath)
        mainWindow?.webContents.send('recordings:updated')
      }
    }
    if (resolved.sizeBytes > MAX_RECORDING_FILE_BYTES) {
      const sizeGB = (resolved.sizeBytes / (1024 ** 3)).toFixed(1)
      const errorMsg = formatRecordingTooLargeMessage(resolved.sizeBytes, false)
      send('post-game:upload-error', { message: errorMsg, recordingId: recordingId ?? undefined })
      logActivity(`Recording still too large after compression (${sizeGB} GB)`)
      return null
    }
  } catch (prepErr) {
    log.error('[Upload] Failed to prepare video path:', prepErr)
    send('post-game:upload-error', {
      message: prepErr instanceof Error ? prepErr.message : 'Could not prepare recording for upload',
      recordingId: recordingId ?? undefined,
    })
    return null
  }

  if (timeline && game === 'valorant') {
    try {
      const enriched = await riotLocalApi.enrichTimelineMatchDetails(timeline, {
        onStatus: (msg) => logActivity(msg),
      })
      if (enriched) {
        recomputeTimelineVideoOffsets(timeline)
        if (recordingId) {
          recordingsStore.updateTimeline(recordingId, timeline)
          mainWindow?.webContents.send('recordings:updated')
        }
        if (lastMatchDiagnostic) {
          lastMatchDiagnostic.killsInTimeline = timeline.playerKills?.length ?? 0
          lastMatchDiagnostic.matchDetailsStatus = 'fetched'
        }
        logActivity(
          `Riot match stats loaded (${timeline.roundSummaries?.length ?? 0} rounds, ${timeline.playerKills?.length ?? 0} kills)`,
        )
      }
    } catch (err) {
      log.warn('[Upload] Match details enrichment failed:', err)
    }
  }

  // Show upload UI only after compression/prep — avoids a stuck 0% bar while ffmpeg runs.
  send('post-game:upload-start', {
    game,
    map,
    agent,
    matchDetailsStatus: lastMatchDiagnostic?.matchDetailsStatus ?? 'pending',
    killsInTimeline: lastMatchDiagnostic?.killsInTimeline ?? 0,
  })
  send('post-game:upload-progress', 3)

  try {
    logActivity(`Uploading recording${map ? ` (${map}${agent ? ` · ${agent}` : ''})` : ''}`)

    const result = await uploadManager.upload({
      videoPath: effectivePath,
      riotName,
      riotTag,
      game,
      map,
      agent,
      timeline,
      onProgress: (pct) => {
        send('post-game:upload-progress', pct)
      }
    })

    send('post-game:upload-complete', { jobId: result.job_id })
    logActivity('Upload complete — AI analysis running')
    tray?.setToolTip('UpForge — Analysing...')

    // Mark as analysed in store (if this was a saved recording)
    if (recordingId) {
      recordingsStore.markAnalysed(recordingId, result.job_id)
      mainWindow?.webContents.send('recordings:updated')
      mainWindow?.webContents.send('dashboard:refresh')
    }

    // Auto-delete after upload if configured (skip when called from handleMatchEnd —
    // deletion is deferred until after clip extraction so clips aren't skipped)
    if ((!skipAutoDelete && settingsManager?.get().autoDelete) || deleteLocalAfterUpload) {
      log.info('[App] Auto-deleting recording after upload:', videoPath)
      obsRecorder.deleteRecording(videoPath)
      deleteCompressedSibling(videoPath)
    }

    startAnalysisPoll({
      uploadManager,
      jobId: result.job_id,
      targetWindow,
      mainWindow,
      onCompleted: (status) => {
        const score = (status.result as Record<string, unknown>).overall_score as number | undefined
        const analysisId = (status.result as Record<string, unknown>).analysis_id as number | undefined
        if (recordingId && analysisId != null) {
          recordingsStore.setAnalysisId(recordingId, analysisId)
          mainWindow?.webContents.send('recordings:updated')
        }
        const improvements = (status.result as Record<string, unknown>).priority_improvements as string[] | undefined
        const topIssue = (status.result as Record<string, unknown>).top_issue as string | undefined
        const insightText = (improvements && improvements.length > 0) ? improvements[0] : (topIssue ?? null)
        logActivity(`Analysis ready${score != null ? ` — Score: ${score}/100` : ''}`)
        if (insightText) {
          const insight = { text: insightText, score: score ?? 0, agent: agent ?? null, analysisId: analysisId ?? null, date: new Date().toISOString() }
          settingsManager.save({ lastInsight: insight })
          mainWindow?.webContents.send('dashboard:last-insight', insight)
        }
        const lastScore = timeline?.finalScore
          ?? (timeline?.roundScores?.length
            ? timeline.roundScores[timeline.roundScores.length - 1]
            : null)
        const matchResult: 'win' | 'loss' | null = lastScore
          ? (lastScore.allyScore > lastScore.enemyScore ? 'win' : 'loss')
          : null

        send('post-game:analysis-ready', {
          recording_id: recordingId,
          overall_score: (status.result as Record<string, unknown>).overall_score,
          analysis_id: (status.result as Record<string, unknown>).analysis_id,
          top_issue: (status.result as Record<string, unknown>).top_issue,
          priority_improvements: (status.result as Record<string, unknown>).priority_improvements,
          verdict: (status.result as Record<string, unknown>).verdict ?? null,
          coaching_tags: (status.result as Record<string, unknown>).coaching_tags ?? [],
          spatial_summary: (status.result as Record<string, unknown>).spatial_summary
            ?? timeline?.spatialSummary
            ?? null,
          category_scores: (status.result as Record<string, unknown>).category_scores ?? [],
          session_start: sessionStart,
          kills: timeline?.finalStats?.kills ?? null,
          deaths: timeline?.finalStats?.deaths ?? null,
          assists: timeline?.finalStats?.assists ?? null,
          match_result: matchResult,
          ally_score: lastScore?.allyScore ?? null,
          enemy_score: lastScore?.enemyScore ?? null,
        })
        mainWindow?.webContents.send('dashboard:refresh')
        tray?.setToolTip(idleTooltip(game))
        const notifAgent = agent ?? gameLabel(game)
        const notifMap = map ? ` on ${map}` : ''
        const notifBody = score != null
          ? `${notifAgent}${notifMap} — ${score}/100`
          : `${notifAgent}${notifMap}`.trim()
        showAppNotification({
          title: 'Coaching ready',
          body: notifBody,
          silent: notifySilent(),
        })
        if (!targetWindow.isDestroyed()) {
          targetWindow.flashFrame(true)
          targetWindow.once('focus', () => targetWindow.flashFrame(false))
        }
        if (analysisId && settingsManager?.get()?.autoOpenBrowser !== false) {
          shell.openExternal(`https://upforge.gg/${game}/results/${analysisId}`)
        }
      },
      onFailed: (userMessage, rawError) => {
        logActivity(`Analysis failed: ${rawError}`)
        send('post-game:upload-error', userMessage)
        tray?.setToolTip(idleTooltip(game))
      },
      onConnectionLost: () => {
        logActivity('Analysis polling failed — lost connection to server')
        send('post-game:upload-error', 'Lost connection while waiting for analysis. Your job is still queued — reopen UpForge when you\'re back online.')
        tray?.setToolTip(idleTooltip(game))
      },
      onPollEnded: (reason) => {
        if (reason === 'max_duration') {
          logActivity('Analysis poll reached 90 minute cap — job may still be processing on server')
          send('post-game:analysis-deferred', { jobId: result.job_id })
          tray?.setToolTip('UpForge — Analysis still running…')
          showAppNotification({
            title: 'UpForge — Still analysing',
            body: 'Your match is still processing. We\'ll notify you when results are ready.',
            silent: notifySilent(),
          })
        }
      },
    })
    return result.job_id
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload failed'
    logActivity(`Upload failed: ${msg}`)
    tray?.setToolTip(idleTooltip(game))

    // Quota exceeded — send upgrade prompt (no retry makes sense here)
    const isUpgradeError = err instanceof UpgradeRequiredError
      || (err instanceof Error && err.name === 'UpgradeRequiredError')
      || (err instanceof Error && /analysis.limit.reached|upgrade.required/i.test(err.message))
    if (isUpgradeError) {
      const upgradeErr = err as UpgradeRequiredError
      send('post-game:upload-error', {
        message: msg,
        needsUpgrade: true,
        recordingId: recordingId ?? undefined,
        upgradeUrl: (upgradeErr.upgradeUrl) || 'https://upforge.gg/pricing',
        ppaUrl: (upgradeErr.ppaUrl) || 'https://upforge.gg/valorant/analyze',
      })
      return null
    }

    // Try to ensure the recording is saved to the pending store so the user can retry.
    // If this is the first attempt (no recordingId yet) and the file still exists, save now.
    let effectiveRecordingId = recordingId
    if (!recordingId && fs.existsSync(videoPath)) {
      try {
        const user = authManager.getUser()
        if (timeline) recomputeTimelineVideoOffsets(timeline)
        const saved = recordingsStore.add({
          path: videoPath,
          riotName: riotName || user?.riot_name || '',
          riotTag: riotTag || user?.riot_tag || '',
          game,
          map,
          agent,
          gameMode: riotLocalApi.getLastGameMode() ?? 'UNKNOWN',
          timeline
        })
        effectiveRecordingId = saved.id
        mainWindow?.webContents.send('recordings:updated')
        logActivity('Recording saved — can retry from the post-game window or dashboard')
      } catch {
        // Store save failed — fall through with no recordingId
      }
    }

    // Send the error with the recordingId (if we have one) so the renderer can offer retry.
    // The payload is either a plain string (legacy, for analysis polling errors) or an object.
    send('post-game:upload-error', effectiveRecordingId
      ? { message: msg, recordingId: effectiveRecordingId }
      : msg
    )
    return null
  }
}

function createSplashWindow(): BrowserWindow {
  return _createSplashWindow()
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('gg.upforge.desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // When a second instance is launched (e.g. user double-clicks the icon again),
  // bring the existing window to the front instead of opening another copy.
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    } else {
      // Window was destroyed (e.g. after a crash) — recreate it
      mainWindow = createMainWindow()
    }
  })

  uploadManager = new UploadManager(authManager)
  settingsManager = new SettingsManager()
  recordingsStore = new RecordingsStore()

  // Restore auth session from keychain before creating window
  try {
    await authManager.loadStoredToken()
  } catch (err) {
    log.warn('[App] Failed to restore auth token — starting unauthenticated:', err)
  }
  enforceRecordingPresetAccess()

  // When a 401 fires mid-session, tell the renderer to show the login screen
  authManager.onSessionExpired = () => {
    log.warn('[App] Session expired — notifying renderer')
    clearUserSession(userSessionDeps())
    mainWindow?.webContents.send('auth:session-expired')
  }

  // Resume polling for any job_id that was persisted before a crash.
  // We wait until the main window is ready before sending the result.
  if (authManager.isAuthenticated()) {
    syncUserSessionFromAuth()
  }
  const orphanedJob = readActivePendingJob()
  if (orphanedJob) {
    console.log('[App] Orphaned job found from previous session:', orphanedJob.job_id)
  }

  // Prune old clips on startup if retention is configured
  const retentionDays = settingsManager.get().clipRetentionDays
  if (retentionDays > 0) {
    const pruned = clipStore.pruneByAge(retentionDays)
    if (pruned > 0) log.info(`[App] Pruned ${pruned} clips older than ${retentionDays} days`)
  }
  clipStore.pruneOrphanedThumbnails()

  // Show splash launcher while we check for updates
  const splashWindow = createSplashWindow()

  createTray()

  // Called when updater confirms no update pending (or errors out).
  // Close splash and open the main window.
  const launchMainApp = () => {
    mainWindow = createMainWindow(authManager.isAuthenticated())
    markStartupComplete()
    setupGameDetection()
    scheduleObsProbeOnWindowLoad(mainWindow, true)
    // Small delay so main window is loaded before splash closes
    setTimeout(() => {
      if (!splashWindow.isDestroyed()) splashWindow.close()
    }, 400)

    // If an orphaned job was found at startup, reconcile once before resuming a 90-min poll loop.
    if (orphanedJob) {
      mainWindow.webContents.once('did-finish-load', () => {
        void handleOrphanedJobAtStartup(orphanedJob)
      })
    }
  }

  setupAutoUpdater(splashWindow, launchMainApp, () => { isQuitting = true })

  // ffmpeg is only used for post-match clip extraction — verify bundled binary early.
  clipFfmpegProbe.preflight().then((result) => {
    ffmpegOk = result.ok
    if (!result.ok) {
      console.error('[App] Clip ffmpeg preflight FAILED:', result.error)
      mainWindow?.webContents.send('app:ffmpeg-status', { ok: false })
    } else {
      console.log('[App] Clip ffmpeg preflight OK')
    }
  }).catch((err) => {
    console.error('[App] Clip ffmpeg preflight threw unexpectedly:', err)
    ffmpegOk = false
  })

  wireObsConnectionEvents()
  stopObsHealthMonitor = startObsHealthMonitor(obsRecorder, () => mainWindow, { logActivity })

  setupIpcHandlers(ipcMain, authManager, () => obsRecorder, gameDetector, settingsManager, () => {
    postGameWindow = createPostGameWindow()
    postGameWindow.webContents.once('did-finish-load', () => {
      postGameWindow?.webContents.send('post-game:upload-start', { game: 'valorant', map: 'Bind', agent: 'Jett' })
      setTimeout(() => postGameWindow?.webContents.send('post-game:upload-progress', 45), 800)
      setTimeout(() => postGameWindow?.webContents.send('post-game:upload-progress', 100), 1600)
      setTimeout(() => postGameWindow?.webContents.send('post-game:upload-complete', {}), 2000)
      setTimeout(() => postGameWindow?.webContents.send('post-game:analysis-ready', {
        overall_score: 72,
        analysis_id: 999,
        session_start: Date.now() - 60 * 60 * 1000,
        top_issue: 'Positioning during post-plant — you were caught in the open on 4 of 6 clutch attempts.',
        priority_improvements: [
          'Positioning during post-plant — caught in the open on 4 of 6 clutch attempts.',
          'Crosshair placement — pre-aiming head height on B site entries.',
          'Economy — force-buying after pistol loss reduced overall round win rate.'
        ]
      }), 5500)
    })
  }, () => ffmpegOk, () => waitingForMatch, () => activityLog.slice(), uploadManager, () => {
    // Show main window and navigate to clips tab
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('app:navigate', '/clips')
    }
  }, performanceManager, obsRecorder, trainerBridge,
  async (game: string) => {
    if (manualEndMatchRecording) return manualEndMatchRecording(game)
    if (!obsRecorder.isRecording()) return { ok: false, reason: 'not_recording' }
    try {
      await obsRecorder.stop()
      return { ok: true }
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) }
    }
  },
  getRecordingBackendForStatus,
  () => riotLocalApi.getLastGameMode(),
  undefined,
  () => obsRecorder.isConnected(),
  () => {
    discordRPC.refresh()
  },
  () => {
    syncUserSessionFromAuth()
  },
  () => {
    clearUserSession(userSessionDeps())
  },
  (jobId: string) => recordingsStore?.getPathByJobId(jobId) ?? null,
  )

  setupClipHandlers(ipcMain, clipStore, clipExtractor, authManager, hotkeyManager)

  // Discord Rich Presence — renderer can push state changes (e.g. when reviewing coaching)
  ipcMain.handle('discord:set-state', (_e, state: string) => {
    if (state === 'reviewing') discordRPC.setReviewing()
    else discordRPC.setIdle()
  })

  // Developer diagnostics — full internal state snapshot for the admin panel
  ipcMain.handle('dev:get-diagnostics', () => {
    return {
      app: {
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node,
        isDev: is.dev,
      },
      riot: riotLocalApi.getDiagnostics(),
      recording: {
        active: obsRecorder.isRecording(),
        duration: obsRecorder.getRecordingDuration(),
        lastError: obsRecorder.getLastError() ?? null,
        lastPath: obsRecorder.getLastRecordingPath() ?? null,
        lastSizeMb: obsRecorder.getLastRecordingSize() / (1024 * 1024),
        wasapiMode: obsRecorder.getAudioMode(),
      },
      lastMatch: lastMatchDiagnostic,
      clips: {
        total: clipStore.getAll().length,
      },
      activityLog: activityLog.slice(),
    }
  })


  // recorder:audio-status and recorder:fix-audio are registered in ipc/media-ipc.ts


  ipcMain.handle('clips:save-bookmark', () => {
    if (obsRecorder.isRecording() && currentRecordingStartTime !== null) {
      hotkeyBookmarks.push(Date.now())
      logActivity('Clip moment bookmarked (overlay button)')
      log.info('[Overlay] Clip bookmarked via button, total:', hotkeyBookmarks.length)
      const elapsedSec = Math.round((Date.now() - currentRecordingStartTime) / 1000)
      sendOverlayData('overlay:clip-bookmarked', { bookmarkCount: hotkeyBookmarks.length, elapsedSec })
      return { ok: true, bookmarkCount: hotkeyBookmarks.length }
    }
    return { ok: false, reason: 'not-recording' }
  })

  // Presence heartbeat — update squad presence every 60s when authenticated
  const presenceInterval = setInterval(() => {
    if (!authManager.isAuthenticated()) return
    authManager.sendPresence(obsRecorder.isRecording(), gameDetector.currentGame())
      .catch(() => { /* ignore */ })
  }, 60000)

  app.on('before-quit', () => clearInterval(presenceInterval))

  // Register global hotkeys
  hotkeyManager.on('save-clip', () => {
    if (obsRecorder.isRecording() && currentRecordingStartTime !== null) {
      hotkeyBookmarks.push(Date.now())
      logActivity('Clip moment bookmarked (F9)')
      log.info('[Hotkey] F9 clip bookmarked, total bookmarks:', hotkeyBookmarks.length)
      const elapsedSec = Math.round((Date.now() - currentRecordingStartTime) / 1000)
      const timeLabel = elapsedSec < 60
        ? `${elapsedSec}s into match`
        : `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s into match`
      deliverInGameFeedback(inGameFeedbackDeps(), {
        kind: 'clip-saved',
        title: 'Clip moment saved',
        body: `#${hotkeyBookmarks.length} marked · ${timeLabel}`,
        overlayChannel: 'overlay:clip-bookmarked',
        overlayData: { bookmarkCount: hotkeyBookmarks.length, elapsedSec },
        beep: 'success',
      })
    } else {
      log.warn('[Hotkey] F9 pressed but recorder is not active (recording=%s, startTime=%s)',
        obsRecorder.isRecording(), currentRecordingStartTime)
      const currentGame = gameDetector.currentGame()
      const gameLbl = currentGame ? gameLabel(currentGame) : 'a'
      logActivity(`F9 pressed — not recording (start a ${gameLbl} match first)`)
      deliverInGameFeedback(inGameFeedbackDeps(), {
        kind: 'not-recording',
        title: 'Not recording',
        body: `Start a ${gameLbl} match first — F9 saves clip moments during recording`,
        overlayChannel: 'overlay:clip-not-recording',
        beep: 'warning',
      })
    }
  })
  hotkeyManager.on('take-screenshot', () => {
    void (async () => {
      log.info('[Hotkey] F8 screenshot requested')
      const result = await captureAndSaveScreenshot()
      if (result.ok) {
        logActivity('Screenshot saved (F8)')
        deliverInGameFeedback(inGameFeedbackDeps(), {
          kind: 'screenshot',
          title: 'Screenshot saved',
          body: result.filename ?? 'Saved to your UpForge screenshots folder',
          overlayChannel: 'overlay:screenshot-saved',
          overlayData: { filename: result.filename },
          beep: 'success',
        })
      } else {
        logActivity('Screenshot failed (F8)')
        deliverInGameFeedback(inGameFeedbackDeps(), {
          kind: 'screenshot',
          title: 'Screenshot failed',
          body: 'Could not capture your screen — try again',
          beep: 'warning',
          flashOverlayMs: 0,
        })
      }
    })()
  })
  hotkeyManager.on('toggle-overlay', () => {
    // If the auto-hide timer is running (from an F9 flash), cancel it — user is taking manual control
    if (overlayAutoHideTimer) { clearTimeout(overlayAutoHideTimer); overlayAutoHideTimer = null }
    toggleOverlay()
    // When overlay becomes visible, push current recording state immediately
    // so the user sees the correct status without waiting for the next poll cycle
    if (isOverlayVisible()) {
      sendOverlayData('overlay:data', {
        round: null,
        allyScore: null,
        enemyScore: null,
        yourCredits: null,
        enemyEstimate: null,
        recording: obsRecorder.isRecording(),
      })
    }
  })
  const hotkeyResults = hotkeyManager.registerAll()
  if (!hotkeyResults['save-clip']) {
    log.error('[Main] F9 (save-clip) hotkey failed to register — clips cannot be bookmarked via keyboard')
    logActivity('WARNING: F9 hotkey failed to register (may be in use by another app)')
    reportError({ message: 'F9 (save-clip) hotkey failed to register — users cannot bookmark clips via keyboard', component: 'desktop:HotkeyManager' })
  }
  // Send hotkey registration status to any open window so the UI can show a warning
  const hotkeyStatus = {
    saveClipRegistered: !!hotkeyResults['save-clip'],
    toggleOverlayRegistered: !!hotkeyResults['toggle-overlay'],
    screenshotRegistered: !!hotkeyResults['take-screenshot'],
  }
  mainWindow?.webContents.send('app:hotkey-status', hotkeyStatus)

  // Overlay window is created lazily just before recording starts to avoid
  // breaking Valorant's exclusive fullscreen mode (which causes FPS drops).

  // Debug: test Riot Live Client API connection — returns raw response or error details
  ipcMain.handle('debug:test-riot-api', async () => {
    const net = await import('net')
    // TCP check on port 2999 (deprecated Live Client API — expected closed in 2026)
    const portOpen = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket()
      socket.setTimeout(2000)
      socket.on('connect', () => { socket.destroy(); resolve(true) })
      socket.on('error', () => resolve(false))
      socket.on('timeout', () => { socket.destroy(); resolve(false) })
      socket.connect(2999, '127.0.0.1')
    })
    const gameMode = await riotLocalApi.getGameMode()
    const logGameMode = await riotLocalApi.getGameModeFromLog()
    const processRunning = await gameDetector.isMatchProcessRunning()
    return { portOpen, gameMode, logGameMode, processRunning }
  })


  ipcMain.handle('recordings:get', () => {
    scanForOrphanedRecordings()
    return recordingsStore.getPending(linkedRiotFromAuth())
  })

  ipcMain.handle('recordings:analyse', async (_e, { id }: { id: string }) => {
    const recording = recordingsStore.getById(id)
    if (!recording) return { error: 'Recording not found' }

    const user = authManager.getUser()

    const triggerAnalysis = async (win: BrowserWindow) => {
      await doUploadAndAnalyse(
        recording.id,
        recording.path,
        recording.riotName || user?.riot_name || '',
        recording.riotTag || user?.riot_tag || '',
        recording.game,
        recording.map,
        recording.agent,
        recording.timeline,
        win
      )
    }

    if (!postGameWindow || postGameWindow.isDestroyed()) {
      postGameWindow = createPostGameWindow()
      whenWebContentsReady(postGameWindow, () => void triggerAnalysis(postGameWindow!))
    } else {
      postGameWindow.show()
      postGameWindow.focus()
      void triggerAnalysis(postGameWindow)
    }

    return { ok: true }
  })

  let bulkPendingUploadRunning = false

  ipcMain.handle('storage:get-breakdown', () => {
    return getStorageBreakdown(recordingsStore, linkedRiotFromAuth())
  })

  ipcMain.handle('storage:purge-cloud-backed', async () => {
    const result = await purgeCloudBackedLocals(
      recordingsStore,
      authManager,
      linkedRiotFromAuth(),
      (filePath) => obsRecorder.deleteRecording(filePath),
    )
    mainWindow?.webContents.send('recordings:updated')
    mainWindow?.webContents.send('dashboard:refresh')
    return result
  })

  ipcMain.handle('storage:upload-pending', async () => {
    if (bulkPendingUploadRunning) {
      return { ok: false as const, error: 'Upload already in progress' }
    }
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false as const, error: 'App window unavailable' }
    }

    const pending = recordingsStore.getPending(linkedRiotFromAuth())
    if (pending.length === 0) {
      return { ok: true as const, uploaded: 0, failed: 0, stoppedEarly: false }
    }

    bulkPendingUploadRunning = true
    const user = authManager.getUser()
    let uploaded = 0
    let failed = 0
    let stoppedEarly = false
    let stopReason: string | undefined

    try {
      for (let i = 0; i < pending.length; i++) {
        const rec = pending[i]!
        mainWindow.webContents.send('storage:upload-progress', {
          current: i + 1,
          total: pending.length,
          map: rec.map,
          agent: rec.agent,
        })
        logActivity(`Uploading pending recording ${i + 1}/${pending.length}${rec.map ? ` (${rec.map})` : ''}…`)

        try {
          const jobId = await doUploadAndAnalyse(
            rec.id,
            rec.path,
            rec.riotName || user?.riot_name || '',
            rec.riotTag || user?.riot_tag || '',
            rec.game,
            rec.map,
            rec.agent,
            rec.timeline,
            mainWindow,
            0,
            false,
            true,
          )
          if (jobId) {
            uploaded++
          } else {
            failed++
          }
        } catch (err) {
          const isUpgrade = err instanceof UpgradeRequiredError
            || (err instanceof Error && /analysis.limit.reached|upgrade.required/i.test(err.message))
          if (isUpgrade) {
            stoppedEarly = true
            stopReason = err instanceof Error ? err.message : 'Analysis limit reached'
            break
          }
          failed++
          log.warn('[StorageUpload] Pending upload failed:', err)
        }
      }
    } finally {
      bulkPendingUploadRunning = false
      mainWindow?.webContents.send('storage:upload-progress', null)
      mainWindow?.webContents.send('recordings:updated')
      mainWindow?.webContents.send('dashboard:refresh')
    }

    if (uploaded > 0) {
      logActivity(`Uploaded ${uploaded} recording(s) to cloud — local copies removed`)
    }

    return { ok: true as const, uploaded, failed, stoppedEarly, stopReason }
  })

  ipcMain.handle('recordings:dismiss', (_e, { id }: { id: string }) => {
    recordingsStore.remove(id)
    mainWindow?.webContents.send('recordings:updated')
  })

  ipcMain.handle('app:open-vod-review', (_e, { id, seekMs }: { id: string; seekMs?: number }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
      const query: Record<string, string> = { id }
      if (seekMs != null && !isNaN(seekMs)) query.seekMs = String(Math.round(seekMs))
      mainWindow.webContents.send('app:navigate', { path: '/vod-review', query })
    }
    return { ok: true }
  })

  ipcMain.handle('recordings:nudge-sync', (_e, { id, deltaMs }: { id: string; deltaMs: number }) => {
    const recording = recordingsStore.getById(id)
    if (!recording?.timeline) return { ok: false as const }
    nudgeTimelineSyncOffset(recording.timeline, deltaMs)
    recordingsStore.updateTimeline(id, recording.timeline)
    return {
      ok: true as const,
      videoSyncOffsetMs: recording.timeline.videoSyncOffsetMs ?? 0,
    }
  })

  ipcMain.handle('recordings:reset-sync', (_e, { id }: { id: string }) => {
    const recording = recordingsStore.getById(id)
    if (!recording?.timeline) return { ok: false as const }
    recording.timeline.videoSyncOffsetMs = DEFAULT_VIDEO_SYNC_OFFSET_MS
    recomputeTimelineVideoOffsets(recording.timeline)
    applySpatialEnrichment(recording.timeline)
    recordingsStore.updateTimeline(id, recording.timeline)
    return { ok: true as const, videoSyncOffsetMs: DEFAULT_VIDEO_SYNC_OFFSET_MS }
  })

  ipcMain.handle('recordings:get-timeline', async (_e, { id }: { id: string }) => {
    const recording = recordingsStore.getById(id)
    if (!recording) return null
    const tl = recording.timeline
    if (tl) {
      recomputeTimelineVideoOffsets(tl)
      applySpatialEnrichment(tl)
      recordingsStore.updateTimeline(id, tl)
    }
    let videoPath = recording.path && fs.existsSync(recording.path) ? recording.path : null
    if (!videoPath && recording.analysisId != null) {
      videoPath = await fetchRecordingPlaybackUrl(authManager, recording.analysisId)
    }
    return {
      id: recording.id,
      analysisId: recording.analysisId ?? null,
      videoPath,
      map: recording.map,
      agent: recording.agent,
      game: recording.game,
      gameMode: recording.gameMode,
      recordedAt: recording.recordedAt,
      kills: tl?.playerKills ?? [],
      deaths: tl?.playerDeaths ?? [],
      roundSummaries: tl?.roundSummaries ?? [],
      finalStats: tl?.finalStats ?? null,
      teamSnapshot: tl?.teamSnapshot ?? [],
      spikePlants: tl?.spikePlants ?? [],
      spikeDefuses: tl?.spikeDefuses ?? [],
      spikeDetonations: tl?.spikeDetonations ?? [],
      firstBloods: tl?.firstBloods ?? [],
      spatialSummary: tl?.spatialSummary ?? null,
      videoSyncOffsetMs: tl?.videoSyncOffsetMs ?? 0,
    }
  })

  // Register global shortcut to show/focus window
  globalShortcut.register('CommandOrControl+Shift+U', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
})

// Re-show window when clicking dock icon on Mac
app.on('activate', () => {
  if (!mainWindow) {
    mainWindow = createMainWindow()
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
})

app.on('window-all-closed', () => {
  // Don't quit when all windows close — keep running in tray
})

// Prevent the network-service utility process crash from killing the whole app
app.on('child-process-gone', (_event, details) => {
  log.warn('[Main] Child process gone:', details.type, details.reason)
})

app.on('before-quit', () => {
  isQuitting = true
  stopObsHealthMonitor?.()
  if (trayRefreshInterval) clearInterval(trayRefreshInterval)
  tray?.destroy()
  tray = null
  cancelAllPollingTimers()
  gameDetector.stop()
  obsRecorder.forceStop()
  hotkeyManager.unregisterAll()
  globalShortcut.unregisterAll()
  destroyOverlay()
  discordRPC.destroy()
})
