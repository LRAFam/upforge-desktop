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
import { showAppNotification, setMatchRecordingGuard } from './app-notifications'
import {
  startCoachNotificationPoller,
  stopCoachNotificationPoller,
} from './coach-notification-poller'
import { setupAutoUpdater, markStartupComplete } from './updater'
import { pingDesktopOnboarding, resetDesktopOnboardingPing } from './onboarding-ping'
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
  deleteLocalRecordingFiles,
} from './vod-compressor'
import {
  applyVodTrimToTimeline,
  swapMediaFileInPlace,
  trimmedOutputPath,
} from './vod-trimmer'
import {
  waitUntilBackgroundWorkAllowed,
  abortVodCompression,
  registerDeferredUploadRetry,
  clearDeferredUploadRetry,
  flushDeferredUploadRetries,
  shouldDeferHeavyBackgroundWork,
} from './match-priority-guard'
import {
  resolveReadyRecordingPath,
  listUnregisteredRecordingFiles,
} from './recording-path-resolver'
import { broadcastObsConnection, probeObsConnection, startObsHealthMonitor } from './obs-health'
import { launchObsStudio, obsLaunchDelayMs, type LaunchObsOptions } from './obs-launcher'
import {
  ensureObsProfileInstalled,
  resolveObsWebSocketPassword,
  UPFORGE_OBS_DEFAULT_PASSWORD,
} from './obs-profile-installer'
import {
  RiotLocalApi,
  recomputeTimelineVideoOffsets,
  nudgeTimelineSyncOffset,
  effectiveVideoSyncOffsetMs,
  defaultVideoSyncOffsetMs,
} from './riot-local-api'
import { applySpatialEnrichment } from './spatial/enrich'
import { refreshMatchPopulationBenchmarks } from './spatial/enrich-population'
import { applyDemoSpatialEnrichment } from './spatial/demo-enrich'
import { UploadManager, savePendingJob, clearPendingJob } from './upload-manager'
import { resolveUploadPlayerIdentity } from './upload-player-identity'
import {
  activateUserSession,
  clearUserSession,
  readActivePendingJob,
  clearActivePendingJob,
  getActiveUserId,
} from './user-session'
import { resolveRecordingSavePath } from './user-data-paths'
import { extractAnalysisIdFromPollResult } from './analysis-completion'
import { startAnalysisPoll, stopActiveAnalysisPoll, reconcileOrphanedJob, getActiveAnalysisPollJobId, type AnalysisPollStatus } from './analysis-poll'
import { abortInFlightAnalysis } from './abort-in-flight-analysis'
import { buildAnalysisPipelineDiagnostics } from './analysis-pipeline-diagnostics'
import { reconcileStuckAnalysisJobs, type ReconciledAnalysisContext } from './stuck-analysis-reconciler'
import { buildAnalysisErrorPayload, formatAnalysisFailureMessage, type AnalysisErrorPayload } from './analysis-failure-messages'
import { parseDuelFailureDiagnostics, diagnosticsSummary, type DuelFailureDiagnostics } from '../../src/lib/duel-diagnostics'
import { AuthManager } from './auth-manager'
import { SettingsManager } from './settings-manager'
import { setupIpcHandlers, setupClipHandlers, cancelAllPollingTimers } from './ipc-handlers'
import {
  initFunnelEvents,
  trackAppOpened,
  trackLogin,
  trackFirstRecording,
  trackObsConnected,
  trackFirstAnalysis,
  trackSecondAnalysis,
} from './funnel-events'
import {
  formatRecordingFailure,
  formatCorruptRecordingMessage,
  type RecordingBackend,
} from './capture-backend'
import { reportRecordingError } from './recording-errors'
import { UpgradeRequiredError } from './errors'
import { mergeSkillProfileFromAnalysis } from '../../src/lib/skill-profile'
import { parseMatchHighlightsFromApi } from '../../src/lib/match-highlights'
import { extractSpatialFromAnalysisPayload } from '../../src/lib/analysis-enrichment'
import { RecordingsStore, type ClipOnlyReason } from './recordings-store'
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
import { reportPipelineError } from './pipeline-errors'
import {
  fetchArchivePlaybackUrl,
  fetchJobPlaybackUrl,
  fetchRecordingPlaybackUrl,
  resolveLocalRecordingFile,
} from './recording-playback'
import {
  CRITICAL_FREE_DISK_BYTES,
  LOW_FREE_DISK_BYTES,
  formatFreeDiskLabel,
  getFreeDiskSpace,
} from './disk-space'
import { getStorageBreakdown, purgeCloudBackedLocals, runRecordingStorageMaintenance, buildStorageUsage, purgeUntrackedRecordingFiles, isLocalOnlyRecording } from './storage-cleanup'
import { buildStorageEstimate } from './storage-stats'
import { buildTimelineFromReplay, tryAutoUploadSourceReplay, uploadReplayInBackground } from './post-match-replay'
import { DiscordRPC } from './discord-rpc'
import {
  createMainWindow as _createMainWindow,
  createPostGameWindow as _createPostGameWindow,
  createSplashWindow as _createSplashWindow,
  createTray as _createTray,
  whenWebContentsReady,
} from './window-manager'
import { ClipPipeline } from './clip-pipeline'
import { duelMomentsForUpload } from './moment-picker'
import { buildAndUploadScoutMoments } from './scout-moments'
import { extractAndUploadDuelClips, extractDuelPreviewClip, countMomentsWithClipKeys } from './duel-clip-uploader'
import { requestPregameBrief as _requestPregameBrief, requestPostGameDebrief as _requestPostGameDebrief } from './post-game-api'
import { enrichTimelineForCoaching } from './match-coaching-enrich'
import {
  getAnalysisReadiness,
  isTerminalAnalysisReadinessState,
  refreshVodProbe,
  clearVodProbeCache,
  waitUntilVodFileReady,
  withAnalysisReadiness,
  type AnalysisReadiness,
} from './analysis-readiness'
import {
  clearPostGameSession,
  getPostGameSessionSnapshot,
  resetPostGameSession,
  sendPostGameEvent,
} from './post-game-session'
import { hasRichMatchData, MATCH_DETAILS_ENRICH_MAX_MS } from './match-data-quality'
import {
  buildCoachingSubmissionExtras,
  topSkillFocus,
  type CoachingSubmissionExtras,
} from './match-coaching-context'
import { resolveInstanceLock, startInstanceCoordinator } from './instance-coordinator'
import {
  startSteamGsiServer,
  resetSteamGsiSession,
  installSteamGsiConfig,
  isGsiMatchLive,
  isGsiMatchEnded,
  isGsiReceiving,
  getLatestGsiMap,
} from './steam-gsi-server'
import {
  startDeadlockLogWatcher,
  stopDeadlockLogWatcher,
  resetDeadlockLogSession,
  isDeadlockReadyToRecord,
  isDeadlockMatchEnded,
  isDeadlockDetectionActive,
  getDeadlockMap,
  getDeadlockHero,
  getDeadlockLobbyMatchId,
  getDeadlockMatchStartedAt,
  getDeadlockDetectionStatus,
  buildDeadlockTimelineFromLogSession,
} from './deadlock-log-watcher'
import { ensureDeadlockSteamLaunchOptions } from './deadlock-steam-setup'

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

// Single-instance lock is resolved in bootstrap() before the app starts.
let stopInstanceCoordinator: (() => void) | null = null

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let postGameWindow: BrowserWindow | null = null
let isQuitting = false
/** False until setupIpcHandlers runs — windows must not load before IPC is wired. */
let ipcHandlersReady = false
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
      obsPreserveActiveScene: s?.obsPreserveActiveScene ?? true,
    }
  },
  () => {
    const s = settingsManager?.get()
    return s ? buildRecorderConfig(s, hasProAccess(authManager.getUser()), getActiveUserId()) : undefined
  },
  () => settingsManager?.get()?.primaryGame ?? 'valorant',
)

let stopObsHealthMonitor: (() => void) | null = null
let obsWasConnected = false
let lastObsDisconnectNotifyAt = 0
let lastObsPreQueueNotifyAt = 0
const OBS_DISCONNECT_NOTIFY_COOLDOWN_MS = 10 * 60 * 1000
const OBS_PREQUEUE_NOTIFY_COOLDOWN_MS = 20 * 60 * 1000

function maybeNotifyObsNotReadyBeforeQueue(): void {
  if (obsRecorder.isConnected()) return
  const now = Date.now()
  if (now - lastObsPreQueueNotifyAt < OBS_PREQUEUE_NOTIFY_COOLDOWN_MS) return
  lastObsPreQueueNotifyAt = now
  const body = 'OBS is not connected — matches will not record. Use Launch OBS in the dashboard or Settings → Recording before you queue.'
  logActivity('OBS not connected — connect before your next match')
  showAppNotification({
    title: 'UpForge — OBS not ready',
    body,
    silent: notifySilent(),
  })
  mainWindow?.webContents.send('app:warning', {
    message: body,
    actionLabel: 'Connect OBS',
    actionRoute: '/settings?tab=recording',
  })
}

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
    const newlyConnected = connected && !obsWasConnected
    const lostConnection = obsWasConnected && !connected
    obsWasConnected = connected
    if (newlyConnected) trackObsConnected()
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
    }).then(() => {
      if (!settingsManager) return
      const game = normalizePrimaryGame(settingsManager.get().primaryGame)
      void ensureObsCaptureForGame(game)
    })
  })
}

const OBS_SETUP_HINT =
  'OBS is not connected. Enable WebSocket in OBS (Tools → WebSocket Server Settings), copy the password from Show Connect Info, then Connect in UpForge Settings → Recording.'

async function ensureObsReady(): Promise<void> {
  if (obsRecorder.isConnected()) return

  const settings = settingsManager?.get()
  const port = settings?.obsPort ?? 4455
  let password = resolveObsWebSocketPassword(settings?.obsPassword)
  if (!settings?.obsPassword?.trim()) {
    ensureObsProfileInstalled(password, port)
    settingsManager?.save({ obsPassword: UPFORGE_OBS_DEFAULT_PASSWORD })
    password = UPFORGE_OBS_DEFAULT_PASSWORD
  } else {
    ensureObsProfileInstalled(password, port)
  }

  let result = await obsRecorder.connect()
  if (result.ok) return

  const launchOpts: LaunchObsOptions = { password, port }
  const launched = await launchObsStudio(launchOpts)
  if (launched.ok) {
    await new Promise((r) => setTimeout(r, obsLaunchDelayMs()))
    result = await obsRecorder.connect()
    if (result.ok) {
      broadcastObsConnection(mainWindow, obsRecorder)
      logActivity('OBS launched and connected — recording ready')
      return
    }
  }

  throw new Error(`${OBS_SETUP_HINT}${result.error ? ` (${result.error})` : ''}`)
}

/** Set by setupGameDetection — handles unexpected mid-match capture loss. */
let onRecordingLost: ((error: string) => void) | null = null

function discordMatchContext(): { map: string | null; agent: string | null } {
  const game = gameDetector.currentGame()
  if (game === 'valorant') return riotLocalApi.getLiveMatchContext()
  return { map: null, agent: null }
}

function focusMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    return
  }
  if (!ipcHandlersReady) return
  mainWindow = createMainWindow(authManager?.isAuthenticated() ?? false)
}

function wireRecorderStatus(rec: OBSRecorder, label: string): void {
  rec.onStatusChange = (recording, error) => {
    if (isQuitting) return
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('recording:status-changed', { recording, error: error ?? null })
    }
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
      try {
        if (tray && !tray.isDestroyed()) tray.setToolTip('UpForge — Recording stopped!')
      } catch { /* ignore */ }
      showAppNotification({
        title: 'UpForge — Recording Stopped',
        body: 'Recording stopped unexpectedly. Open UpForge to see details.',
        silent: notifySilent(),
        allowDuringRecording: true,
      })
      setTimeout(() => {
        try {
          if (!isQuitting && tray && !tray.isDestroyed()) tray.setToolTip(idleTooltip())
        } catch { /* ignore */ }
      }, 10_000)
    }
  }
}
const clipExtractor = new ClipExtractor()
const clipStore = new ClipStore()
const hotkeyManager = new HotkeyManager()
const trainerBridge = new TrainerBridge(() => mainWindow)
let settingsManager: SettingsManager
let trackedPrimaryGame: ReturnType<typeof normalizePrimaryGame> = 'valorant'
const discordRPC = new DiscordRPC(
  () => settingsManager?.get()?.discordRichPresence !== false,
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
  const live = riotLocalApi.getLiveMatchContext()
  const rec = clipStore.add({
    path: clipPath,
    thumbPath: null,
    trigger: 'kill',
    map: live.map,
    agent: live.agent,
    durationSeconds: settingsManager?.get().obsReplayBufferSeconds ?? 30,
    round: null,
    killCount: 1,
    analysisJobId: null,
    matchId: live.matchId,
    gameMode: live.gameMode,
    weapon: null,
    abilitySlot: null,
    game: normalizePrimaryGame(gameDetector.currentGame() ?? trackedPrimaryGame),
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

/** Cancel lobby/match-wait loops — e.g. when the user starts a dashboard action instead. */
function dismissMatchWaitUi(): void {
  cancelMatchWait?.()
  cancelMatchWait = null
  if (!waitingForMatch) return
  waitingForMatch = false
  mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })
}
// Prevents double-handling when onMatchEnded + game-stopped both fire for same match
let matchHandled = false
/** When Deadlock process was detected — used to locate replays after quit without recording. */
let deadlockSessionStartAt: number | null = null
/** Bumped on each game-started so superseded lobby-wait loops exit cleanly. */
let matchFlowGeneration = 0
/** Serializes handleMatchEnd — prevents double upload/post-game from concurrent end signals. */
let matchFinalizeInFlight: Promise<boolean> | null = null
// Overlay polling timer — cleared when match ends or game stops
let overlayPollTimer: ReturnType<typeof setInterval> | null = null
/** Cached Shipping.exe status — tasklist is expensive; check every 5s not every overlay tick. */
let cachedShippingProcessUp = true
let lastShippingProcessCheckAt = 0
const SHIPPING_PROCESS_CHECK_MS = 5_000
let gsiPollTimer: ReturnType<typeof setInterval> | null = null

let lastReplayRetryContext: {
  game: 'cs2' | 'deadlock'
  matchSessionStart: number
  customReplayDir?: string
  meta?: import('./post-match-replay').ReplayUploadMeta
} | null = null

/** Recording ids with an active S3 upload in this process — excludes them from stale-upload reset. */
const activeUploadRecordingIds = new Set<string>()

function reconcileInterruptedUploads(): void {
  if (!recordingsStore) return
  const reset = recordingsStore.resetInterruptedUploads(activeUploadRecordingIds)
  if (reset > 0) {
    logActivity(`Upload interrupted — tap Analyse to retry (${reset} recording${reset === 1 ? '' : 's'})`)
    mainWindow?.webContents.send('recordings:updated')
  }
}

function matchPriorityDeps() {
  return {
    isRecording: () => obsRecorder.isRecording(),
  }
}

function interruptBackgroundWorkForMatch(): void {
  if (!shouldDeferHeavyBackgroundWork(matchPriorityDeps())) return
  if (abortVodCompression()) {
    log.info('[MatchPriority] Aborted in-flight VOD compression — OBS recording active')
  }
}

function maybeResumeDeferredUploads(): void {
  if (!shouldDeferHeavyBackgroundWork(matchPriorityDeps())) {
    void flushDeferredUploadRetries()
  }
}

function wasBackgroundWorkInterrupted(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /upload aborted|compression cancelled — match/i.test(msg)
}

// Activity log — recent events shown on dashboard for user visibility
const MAX_LOG_ENTRIES = 30
const activityLog: { time: number; message: string }[] = []

// Hotkey bookmarks — timestamps (ms) relative to recording start pressed during a match
const hotkeyBookmarks: number[] = []
// Recording start time — set when recorder.start() succeeds
let currentRecordingStartTime: number | null = null
/** GSI match-live timestamp (CS2 / Deadlock) — when map_phase went live */
let currentMatchStartTime: number | null = null
let currentGsiMapName: string | null = null
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

const FAILURE_NOTIFY_COOLDOWN_MS = 5 * 60 * 1000
const recentFailureNotifications = new Map<string, number>()

let lastActivityToast = { message: '', at: 0 }

function abortInFlightAnalysisForRecording(recordingId: string): { ok: boolean; error?: string } {
  const result = abortInFlightAnalysis(
    { recordingsStore, uploadManager, activeUploadRecordingIds },
    recordingId,
  )
  if (result.ok) {
    mainWindow?.webContents.send('recordings:updated')
    postGameWindow?.webContents.send('post-game:analysis-deferred', { reason: 'cancelled' })
    const rec = recordingsStore.getById(recordingId)
    tray?.setToolTip(idleTooltip(rec?.game ?? 'valorant'))
    logActivity('Stopped waiting on upload/analysis — you can record again')
  }
  return result
}

function logActivity(message: string): void {
  const entry = { time: Date.now(), message }
  activityLog.push(entry)
  if (activityLog.length > MAX_LOG_ENTRIES) activityLog.shift()
  mainWindow?.webContents.send('app:activity-log', activityLog.slice())
  const lower = message.toLowerCase()
  if (
    lower.includes('analysis ready')
    || lower.includes('analysis failed')
    || lower.includes('upload paused')
    || lower.includes('upload continues')
    || lower.includes('saved to cloud')
    || lower.includes('coaching ready')
  ) {
    const now = Date.now()
    if (message !== lastActivityToast.message || now - lastActivityToast.at > FAILURE_NOTIFY_COOLDOWN_MS) {
      lastActivityToast = { message, at: now }
      mainWindow?.webContents.send('app:activity-toast', { message })
    }
  }
}

/** Dashboard banner + optional OS notification for recording outcomes. */
function notifyRecordingUx(message: string, notificationTitle = 'UpForge — Recording'): void {
  mainWindow?.webContents.send('app:warning', { message })
  showAppNotification({
    title: notificationTitle,
    body: message,
    silent: notifySilent(),
    allowDuringRecording: true,
  })
}

function maybeDeleteLocalRecordingAfterAnalysis(
  recordingPath: string,
  opts: { deleteLocalAfterUpload?: boolean; skipAutoDelete?: boolean },
): void {
  if (opts.deleteLocalAfterUpload) {
    const freed = deleteLocalRecordingFiles(recordingPath)
    if (freed > 0) logActivity('Local recording removed after cloud save')
    return
  }
  if (opts.skipAutoDelete) return
  if (!settingsManager?.get().autoDelete) return
  log.info('[App] Auto-deleting local recording after successful analysis:', recordingPath)
  const freed = deleteLocalRecordingFiles(recordingPath)
  if (freed > 0) logActivity('Local recording removed — VOD available in cloud')
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

function enrichTimelineSpatial(timeline: MatchData): void {
  if (timeline.game === 'valorant') {
    applySpatialEnrichment(timeline)
    const moments = duelMomentsForUpload(timeline)
    if (moments.length) timeline.duelMoments = moments
    schedulePopulationRefresh(timeline)
  } else if (timeline.game === 'cs2' || timeline.game === 'deadlock') {
    applyDemoSpatialEnrichment(timeline)
  }
}

function schedulePopulationRefresh(timeline: MatchData): void {
  if (!timeline.spatialSummary?.events?.length) return
  const token = authManager.getToken()
  void refreshMatchPopulationBenchmarks(
    timeline,
    token ? authManager.getApi() : null,
    (summary) => {
      mainWindow?.webContents.send('spatial:population-updated', summary)
      postGameWindow?.webContents.send('spatial:population-updated', summary)
    },
  )
}

function mergeSpatialSummary(
  apiSpatial: unknown,
  localSpatial: import('./spatial/types').MatchSpatialSummary | null | undefined,
): import('./spatial/types').MatchSpatialSummary | null {
  const api = apiSpatial as import('./spatial/types').MatchSpatialSummary | null | undefined
  if (api?.events?.length) return api
  if (localSpatial?.events?.length) return localSpatial
  return api ?? localSpatial ?? null
}

function normalizePrimaryGame(value: string | null | undefined): 'valorant' | 'cs2' | 'deadlock' {
  if (value === 'cs2' || value === 'deadlock' || value === 'valorant') return value
  return 'valorant'
}

function syncPrimaryGameFromUser(): void {
  const user = authManager.getUser()
  const apiGame = user?.primary_game
  if (!apiGame || !settingsManager) return
  const game = normalizePrimaryGame(apiGame)
  const current = settingsManager.get()
  settingsManager.save({
    primaryGame: game,
    trainerMouse: { ...current.trainerMouse, game },
  })
  mainWindow?.webContents.send('settings:changed', settingsManager.get())
  handlePrimaryGameSwitch(game, current.primaryGame)
  trackedPrimaryGame = game
}

function syncPrimaryGameFromDetection(game: string): void {
  if (!settingsManager) return
  const detected = normalizePrimaryGame(game)
  const primary = normalizePrimaryGame(settingsManager.get().primaryGame)
  if (detected === primary) return

  const current = settingsManager.get()
  settingsManager.save({
    primaryGame: detected,
    trainerMouse: { ...current.trainerMouse, game: detected },
  })
  mainWindow?.webContents.send('settings:changed', settingsManager.get())
  handlePrimaryGameSwitch(detected, primary)
  trackedPrimaryGame = detected
}

function handlePrimaryGameSwitch(
  game: ReturnType<typeof normalizePrimaryGame>,
  previousGame?: ReturnType<typeof normalizePrimaryGame>,
): void {
  if (previousGame === game) return

  const deferActiveStop = obsRecorder.isRecording()
  gameDetector.setWatchGame(game, { deferActiveStop })
  logActivity(`Switched to ${gameLabel(game)}`)

  void ensureObsCaptureForGame(game)

  if (game === 'deadlock') {
    void ensureDeadlockSteamLaunchOptions()
    startDeadlockLogWatcher()
  } else {
    stopDeadlockLogWatcher()
  }

  updateTrayMenuFn?.()
}

async function ensureObsCaptureForGame(game: string): Promise<void> {
  if (obsRecorder.isRecording()) return

  if (!obsRecorder.isConnected()) {
    await probeObsConnection(obsRecorder, mainWindow, { notify: false, logActivity, quiet: true })
  }
  if (!obsRecorder.isConnected()) return

  const needsLiveWindow = game === 'cs2' || game === 'deadlock'
  const processRunning =
    gameDetector.currentGame() === game || await gameDetector.isGameProcessRunning(game)

  const result = await obsRecorder.retargetCaptureWithRetry(game, {
    maxAttempts: processRunning ? 12 : needsLiveWindow ? 6 : 1,
    intervalMs: 2000,
  })

  if (result.ok && (result.liveWindow || !processRunning)) {
    if (processRunning) {
      logActivity(`OBS capture ready for ${gameLabel(game)}`)
    } else if (needsLiveWindow) {
      logActivity(`OBS will capture ${gameLabel(game)} when the game opens`)
    } else {
      logActivity(`OBS capture retargeted to ${gameLabel(game)}`)
    }
    return
  }

  if (needsLiveWindow && processRunning) {
    logActivity(`${gameLabel(game)} window not found — use borderless windowed mode for OBS`)
    mainWindow?.webContents.send('app:warning', {
      message: `${gameLabel(game)} uses OBS Window Capture. Run the game in borderless windowed mode, then reconnect OBS in Settings → Recording if capture stays black.`,
      actionLabel: 'Recording settings',
      actionRoute: '/settings?tab=recording',
    })
  }
}

function onSettingsSaved(settings: ReturnType<SettingsManager['get']>): void {
  discordRPC.refresh()
  const game = normalizePrimaryGame(settings.primaryGame)
  handlePrimaryGameSwitch(game, trackedPrimaryGame)
  trackedPrimaryGame = game
}

function syncUserSessionFromAuth(): void {
  const user = authManager.getUser()
  if (user?.id) {
    activateUserSession(user.id, userSessionDeps())
    void pingDesktopOnboarding(authManager)
    reconcileInterruptedUploads()
    runStorageMaintenanceIfReady(true)
    syncPrimaryGameFromUser()
  }
  enforceRecordingPresetAccess()
}

function runStorageMaintenanceIfReady(notify = false): void {
  if (!recordingsStore || !settingsManager) return
  const maintenance = runRecordingStorageMaintenance({
    store: recordingsStore,
    savePath: recordingSavePath(),
    recordingRetentionDays: settingsManager.get().recordingRetentionDays,
    linkedRiot: linkedRiotFromAuth(),
  })
  if (maintenance.freedBytes > 0) {
    log.info(
      `[App] Storage maintenance freed ${(maintenance.freedBytes / (1024 ** 3)).toFixed(2)} GB`,
    )
    if (notify) {
      logActivity(
        `Freed ${(maintenance.freedBytes / (1024 ** 3)).toFixed(1)} GB of old local recordings`,
      )
      mainWindow?.webContents.send('recordings:updated')
      mainWindow?.webContents.send('dashboard:refresh')
    }
  }
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
    const orphanGame = normalizePrimaryGame(settingsManager.get().primaryGame)
    recordingsStore.add({
      path: file.path, // already preferred (compressed when sibling exists)
      riotName: '',
      riotTag: '',
      game: orphanGame,
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

function refreshCoachNotificationPoller(): void {
  if (authManager.isAuthenticated()) {
    startCoachNotificationPoller({
      authManager,
      getMainWindow: () => mainWindow,
      notifySilent,
    })
    startStuckAnalysisReconciler()
  } else {
    stopCoachNotificationPoller()
    stopStuckAnalysisReconciler()
  }
}

let stuckAnalysisReconcileTimer: ReturnType<typeof setInterval> | null = null

function dispatchReconciledAnalysisReady(ctx: ReconciledAnalysisContext): void {
  const result = ctx.status.result as Record<string, unknown> | undefined
  const analysisId = extractAnalysisIdFromPollResult(result)
  const score = typeof result?.overall_score === 'number' ? result.overall_score : undefined

  if (ctx.recordingId) {
    if (analysisId != null) recordingsStore.setAnalysisId(ctx.recordingId, analysisId)
    else recordingsStore.clearAnalysisPipeline(ctx.recordingId)
    mainWindow?.webContents.send('recordings:updated')
  }

  clearPendingJob()
  logActivity(`Analysis ready${score != null ? ` — Score: ${score}/100` : ''}`)

  const rec = ctx.recordingId
    ? recordingsStore.getById(ctx.recordingId)
    : recordingsStore.getByJobId(ctx.jobId)
  const timeline = rec?.timeline ?? null
  const lastScore = timeline?.finalScore
    ?? (timeline?.roundScores?.length ? timeline.roundScores[timeline.roundScores.length - 1] : null)
  const matchResult: 'win' | 'loss' | null = lastScore
    ? (lastScore.allyScore > lastScore.enemyScore ? 'win' : 'loss')
    : null
  const rawTiming = result?.timing_comparisons
  const matchHighlights = parseMatchHighlightsFromApi(result?.match_highlights)

  const payload = {
    recording_id: ctx.recordingId,
    overall_score: result?.overall_score,
    analysis_id: analysisId,
    top_issue: result?.top_issue,
    priority_improvements: result?.priority_improvements ?? [],
    verdict: result?.verdict ?? null,
    coaching_tags: result?.coaching_tags ?? [],
    spatial_summary: mergeSpatialSummary(
      extractSpatialFromAnalysisPayload(result),
      timeline?.spatialSummary,
    ),
    category_scores: result?.category_scores ?? [],
    session_start: rec?.recordedAt ?? Date.now(),
    match_id: timeline?.matchId ?? null,
    kills: timeline?.finalStats?.kills ?? result?.kills ?? null,
    deaths: timeline?.finalStats?.deaths ?? result?.deaths ?? null,
    assists: timeline?.finalStats?.assists ?? result?.assists ?? null,
    match_result: matchResult,
    ally_score: lastScore?.allyScore ?? null,
    enemy_score: lastScore?.enemyScore ?? null,
    match_highlights: matchHighlights,
    skill_profile: null,
    timing_comparisons: Array.isArray(rawTiming) ? rawTiming : [],
    duel_moments: result?.duel_moments ?? timeline?.duelMoments ?? null,
    pipeline: result?.pipeline ?? result?.pipeline_type ?? null,
  }

  if (postGameWindow && !postGameWindow.isDestroyed()) {
    sendPostGameEvent(postGameWindow, 'post-game:analysis-ready', payload)
  }
  mainWindow?.webContents.send('dashboard:refresh')

  const notifAgent = ctx.agent ?? gameLabel(ctx.game)
  const notifMap = ctx.map ? ` on ${ctx.map}` : ''
  const notifBody = score != null
    ? `${notifAgent}${notifMap} — ${score}/100`
    : `${notifAgent}${notifMap}`.trim()
  notifyCoachingReady(notifBody, analysisId ?? undefined)
  tray?.setToolTip(idleTooltip(ctx.game))
}

function logAnalysisFailureActivity(rawError: string, diagnostics: DuelFailureDiagnostics | null): void {
  if (diagnostics) {
    logActivity(`Analysis failed: ${diagnosticsSummary(diagnostics)}`)
    return
  }
  logActivity(`Analysis failed: ${formatAnalysisFailureMessage(rawError)}`)
}

function extractFailureDiagnostics(status?: AnalysisPollStatus | null): DuelFailureDiagnostics | null {
  if (!status) return null
  const fromTop = status.failure_diagnostics
  const fromResult = status.result?.failure_diagnostics
  return parseDuelFailureDiagnostics(fromTop ?? fromResult)
}

function dispatchAnalysisFailure(
  rawError: string,
  opts: {
    recordingId?: string | null
    targetWindow?: BrowserWindow | null
    notify?: boolean
    needsUpgrade?: boolean
    upgradeUrl?: string
    ppaUrl?: string
    clipsOnly?: boolean
    failureDiagnostics?: DuelFailureDiagnostics | null
  } = {},
): AnalysisErrorPayload {
  const payload = buildAnalysisErrorPayload(rawError, {
    recordingId: opts.recordingId ?? undefined,
    needsUpgrade: opts.needsUpgrade,
    upgradeUrl: opts.upgradeUrl,
    ppaUrl: opts.ppaUrl,
    clipsOnly: opts.clipsOnly,
    failureDiagnostics: opts.failureDiagnostics ?? null,
  })

  if (opts.recordingId) {
    const existing = recordingsStore.getById(opts.recordingId)
    // Skip duplicate dispatches when this recording already failed (reconciler / poll retries).
    if (existing?.lastAnalysisError && !existing.pipelineStatus) {
      return payload
    }
  }

  if (opts.recordingId) {
    recordingsStore.setAnalysisFailure(opts.recordingId, payload.message, {
      hint: payload.hint,
      creditRefunded: payload.creditRefunded,
      failureDiagnostics: (opts.failureDiagnostics ?? payload.failureDiagnostics ?? null) as
        | Record<string, unknown>
        | null
        | undefined,
    })
  }

  const windows = new Set<BrowserWindow>()
  if (opts.targetWindow && !opts.targetWindow.isDestroyed()) windows.add(opts.targetWindow)
  if (postGameWindow && !postGameWindow.isDestroyed()) windows.add(postGameWindow)
  for (const win of windows) {
    sendPostGameEvent(win, 'post-game:upload-error', payload)
  }

  mainWindow?.webContents.send('dashboard:analysis-failed', payload)
  mainWindow?.webContents.send('recordings:updated')

  const failureRecording = opts.recordingId ? recordingsStore.getById(opts.recordingId) : null
  if (payload.kind !== 'quota' && payload.kind !== 'clips_only') {
    reportPipelineError('analysis', payload.title, {
      kind: payload.kind,
      message: payload.message,
      recordingId: opts.recordingId ?? null,
      jobId: failureRecording?.jobId ?? null,
      map: failureRecording?.map ?? null,
      agent: failureRecording?.agent ?? null,
      integrityReason: opts.failureDiagnostics?.integrity_reason ?? null,
      clipsUploaded: opts.failureDiagnostics?.clips_uploaded ?? null,
      clipsRequested: opts.failureDiagnostics?.clips_requested ?? null,
      rawError: rawError.slice(0, 500),
    })
  }

  if (opts.notify !== false) {
    const existing = failureRecording
    const alreadyNotifiedThisRecording = Boolean(existing?.analysisFailureNotifiedAt)
    // Refunded / integrity failures share one global toast — backlog must not spam one per VOD.
    const notifyKey = payload.creditRefunded || payload.kind === 'integrity'
      ? `global:${payload.kind}:${payload.title}`
      : `${opts.recordingId ?? 'global'}:${payload.kind}:${payload.title}`
    const now = Date.now()
    const lastNotified = recentFailureNotifications.get(notifyKey)
    const cooldownOk = !lastNotified || now - lastNotified >= FAILURE_NOTIFY_COOLDOWN_MS
    if (!alreadyNotifiedThisRecording && cooldownOk) {
      recentFailureNotifications.set(notifyKey, now)
      const notifBody = payload.hint
        ? `${payload.message} ${payload.hint}`
        : payload.message
      showAppNotification({
        title: payload.creditRefunded ? `${payload.title} — credit refunded` : payload.title,
        body: notifBody.length > 220 ? `${notifBody.slice(0, 217)}…` : notifBody,
        silent: notifySilent(),
      })
      if (opts.recordingId) recordingsStore.markAnalysisFailureNotified(opts.recordingId)
    }
  }

  return payload
}

/** Route upload/prep failures through shared failure copy without duplicate OS notifications. */
function sendUploadFailure(
  rawError: string,
  opts: {
    recordingId?: string | null
    targetWindow?: BrowserWindow | null
    needsUpgrade?: boolean
    upgradeUrl?: string
    ppaUrl?: string
    clipsOnly?: boolean
    notify?: boolean
  } = {},
): AnalysisErrorPayload {
  return dispatchAnalysisFailure(rawError, { ...opts, notify: opts.notify ?? false })
}

function notifyCoachingReady(body: string, analysisId?: number | null): void {
  showAppNotification({
    title: 'Coaching ready',
    body,
    silent: notifySilent(),
    onClick: () => {
      focusMainWindow()
      if (analysisId != null) {
        mainWindow?.webContents.send('dashboard:open-latest-analysis', { analysisId })
      }
    },
  })
}

function runStuckAnalysisReconcile(): Promise<number> {
  if (!authManager.isAuthenticated()) return Promise.resolve(0)
  return reconcileStuckAnalysisJobs({
    uploadManager,
    recordingsStore,
    isAuthenticated: () => authManager.isAuthenticated(),
    reconcileOrphanedAnalyses: async () => {
      await authManager.getApi().post('/api/analysis/reconcile').catch(() => {})
    },
    fetchRecentAnalyses: async () => {
      const rows = await authManager.fetchAnalyses(30)
      return rows.map((a) => ({ id: a.id, job_id: a.job_id, overall_score: a.overall_score }))
    },
    onCompleted: dispatchReconciledAnalysisReady,
    onFailed: ({ error, recordingId, status }) => {
      dispatchAnalysisFailure(error, {
        recordingId,
        notify: false,
        failureDiagnostics: extractFailureDiagnostics(status),
      })
      logAnalysisFailureActivity(error, extractFailureDiagnostics(status))
      mainWindow?.webContents.send('dashboard:refresh')
    },
    resumePoll: (jobId, context) => {
      void resumePollForJob(jobId, context)
    },
  })
}

function startStuckAnalysisReconciler(): void {
  if (stuckAnalysisReconcileTimer) return
  void runStuckAnalysisReconcile()
  stuckAnalysisReconcileTimer = setInterval(() => { void runStuckAnalysisReconcile() }, 2 * 60 * 1000)
}

function stopStuckAnalysisReconciler(): void {
  if (stuckAnalysisReconcileTimer) {
    clearInterval(stuckAnalysisReconcileTimer)
    stuckAnalysisReconcileTimer = null
  }
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
  analysisJobId: string | null,
  game: string = trackedPrimaryGame,
): Promise<void> {
  return clipPipeline.extractKillClipsOnly(videoPath, timeline, analysisJobId, normalizePrimaryGame(game))
}

/**
 * Extract highlight clips from a completed match recording.
 * Called post-match once the recording file is finalised.
 */
async function extractMatchClips(
  videoPath: string,
  timeline: MatchData | null,
  analysisJobId: string | null,
  game: string = trackedPrimaryGame,
): Promise<void> {
  return clipPipeline.extractMatchClips(videoPath, timeline, analysisJobId, normalizePrimaryGame(game))
}

function countSessionClips(
  timeline: MatchData | null,
  agent: string | null,
  sessionStart: number,
): number {
  const matchId = timeline?.matchId ?? null
  const windowStart = sessionStart > 0 ? sessionStart - 60_000 : Date.now() - 4 * 60 * 60 * 1000
  return clipStore.getAll().filter(c => {
    if (!c.path || !fs.existsSync(c.path)) return false
    if (matchId) return c.matchId === matchId
    if (agent && c.agent === agent && c.savedAt >= windowStart) return true
    return false
  }).length
}

/** Dashboard stub when highlights were saved but no full-match VOD is available. */
function registerClipOnlySession(opts: {
  game: string
  map: string | null
  agent: string | null
  gameMode: string
  timeline: MatchData | null
  sessionStart: number
  reason: ClipOnlyReason
  requireClips?: boolean
}): void {
  if (!recordingsStore) return
  const clipCount = countSessionClips(opts.timeline, opts.agent, opts.sessionStart)
  if (opts.requireClips && clipCount === 0) return

  const user = authManager.getUser()
  const matchId = opts.timeline?.matchId ?? null
  const existing = recordingsStore.findRecentClipOnly({
    matchId,
    agent: opts.agent,
    withinMs: 2 * 60 * 60 * 1000,
  })
  if (existing) {
    recordingsStore.updateClipOnlyMeta(existing.id, { clipCount, timeline: opts.timeline })
    mainWindow?.webContents.send('recordings:updated')
    return
  }

  recordingsStore.add({
    path: '',
    clipsOnly: true,
    clipOnlyReason: opts.reason,
    clipCount,
    matchId,
    pipelineStatus: 'pending',
    riotName: opts.timeline?.playerName?.trim() ?? user?.riot_name ?? '',
    riotTag: opts.timeline?.playerTag?.trim() ?? user?.riot_tag ?? '',
    game: opts.game,
    map: opts.map,
    agent: opts.agent,
    gameMode: opts.gameMode,
    timeline: opts.timeline,
  })
  const clipLabel = clipCount === 1 ? '1 highlight clip' : `${clipCount} highlight clips`
  logActivity(
    opts.reason === 'clips_only_mode'
      ? `Match on dashboard — ${clipLabel} (clips-only mode)`
      : `Match on dashboard — ${clipLabel} (no full recording)`,
  )
  mainWindow?.webContents.send('recordings:updated')
}

async function syncScoutMomentsForJob(
  jobId: string | null,
  videoPath: string,
  timeline: MatchData | null,
): Promise<void> {
  if (!jobId) return
  await buildAndUploadScoutMoments({
    jobId,
    videoPath,
    timeline,
    clipStore,
    clipExtractor,
    upload: (id, moments) => uploadManager.uploadScoutMoments(id, moments),
  })
}

async function prepareTimelineForCoaching(
  timeline: MatchData | null,
  game: string,
  recordingId?: string | null,
): Promise<{ extras: CoachingSubmissionExtras | undefined }> {
  if (!timeline || game !== 'valorant') return { extras: undefined }

  await enrichTimelineForCoaching(riotLocalApi, timeline, {
    maxWaitMs: MATCH_DETAILS_ENRICH_MAX_MS,
    onStatus: (msg) => logActivity(msg),
    api: authManager.getToken() ? authManager.getApi() : null,
  })

  const rrHistory = await authManager.fetchRRHistory().catch(() => [])
  const extras = buildCoachingSubmissionExtras(
    timeline,
    settingsManager.get(),
    rrHistory,
    riotLocalApi.getDiagnostics().clientVersion,
  )

  if (recordingId) {
    recordingsStore.updateTimeline(recordingId, timeline)
    mainWindow?.webContents.send('recordings:updated')
  }

  return { extras }
}

/** Max wait for ffprobe before post-game upload proceeds (OBS already muxed the file). */
const POST_GAME_VOD_PROBE_MAX_MS = 3_000

function isBlockingVodReadiness(state: AnalysisReadiness['state']): boolean {
  return state === 'file_missing' || state === 'file_unreadable' || state === 'unavailable'
}

function sendAnalysisReadinessUpdate(
  targetWindow: BrowserWindow | null | undefined,
  readiness: AnalysisReadiness,
): void {
  mainWindow?.webContents.send('recordings:updated')
  sendPostGameEvent(targetWindow, 'post-game:analysis-readiness', readiness)
}

async function refreshRecordingVodProbe(
  rec: NonNullable<ReturnType<RecordingsStore['getById']>>,
): Promise<void> {
  if (!rec.path || rec.clipsOnly || (rec.cloudArchived && rec.archiveId)) return
  if (!fs.existsSync(rec.path)) return
  await refreshVodProbe(rec.path, (p) => clipExtractor.probe(p))
}

/** Poll Riot + VOD probe until analyse is unblocked — keeps dashboard Analyse disabled until ready. */
function scheduleAnalysisReadinessRefresh(recordingId: string, game: string): void {
  const startedAt = Date.now()

  const tick = async (): Promise<void> => {
    const rec = recordingsStore.getById(recordingId)
    if (!rec || rec.analysed || rec.pipelineStatus === 'uploading' || rec.pipelineStatus === 'analysing') {
      return
    }

    await refreshRecordingVodProbe(rec)

    let readiness = getAnalysisReadiness(rec)
    if (isTerminalAnalysisReadinessState(readiness.state)) {
      mainWindow?.webContents.send('recordings:updated')
      const pg = postGameWindow
      if (pg && !pg.isDestroyed()) {
        sendPostGameEvent(pg, 'post-game:analysis-readiness', readiness)
      }
      return
    }

    if (Date.now() - startedAt >= MATCH_DETAILS_ENRICH_MAX_MS) {
      mainWindow?.webContents.send('recordings:updated')
      readiness = getAnalysisReadiness(rec)
      const pg = postGameWindow
      if (pg && !pg.isDestroyed()) {
        sendPostGameEvent(pg, 'post-game:analysis-readiness', readiness)
      }
      return
    }

    if (readiness.state === 'syncing' && rec.game === 'valorant' && rec.timeline) {
      try {
        await enrichTimelineForCoaching(riotLocalApi, rec.timeline, {
          maxWaitMs: 20_000,
          api: authManager.getToken() ? authManager.getApi() : null,
        })
        recordingsStore.updateTimeline(recordingId, rec.timeline)
      } catch { /* retry on next tick */ }
      readiness = getAnalysisReadiness(rec)
    }

    mainWindow?.webContents.send('recordings:updated')
    if (!isTerminalAnalysisReadinessState(readiness.state)) {
      const pg = postGameWindow
      if (pg && !pg.isDestroyed()) {
        sendPostGameEvent(pg, 'post-game:analysis-readiness', readiness)
      }
      setTimeout(() => { void tick() }, 10_000)
    }
  }

  setTimeout(() => { void tick() }, 5_000)
}

async function ensureAnalysisReadinessForAnalyse(
  recordingId: string,
): Promise<
  | { ok: true; recording: NonNullable<ReturnType<RecordingsStore['getById']>> }
  | { ok: false; error: string; state: string }
> {
  let rec = recordingsStore.getById(recordingId)
  if (!rec) return { ok: false, error: 'Recording not found', state: 'unavailable' }

  await refreshRecordingVodProbe(rec)

  let readiness = getAnalysisReadiness(rec)
  if (readiness.ready) return { ok: true, recording: rec }

  if (readiness.state === 'finalizing' && rec.path && fs.existsSync(rec.path)) {
    for (let attempt = 0; attempt < 6 && readiness.state === 'finalizing'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2_000))
      await refreshRecordingVodProbe(rec)
      rec = recordingsStore.getById(recordingId)
      if (!rec) return { ok: false, error: 'Recording not found', state: 'unavailable' }
      readiness = getAnalysisReadiness(rec)
    }
  }

  if (readiness.ready) return { ok: true, recording: rec }

  const shouldRetryRiotEnrich =
    rec.game === 'valorant'
    && rec.timeline
    && (readiness.state === 'syncing' || readiness.state === 'unavailable')

  if (shouldRetryRiotEnrich) {
    logActivity(readiness.state === 'syncing' ? readiness.message : 'Fetching match stats from Riot…')
    await prepareTimelineForCoaching(rec.timeline!, rec.game, recordingId)
    rec = recordingsStore.getById(recordingId)
    if (!rec) return { ok: false, error: 'Recording not found', state: 'unavailable' }
    await refreshRecordingVodProbe(rec)
    readiness = getAnalysisReadiness(rec)
    mainWindow?.webContents.send('recordings:updated')
  }

  if (!readiness.ready) {
    return { ok: false, error: readiness.message, state: readiness.state }
  }
  return { ok: true, recording: rec }
}

async function waitUntilAnalysisReady(
  recordingId: string,
  targetWindow: BrowserWindow | null | undefined,
  maxWaitMs = MATCH_DETAILS_ENRICH_MAX_MS,
): Promise<{ ready: boolean; readiness: AnalysisReadiness }> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < maxWaitMs) {
    let rec = recordingsStore.getById(recordingId)
    if (!rec) {
      return {
        ready: false,
        readiness: {
          ready: false,
          state: 'unavailable',
          message: 'Recording not found',
          duelMomentCount: 0,
        },
      }
    }

    await refreshRecordingVodProbe(rec)
    let readiness = getAnalysisReadiness(rec)
    sendAnalysisReadinessUpdate(targetWindow, readiness)

    if (readiness.ready) return { ready: true, readiness }
    if (isTerminalAnalysisReadinessState(readiness.state) && !readiness.ready) {
      return { ready: false, readiness }
    }

    if (readiness.state === 'syncing' && rec.game === 'valorant' && rec.timeline) {
      await prepareTimelineForCoaching(rec.timeline, rec.game, recordingId)
      rec = recordingsStore.getById(recordingId)
      if (rec) {
        await refreshRecordingVodProbe(rec)
        readiness = getAnalysisReadiness(rec)
        sendAnalysisReadinessUpdate(targetWindow, readiness)
        if (readiness.ready) return { ready: true, readiness }
        if (isTerminalAnalysisReadinessState(readiness.state) && !readiness.ready) {
          return { ready: false, readiness }
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 5_000))
  }

  const rec = recordingsStore.getById(recordingId)
  const readiness = rec ? getAnalysisReadiness(rec) : {
    ready: false,
    state: 'unavailable' as const,
    message: 'Timed out waiting for match data',
    duelMomentCount: 0,
  }
  sendAnalysisReadinessUpdate(targetWindow, readiness)
  return { ready: readiness.ready, readiness }
}

const DEBRIEF_SKIP_MODES = new Set(['DEATHMATCH', 'TEAMDEATHMATCH'])

function shouldRequestDebrief(timeline: MatchData | null, mode: string | null | undefined): boolean {
  if (!timeline) return false
  if (DEBRIEF_SKIP_MODES.has((mode ?? '').toUpperCase())) return false
  return (timeline.playerKills?.length ?? 0) > 0
    || (timeline.roundSummaries?.length ?? 0) > 0
    || timeline.finalStats != null
}

function requestPregameBrief(context?: {
  agent?: string | null
  map?: string | null
  mode?: string | null
  allyAgents?: string[]
  enemyAgents?: string[]
}): void {
  void authManager.fetchRRHistory().then((history) => {
    const skillFocus = topSkillFocus(settingsManager.get())
    _requestPregameBrief(
      () => authManager.getToken(),
      logActivity,
      {
        ...context,
        rank: history[0]?.rank ?? null,
        skillFocus: skillFocus ?? null,
      },
      process.env['VITE_API_URL'],
    )
  }).catch(() => {
    _requestPregameBrief(() => authManager.getToken(), logActivity, context, process.env['VITE_API_URL'])
  })
}

async function requestPostGameDebrief(opts: {
  riotName: string
  riotTag: string
  agent: string | null
  map: string | null
  timeline: MatchData
  sendToWindow: (channel: string, payload?: unknown) => void
  coachingExtras?: CoachingSubmissionExtras
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
    getInFlightCount: () => recordingsStore?.listInFlightPipelines().length ?? 0,
    getAnalysablePendingCount: () => {
      const pending = recordingsStore?.getPending(linkedRiotFromAuth()) ?? []
      return pending.filter((r) => {
        if (r.clipsOnly || r.cloudArchived) return false
        if (r.pipelineStatus === 'uploading' || r.pipelineStatus === 'analysing') return false
        return getAnalysisReadiness(r).ready
      }).length
    },
    onAnalyseOldest: () => {
      const pending = recordingsStore?.getPending(linkedRiotFromAuth()) ?? []
      const oldest = pending.find((r) => {
        if (r.clipsOnly || r.cloudArchived) return false
        if (r.pipelineStatus === 'uploading' || r.pipelineStatus === 'analysing') return false
        return getAnalysisReadiness(r).ready
      })
      if (!oldest) return
      focusMainWindow()
      mainWindow?.webContents.send('dashboard:analyse-recording', { id: oldest.id })
    },
    createMainWindowFn: () => createMainWindow(),
  })
  tray = result.tray
  updateTrayMenuFn = result.updateMenu
  trayRefreshInterval = result.refreshInterval
}

async function refreshDeadlockProfile(fresh = true): Promise<void> {
  if (!authManager.isAuthenticated()) return
  await authManager.fetchUser().catch(() => null)
  mainWindow?.webContents.send('dashboard:refresh', { fresh })
}

function setupGameDetection(): void {
  setMatchRecordingGuard(() => obsRecorder.isRecording())
  startSteamGsiServer()
  gameDetector.setWatchGame(normalizePrimaryGame(settingsManager.get().primaryGame))
  if (normalizePrimaryGame(settingsManager.get().primaryGame) === 'deadlock') {
    void ensureDeadlockSteamLaunchOptions()
    startDeadlockLogWatcher()
  }

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
    if (gsiPollTimer) { clearInterval(gsiPollTimer); gsiPollTimer = null }
    cachedShippingProcessUp = true
    lastShippingProcessCheckAt = 0
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

  /** Shared path for presence / GSI / process-exit match-end signals. */
  async function isValorantStillInLiveMatch(): Promise<boolean> {
    try {
      const shippingUp = await gameDetector.isMatchProcessRunning()
      if (!shippingUp) return false
      const state = await riotLocalApi.getSessionState()
      if (state?.sessionLoopState === 'INGAME') {
        const coreActive = await riotLocalApi.isCoreGameSessionActive()
        if (coreActive === true) return true
      }
      // Shipping running but presence not yet MENUS — likely still on map.
      if (state?.sessionLoopState !== 'MENUS') return true
    } catch { /* not live */ }
    return false
  }

  async function finishActiveMatch(game: string, source: string): Promise<void> {
    if (matchHandled) return
    if (!(await obsRecorder.isCaptureActive())) return

    if (game === 'valorant' && await isValorantStillInLiveMatch()) {
      console.log(`[MatchEnd] Suppressing false end (${source}) — Valorant match still live`)
      logActivity('False match-end ignored — recording continues')
      riotLocalApi.clearSuppressedMatchEnd()
      riotLocalApi.onMatchEnded = () => finishActiveMatch(game, 'presence')
      if (!obsRecorder.isRecording() && await obsRecorder.isObsOutputActive()) {
        await obsRecorder.reclaimActiveRecording()
      }
      return
    }

    const elapsedSec = currentRecordingStartTime
      ? Math.floor((Date.now() - currentRecordingStartTime) / 1000)
      : 0
    const durationLabel = elapsedSec > 0
      ? `${Math.round(elapsedSec / 60)}m ${elapsedSec % 60}s`
      : 'unknown duration'
    console.log(`[MatchEnd] ${source} — stopping recording (${elapsedSec}s captured)`)
    logActivity(`Match ended (${source}) — stopping recording (${durationLabel})`)
    riotLocalApi.onMatchEnded = null

    const didFinalize = await finalizeMatchOnce(game, source)
    if (!didFinalize) return
    if (game === 'deadlock') void refreshDeadlockProfile(true)
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized()) mainWindow.restore()
    destroyOverlay()
    await rearmGameDetection(game)
  }

  /** Re-enter detection after a skipped match (Valorant stays running between queues). */
  async function rearmValorantDetection(game: string, waitForMatchEnd = false): Promise<void> {
    if (game !== 'valorant') return
    const emitNextMatchWatch = async () => {
      await new Promise((r) => setTimeout(r, 5000))
      if (await obsRecorder.releaseStaleMatchOwnership()) {
        logActivity('Cleared stale recording state — watching for next match')
      }
      if (!(await gameDetector.isMatchProcessRunning())) return

      // Avoid stop/start loops: a false early match-end while still INGAME must not
      // immediately start a second recording for the same live match.
      try {
        const authOk = await riotLocalApi.initAuth()
        if (authOk) {
          const state = await riotLocalApi.getSessionState()
          if (state?.sessionLoopState === 'INGAME') {
            const coreActive = await riotLocalApi.isCoreGameSessionActive()
            if (coreActive === true) {
              console.log('[GameDetector] Still INGAME with active core-game — waiting for menus before re-arm')
              logActivity('Still in match — waiting for post-game lobby before next recording')
              riotLocalApi.watchUntilMenus(emitNextMatchWatch)
              return
            }
          }
        }
      } catch { /* fall through to normal re-arm */ }

      console.log('[GameDetector] Re-arming after skipped match — watching for next queue')
      logActivity('Watching for next match...')
      gameDetector.emit('game-started', game)
    }
    if (waitForMatchEnd) {
      // onMatchEnded only fires when start() is running presence polls — skipped matches
      // never call start(), so watch menus directly until the player leaves the map.
      riotLocalApi.watchUntilMenus(emitNextMatchWatch)
      return
    }
    await emitNextMatchWatch()
  }

  /** Re-arm lobby watch when a title stays open between matches. */
  async function rearmGameDetection(game: string, waitForMatchEnd = false): Promise<void> {
    if (game === 'valorant') {
      return rearmValorantDetection(game, waitForMatchEnd)
    }
    if (game !== 'cs2' && game !== 'deadlock') return

    if (game === 'cs2') resetSteamGsiSession()
    if (game === 'deadlock') resetDeadlockLogSession()
    const emitNextMatchWatch = async () => {
      await new Promise((r) => setTimeout(r, 5000))
      if (await gameDetector.isGameProcessRunning(game)) {
        console.log(`[GameDetector] ${game} still running — watching for next match`)
        logActivity('Watching for next match...')
        gameDetector.emit('game-started', game)
      }
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
    const matchSessionStart = currentMatchStartTime ?? currentRecordingStartTime
      ?? (Date.now() - recordingDuration * 1000)
    const matchWallDurationSec = matchSessionStart
      ? Math.floor((Date.now() - matchSessionStart) / 1000)
      : recordingDuration
    const effectiveDuration = Math.max(recordingDuration, matchWallDurationSec)

    let timeline: MatchData | null = null
    let pendingReplayPath: string | null = null

    await Promise.all([
      (async () => { timeline = await riotLocalApi.stop() })(),
      obsRecorder.stop(),
    ])

    if ((game === 'cs2' || game === 'deadlock') && !timeline) {
      const replayCtx = {
        game: game as 'cs2' | 'deadlock',
        matchSessionStart,
        matchStartTime: currentMatchStartTime,
        recordingStartTime: currentRecordingStartTime ?? matchSessionStart,
        gsiMap: currentGsiMapName ?? (game === 'deadlock' ? getDeadlockMap() : getLatestGsiMap()),
        customReplayDir: game === 'cs2' ? config?.cs2DemoDir : undefined,
        localPlayerName: null as string | null,
      }
      const parsed = await buildTimelineFromReplay(replayCtx)
      if (parsed.timeline) timeline = parsed.timeline
      pendingReplayPath = parsed.demoPath
      lastReplayRetryContext = {
        game: game as 'cs2' | 'deadlock',
        matchSessionStart,
        customReplayDir: game === 'cs2' ? config?.cs2DemoDir : undefined,
        meta: game === 'deadlock'
          ? { matchStartedAt: Math.floor(matchSessionStart / 1000) }
          : undefined,
      }
      if (timeline) {
        log.info(`[HandleMatchEnd] ${game} demo timeline — kills=${timeline.playerKills.length}`)
      }
    }

    if (game === 'deadlock') {
      const logTimeline = buildDeadlockTimelineFromLogSession(
        currentRecordingStartTime ?? matchSessionStart,
        currentMatchStartTime,
      )
      if (logTimeline && !timeline) {
        timeline = logTimeline
        log.info(
          `[HandleMatchEnd] deadlock log timeline — kills=${logTimeline.playerKills.length} hero=${logTimeline.agent ?? '?'}`,
        )
      } else if (logTimeline && timeline) {
        if (!timeline.agent && logTimeline.agent) timeline.agent = logTimeline.agent
        if (!timeline.map && logTimeline.map) timeline.map = logTimeline.map
        if (timeline.playerKills.length === 0 && logTimeline.playerKills.length > 0) {
          timeline.playerKills = logTimeline.playerKills
          timeline.playerDeaths = logTimeline.playerDeaths
          timeline.killEvents = logTimeline.killEvents
          log.info(`[HandleMatchEnd] merged ${logTimeline.playerKills.length} kills from console log`)
        }
      }
    }

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

    const durationForGate = Math.max(recordingDuration, effectiveDuration)

    const user = authManager.getUser()
    const map = timeline?.map ?? currentGsiMapName ?? null
    const agent = timeline?.agent ?? (game === 'deadlock' ? getDeadlockHero() : null) ?? null
    const gameMode = game === 'valorant'
      ? (riotLocalApi.getLastGameMode() ?? 'UNKNOWN')
      : (timeline?.gameMode ?? 'COMPETITIVE')
    const autoAnalyse = config?.autoAnalyse !== false

    async function maybeUploadDemoOnly(reason: string): Promise<void> {
      if (!autoAnalyse || (game !== 'cs2' && game !== 'deadlock')) return
      if (!authManager.isAuthenticated()) return
      logActivity(`${gameLabel(game)} replay uploading (${reason})`)
      showAppNotification({
        title: `${gameLabel(game)} replay analysis`,
        body: 'No VOD saved — uploading match replay for AI coaching.',
        silent: notifySilent(),
      })
      const notifyWin = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
      await tryAutoUploadSourceReplay({
        game: game as 'cs2' | 'deadlock',
        demoPath: pendingReplayPath,
        matchSessionStart: matchSessionStart,
        auth: authManager,
        notifyWindow: notifyWin,
        customReplayDir: game === 'cs2' ? config?.cs2DemoDir : undefined,
      })
      mainWindow?.webContents.send('dashboard:refresh', { fresh: true })
    }
    const clipsOnly = config?.fullMatchRecording === false || obsRecorder.isClipsOnlySession()

    if (clipsOnly) {
      registerClipOnlySession({
        game,
        map,
        agent,
        gameMode,
        timeline,
        sessionStart: matchSessionStart,
        reason: 'clips_only_mode',
      })
      tray?.setToolTip(idleTooltip(game))
      logActivity('Clips-only mode — highlight clips saved during the match (no full VOD on disk)')
      showAppNotification({
        title: 'UpForge — Match complete',
        body: 'Clips-only mode: kill highlights were saved during the match. No full recording was stored locally.',
        silent: notifySilent(),
      })
      return
    }

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
        : (game === 'cs2' || game === 'deadlock')
          ? (killsInTimeline > 0 ? 'fetched' : 'fetch_failed')
          : (riotDiag.accessTokenPresent ? 'no_match_id' : 'no_auth'),
    }

    log.info(
      `[HandleMatchEnd] duration=${recordingDuration}s videoPath=${videoPath} fileSize=${fileSize} ` +
      `kills=${timeline?.playerKills?.length ?? 0} matchId=${timeline?.matchId ?? 'none'}`
    )

    tray?.setToolTip(idleTooltip(game))

    const MIN_DURATION_SECONDS = MIN_RECORDING_DURATION_SECONDS
    const MIN_FILE_SIZE_BYTES = MIN_RECORDING_FILE_BYTES

    if (durationForGate > 0 && durationForGate < MIN_DURATION_SECONDS) {
      console.log(`[GameDetector] Recording too short (${durationForGate}s) — ignoring`)
      logActivity(`Recording too short (${durationForGate}s) — discarded`)
      registerClipOnlySession({
        game,
        map,
        agent,
        gameMode,
        timeline,
        sessionStart: matchSessionStart,
        reason: 'no_recording',
        requireClips: true,
      })
      notifyRecordingUx(
        `Recording was only ${Math.round(durationForGate)}s — at least 2 minutes is needed for analysis. The file was discarded.`,
        'UpForge — Recording Too Short'
      )
      if (videoPath && fs.existsSync(videoPath)) {
        try { fs.unlinkSync(videoPath) } catch { /* ignore */ }
      }
      void maybeUploadDemoOnly('recording too short')
      return
    }
    if (recordingDuration === 0 && fileSize < MIN_RECORDING_FILE_BYTES) {
      scanForOrphanedRecordings(true)
      registerClipOnlySession({
        game,
        map,
        agent,
        gameMode,
        timeline,
        sessionStart: matchSessionStart,
        reason: 'no_recording',
        requireClips: true,
      })
      const lastErr = obsRecorder.getLastError()
      const msg = lastErr ? `Match ended — no recording was made (${lastErr})` : 'Match ended — no active recording'
      logActivity(msg)
      notifyRecordingUx(lastErr ? `No recording was saved: ${lastErr}` : 'No recording was saved for this match.', 'UpForge — No Recording')
      void maybeUploadDemoOnly('no recording')
      return
    }

    // Close any existing post-game window first (consecutive match scenario —
    // match 2 can end before match 1's window is dismissed).
    clearVodProbeCache()
    postGameWindow?.close()
    resetPostGameSession(game, map, agent)
    const thisPostGameWindow = createPostGameWindow()
    postGameWindow = thisPostGameWindow
    thisPostGameWindow.on('closed', () => {
      if (postGameWindow === thisPostGameWindow) postGameWindow = null
      clearPostGameSession()
    })
    // Show without stealing focus from fullscreen Valorant — user can alt-tab when ready.
    whenWebContentsReady(thisPostGameWindow, () => {
      if (thisPostGameWindow.isDestroyed()) return
      try {
        sendPostGameEvent(thisPostGameWindow, 'post-game:preparing', { game, map, agent })
      } catch { /* window may have closed */ }
      if (process.platform === 'win32') {
        thisPostGameWindow.showInactive()
      } else {
        thisPostGameWindow.show()
      }
    })

    // Notify the user that the match recording has finished and upload is starting
    {
      const agentLabel = agent ?? gameLabel(game)
      const mapLabel = map ? ` on ${map}` : ''
      showAppNotification({
        title: 'Uploading match',
        body: `${agentLabel}${mapLabel} — coaching report on the way.`,
        silent: notifySilent(),
        allowDuringRecording: true,
      })
    }

    // CS2 / Deadlock replay upload — runs asynchronously and never blocks VOD upload
    if (game === 'cs2' || game === 'deadlock') {
      if (pendingReplayPath) {
        const replayMeta = game === 'deadlock'
          ? {
              matchId: getDeadlockLobbyMatchId(),
              matchStartedAt: Math.floor(matchSessionStart / 1000),
            }
          : undefined
        void uploadReplayInBackground(
          game as 'cs2' | 'deadlock',
          pendingReplayPath,
          authManager,
          thisPostGameWindow,
          replayMeta,
        ).catch(() => { /* logged inside */ })
      } else {
        try {
          if (!thisPostGameWindow.isDestroyed()) {
            thisPostGameWindow.webContents.send('post-game:demo-status', { status: 'not-found' })
          }
        } catch { /* window closed */ }
      }
    }

    const runPostGameUpload = async () => {
        const sendToWindow = (channel: string, payload?: unknown) => {
          sendPostGameEvent(thisPostGameWindow, channel, payload)
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
        sendUploadFailure(errorMsg, { targetWindow: thisPostGameWindow })
        return
      }

      const { path: readyPath, sizeBytes: readySize } = ready

      if (readySize < MIN_FILE_SIZE_BYTES) {
        const sizeMB = (readySize / (1024 * 1024)).toFixed(2)
        const errorMsg = formatCorruptRecordingMessage(getRecordingBackendForStatus(), sizeMB)
        log.error(`[GameDetector] ${errorMsg}`)
        logActivity(`Recording file too small (${sizeMB} MB) — upload skipped`)
        sendUploadFailure(errorMsg, { targetWindow: thisPostGameWindow })
        return
      }

      const matchId = timeline?.matchId
      const richMatchData = hasRichMatchData(timeline)
      const lateRetryScheduled = !richMatchData && !!matchId

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
      scheduleAnalysisReadinessRefresh(savedRecording.id, game)

      sendToWindow('post-game:analysis-readiness', {
        ready: false,
        state: 'finalizing',
        message: 'Finalizing recording…',
        duelMomentCount: 0,
      })

      // Leave "preparing" immediately — don't block UI on ffprobe / Riot sync.
      sendToWindow('post-game:prep-step', { game, map, agent })

      let coachingExtras: CoachingSubmissionExtras | undefined
      const enrichPromise = prepareTimelineForCoaching(timeline, game, savedRecording.id)
        .then((result) => {
          coachingExtras = result.extras
          return result
        })

      void enrichPromise.then(() => {
        if (!user?.riot_name || !timeline || !shouldRequestDebrief(timeline, gameMode)) return
        void requestPostGameDebrief({
          riotName: user.riot_name,
          riotTag: user.riot_tag ?? 'NA1',
          agent,
          map,
          timeline,
          coachingExtras,
          sendToWindow: (channel, payload) => {
            if (!thisPostGameWindow.isDestroyed()) thisPostGameWindow.webContents.send(channel, payload)
          },
        }).catch((err) => log.warn('[Debrief] Background debrief failed:', err))
      }).catch((err) => log.warn('[Enrich] Match coaching enrich failed:', err))

      if (!autoAnalyse) {
        void refreshRecordingVodProbe(savedRecording).catch(() => {})
        const pendingReadiness = getAnalysisReadiness(recordingsStore.getById(savedRecording.id) ?? savedRecording)
        sendToWindow('post-game:pending', {
          recordingId: savedRecording.id,
          game,
          map,
          agent,
          analysisReadiness: pendingReadiness,
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

        extractMatchClips(readyPath, timeline, null, game)
          .catch(err => log.warn('[ClipExtract] Clip extraction (no-analyse) error:', err))

        await enrichPromise.catch(() => {})

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
              await extractKillClipsOnly(readyPath, timeline!, null, game)
            } catch (err) {
              log.warn('[LateClipExtract] Error (no-analyse path):', err)
            }
          }, 90_000)
        }
        return
      }

      const recForProbe = recordingsStore.getById(savedRecording.id) ?? savedRecording
      void waitUntilVodFileReady(
        (id) => recordingsStore.getById(id),
        savedRecording.id,
        async () => {
          const rec = recordingsStore.getById(savedRecording.id)
          if (rec) await refreshRecordingVodProbe(rec)
        },
        {
          maxWaitMs: POST_GAME_VOD_PROBE_MAX_MS,
          pollMs: 750,
          onReadiness: (readiness) => sendToWindow('post-game:analysis-readiness', readiness),
        },
      ).then(({ ok: vodReady, readiness: vodReadiness }) => {
        if (!vodReady && isBlockingVodReadiness(vodReadiness.state)) {
          log.warn('[PostGame] VOD probe reported blocking state after upload started:', vodReadiness.state)
        }
      }).catch((err) => {
        log.warn('[PostGame] Background VOD probe failed:', err)
      })

      const autoReadiness = getAnalysisReadiness(recForProbe)
      if (isTerminalAnalysisReadinessState(autoReadiness.state) && !autoReadiness.ready) {
        logActivity(autoReadiness.message || 'Auto-analyse skipped — recording not ready')
        sendToWindow('post-game:pending', {
          recordingId: savedRecording.id,
          game,
          map,
          agent,
          analysisReadiness: autoReadiness,
        })
        {
          const agentLabel = agent ?? gameLabel(game)
          const mapLabel = map ? ` · ${map}` : ''
          showAppNotification({
            title: 'Match recorded',
            body: `${agentLabel}${mapLabel} — ${autoReadiness.message || 'review when ready from your dashboard.'}`,
            silent: notifySilent(),
          })
        }
        extractMatchClips(readyPath, timeline, null, game)
          .catch(err => log.warn('[ClipExtract] Clip extraction (auto-analyse skipped) error:', err))
        await enrichPromise.catch(() => {})
        if (lateRetryScheduled) {
          log.info('[HandleMatchEnd] No kills (auto-analyse skipped) — scheduling late retry in 90s')
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
              await extractKillClipsOnly(readyPath, timeline!, null, game)
            } catch (err) {
              log.warn('[LateClipExtract] Error (auto-analyse skipped path):', err)
            }
          }, 90_000)
        }
        return
      }

      tray?.setToolTip('UpForge — Uploading...')

      const uploadResult = await doUploadAndAnalyse(
        savedRecording.id, readyPath, user?.riot_name ?? '', user?.riot_tag ?? '',
        game, map, agent, timeline, thisPostGameWindow, matchSessionStart,
        /* skipAutoDelete= */ true, /* deleteLocalAfterUpload= */ false, enrichPromise,
        { prioritizePostGameUpload: true },
      )

      const jobId = uploadResult ?? null

      extractMatchClips(readyPath, timeline, jobId, game)
        .then(() => syncScoutMomentsForJob(jobId, readyPath, timeline))
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
              enrichTimelineSpatial(timeline)
              const rrHistory = await authManager.fetchRRHistory().catch(() => [])
              const lateExtras = buildCoachingSubmissionExtras(
                timeline,
                settingsManager.get(),
                rrHistory,
                riotLocalApi.getDiagnostics().clientVersion,
              )
              await uploadManager.patchMatchData(jobId, timeline, lateExtras).catch((err) => {
                log.warn('[LateClipExtract] Failed to patch job match_data:', err)
              })
            }
            log.info(`[LateClipExtract] Got ${timeline!.playerKills.length} kills — extracting clips`)
            await extractKillClipsOnly(readyPath, timeline!, jobId, game)
            await syncScoutMomentsForJob(jobId, readyPath, timeline!)
          } catch (err) {
            log.warn('[LateClipExtract] Error:', err)
          } finally {
            doAutoDelete()
          }
        }, 90_000)
      }
    }

    void runPostGameUpload().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('[HandleMatchEnd] Post-game upload failed:', err)
      logActivity(`Upload failed to start: ${msg}`)
      try {
        if (!thisPostGameWindow.isDestroyed()) {
          sendUploadFailure(`Upload failed to start: ${msg}`, { targetWindow: thisPostGameWindow })
        }
      } catch { /* window closed */ }
    })
    } finally {
      handleMatchEndRunning = false
      currentRecordingStartTime = null
      currentMatchStartTime = null
      currentGsiMapName = null
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
    await rearmGameDetection(game)
    return { ok: true }
  }

  gameDetector.on('game-started', async (game: string) => {
    if (await obsRecorder.releaseStaleMatchOwnership()) {
      logActivity('Cleared stale recording state — ready for next match')
    }
    if (obsRecorder.isRecording()) {
      console.log('[GameDetector] game-started ignored — capture already active')
      return
    }
    if (await obsRecorder.isObsOutputActive()) {
      const reclaimed = await obsRecorder.reclaimActiveRecording()
      if (reclaimed) {
        console.log('[GameDetector] game-started reclaimed ongoing OBS capture')
        return
      }
    }

    syncPrimaryGameFromDetection(game)

    const { isStale } = beginMatchFlow()
    console.log(`[GameDetector] ${game} started (flow #${matchFlowGeneration})`)
    logActivity(`${gameLabel(game)} detected — waiting for match`)
    if (game === 'deadlock') deadlockSessionStartAt = Date.now()
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
    if (game === 'valorant' && Array.isArray(recordedModesEarly) && recordedModesEarly.length === 0) {
      logActivity('No game modes selected — recording disabled')
      notifyRecordingUx('Select at least one game mode in Settings → Recording to record matches.')
      tray?.setToolTip(idleTooltip(game))
      await rearmGameDetection(game, true)
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
    if (!obsRecorder.isConnected()) {
      maybeNotifyObsNotReadyBeforeQueue()
    }
    void ensureObsCaptureForGame(game)
    if (recorderConfig) {
      log.info(
        `[Recorder] OBS · ${formatRecordingLabel(recorderConfig.quality, recorderConfig.bitrate, recorderConfig.fps ?? 30)}` +
        `${recorderConfig.manageObsVideo === false ? ' (OBS video settings unchanged)' : ''} (synced to OBS before recording)`,
      )
    }
    const freeBytes = await getFreeDiskSpace(savePath)
    if (freeBytes < CRITICAL_FREE_DISK_BYTES) {
      const msg = `Not enough disk space (${formatFreeDiskLabel(freeBytes)}) — recording skipped. Free space in Settings → Recording.`
      logActivity(msg)
      notifyRecordingUx(msg, 'UpForge — Disk Full')
      mainWindow?.webContents.send('app:warning', {
        message: msg,
        actionLabel: 'Free up space',
        actionRoute: '/settings?tab=recording',
      })
      tray?.setToolTip(idleTooltip(game))
      await rearmGameDetection(game, true)
      return
    }
    if (freeBytes < LOW_FREE_DISK_BYTES) {
      const msg = `Low disk space (${formatFreeDiskLabel(freeBytes)}) — recording may fail. Upload pending VODs in Settings → Recording.`
      console.warn(`[Recorder] ${msg}`)
      mainWindow?.webContents.send('app:warning', {
        message: msg,
        actionLabel: 'Free up space',
        actionRoute: '/settings?tab=recording',
      })
      showAppNotification({
        title: 'UpForge — Low Disk Space',
        body: msg,
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
    let matchStartTime: number | null = null
    let modeConfident = false
    let cancelled = false
    cancelMatchWait = () => { cancelled = true }
    waitingForMatch = true

    const recordedModes = config?.recordedModes ?? ['COMPETITIVE', 'PREMIER']
    // Empty list = record nothing (dashboard/settings copy). Non-empty partial list = filter.
    const filterByMode = game === 'valorant' && recordedModes.length > 0 &&
      !([...ALL_MODES].every(m => recordedModes.includes(m)))

    // CS2 — GSI live match (process open ≠ in a match).
    // Deadlock — console.log tailing (-condebug); no Valve GSI support.
    let authOk = false
    if (game === 'cs2') {
      resetSteamGsiSession()
      const gsiInstall = await installSteamGsiConfig('cs2')
      if (gsiInstall.needsRestart) {
        logActivity('Restart CS2 once so UpForge can detect when a match starts')
      }
      logActivity('CS2 running — waiting for match')

      const MATCH_TIMEOUT_MS = 25 * 60 * 1000
      const loopStart = Date.now()
      let gsiHintShown = false
      const deadline = Date.now() + MATCH_TIMEOUT_MS
      while (Date.now() < deadline && !cancelled) {
        if (abortIfStale(isStale, game)) return
        await new Promise((r) => setTimeout(r, 1000))
        if (cancelled) break
        if (!await gameDetector.isGameProcessRunning(game)) { cancelled = true; break }

        if (!gsiHintShown && Date.now() - loopStart > 45_000 && !isGsiReceiving()) {
          gsiHintShown = true
          logActivity('CS2 match detection inactive — restart the game if recording never starts on its own')
        }

        if (isGsiMatchLive()) {
          matchStartTime = Date.now()
          currentMatchStartTime = matchStartTime
          currentGsiMapName = getLatestGsiMap()
          gameMode = 'COMPETITIVE'
          modeConfident = true
          break
        }
      }
    } else if (game === 'deadlock') {
      const steamSetup = await ensureDeadlockSteamLaunchOptions()
      resetDeadlockLogSession()
      startDeadlockLogWatcher()
      if (!steamSetup.ok && steamSetup.error) {
        log.warn('[Deadlock] Steam launch options:', steamSetup.error)
        logActivity('Deadlock: add -condebug to Steam launch options manually (Properties → Launch Options)')
      } else if (steamSetup.needsGameRestart) {
        logActivity('Restart Deadlock once — UpForge added -condebug for match detection')
        notifyRecordingUx(
          'Close and reopen Deadlock so match detection works (-condebug was just added to Steam launch options).',
          'UpForge — Restart Deadlock',
        )
      }
      logActivity('Deadlock running — waiting for match')

      const MATCH_TIMEOUT_MS = 25 * 60 * 1000
      const loopStart = Date.now()
      let reopenHintShown = false
      let detectionHintShown = false
      let condebugHintShown = false
      const deadline = Date.now() + MATCH_TIMEOUT_MS
      while (Date.now() < deadline && !cancelled) {
        if (abortIfStale(isStale, game)) return
        await new Promise((r) => setTimeout(r, 1000))
        if (cancelled) break
        if (!await gameDetector.isGameProcessRunning(game)) { cancelled = true; break }

        const dlStatus = getDeadlockDetectionStatus()

        if (
          !reopenHintShown
          && steamSetup.needsGameRestart
          && Date.now() - loopStart > 20_000
          && !isDeadlockDetectionActive()
        ) {
          reopenHintShown = true
          logActivity('Reopen Deadlock so UpForge can detect matches (-condebug)')
          notifyRecordingUx(
            'Restart Deadlock once so UpForge can detect when a match starts. Recording waits until you are in-game.',
          )
        }

        if (
          !condebugHintShown
          && !steamSetup.needsGameRestart
          && Date.now() - loopStart > 30_000
          && !dlStatus.logReceiving
          && !dlStatus.replayLive
        ) {
          condebugHintShown = true
          logActivity('Deadlock console.log not updating — verify -condebug in Steam launch options')
          notifyRecordingUx(
            'UpForge is not seeing Deadlock match logs. In Steam: Deadlock → Properties → Launch Options, add -condebug, then restart the game.',
            'UpForge — Match detection',
          )
        }

        if (
          !detectionHintShown
          && !steamSetup.needsGameRestart
          && Date.now() - loopStart > 45_000
          && !isDeadlockDetectionActive()
        ) {
          detectionHintShown = true
          const replayHint = dlStatus.replayDir
            ? ` Replays folder: ${dlStatus.replayDir}`
            : ''
          logActivity(`Deadlock match detection inactive — check -condebug and replay saving.${replayHint}`)
        }

        if (isDeadlockReadyToRecord()) {
          matchStartTime = getDeadlockMatchStartedAt() ?? Date.now()
          currentMatchStartTime = matchStartTime
          currentGsiMapName = getDeadlockMap()
          gameMode = 'COMPETITIVE'
          modeConfident = true
          log.info('[Deadlock] Match ready:', getDeadlockDetectionStatus())
          break
        }
      }
    } else if (game === 'valorant') {
    // ── Presence-based match detection ────────────────────────────────────
    // Try to use the Riot Local API to detect when the match actually goes
    // INGAME, so we avoid the old blind 90s wait.  Falls back to a 90s wait
    // if the lockfile / auth is not available (rare on modern installations).
    // ──────────────────────────────────────────────────────────────────────
    authOk = await riotLocalApi.initAuth()

    if (authOk) {
      logActivity('Riot Client API ready — waiting for INGAME presence')
      // Wait up to 25 minutes for INGAME (handles long Agent Select)
      const PRESENCE_TIMEOUT_MS = 25 * 60 * 1000
      const deadline = Date.now() + PRESENCE_TIMEOUT_MS
      let lastCoreGameCheckAt = 0
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
              await rearmGameDetection(game, true)
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

          // Presence can flake (circuit breaker / empty private payload) while core-game is live.
          const now = Date.now()
          if (now - lastCoreGameCheckAt >= 3000) {
            lastCoreGameCheckAt = now
            const coreActive = await riotLocalApi.isCoreGameSessionActive()
            if (coreActive === true) {
              console.log('[GameDetector] core-game session active — treating as INGAME (presence fallback)')
              matchStartTime = Date.now()
              if (!gameMode) {
                const mode = await riotLocalApi.getGameMode()
                if (mode) {
                  gameMode = mode
                  modeConfident = true
                }
              }
              break
            }
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
    }

    waitingForMatch = false
    cancelMatchWait = null
    mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })

    if (abortIfStale(isStale, game)) return

    if (game === 'valorant' && cancelled) {
      logActivity('Match cancelled (game quit during loading)')
      console.log('[GameDetector] Game quit during loading — no recording')
      tray?.setToolTip(idleTooltip(game))
      return
    }

    // If presence API was available but INGAME was never seen, the player is idle
    // in the lobby (or queued and cancelled). Do NOT start recording — this is what
    // causes "hallucinated" matches when the app is left idle for 25+ minutes.
    if (game === 'valorant' && authOk && matchStartTime === null) {
      logActivity('Presence timeout — no match started, returning to idle')
      console.log('[GameDetector] Presence loop timed out without INGAME — not recording')
      tray?.setToolTip(idleTooltip(game))
      await rearmGameDetection(game)
      return
    }

    if ((game === 'cs2' || game === 'deadlock') && cancelled) {
      logActivity('Game quit before match started — nothing recorded')
      console.log('[GameDetector] Game quit before match — no recording')
      tray?.setToolTip(idleTooltip(game))
      return
    }

    if ((game === 'cs2' || game === 'deadlock') && matchStartTime === null) {
      logActivity('No match started — returning to idle')
      console.log(`[GameDetector] ${game} match wait timed out without live match — not recording`)
      tray?.setToolTip(idleTooltip(game))
      await rearmGameDetection(game)
      return
    }

    // If presence didn't give us a mode, try the log file as last resort (never overwrite queueId)
    if (game === 'valorant' && !modeConfident) {
      const logMode = await riotLocalApi.getGameModeFromLog()
      if (logMode) {
        if (!gameMode) gameMode = logMode
        modeConfident = true
      } else if (gameMode) {
        modeConfident = true
      }
    }

    if (game === 'valorant' && filterByMode && !modeConfident) {
      console.log('[GameDetector] Skipping recording — queue mode unknown')
      logActivity('Queue mode unknown — recording skipped (select all modes or wait for queue)')
      notifyRecordingUx(
        'Could not detect this queue type — recording skipped. Enable more modes in Settings or wait until the queue is identified.',
      )
      tray?.setToolTip(idleTooltip(game))
      await rearmGameDetection(game, true)
      return
    }

    if (game === 'valorant' && filterByMode && gameMode && !recordedModes.includes(gameMode)) {
      console.log(`[GameDetector] Skipping recording — mode is ${gameMode} (recordedModes=${recordedModes.join(',')})`)
      logActivity(`Mode ${gameMode} not in recorded modes (${recordedModes.join(', ')}) — skipped`)
      notifyRecordingUx(
        `${gameMode} is not in your recorded modes — this match was not captured. Change modes in Settings → Recording.`,
      )
      tray?.setToolTip(idleTooltip(game))
      await rearmGameDetection(game, true)
      return
    }

    if (abortIfStale(isStale, game)) return
    if (obsRecorder.isRecording()) {
      console.log('[GameDetector] Match confirmed but capture already active — skipping duplicate start')
      return
    }
    const obsOutputActive = await obsRecorder.isObsOutputActive()
    let reclaimedExistingCapture = false
    if (obsOutputActive) {
      reclaimedExistingCapture = await obsRecorder.reclaimActiveRecording()
      if (reclaimedExistingCapture) {
        console.log('[GameDetector] Reclaimed in-progress OBS recording — continuing same file')
        logActivity('Recovered in-progress recording — continuing capture')
      } else {
        console.log('[GameDetector] OBS output active but not reclaimable — skipping duplicate start')
        return
      }
    }

    if (!gameMode) gameMode = 'COMPETITIVE'
    matchHandled = false
    if (matchStartTime != null) currentMatchStartTime = matchStartTime

    if (game === 'valorant' && !pregameBriefFired && (gameMode === 'COMPETITIVE' || gameMode === 'PREMIER')) {
      requestPregameBrief({ agent: null, map: null, mode: gameMode })
      pregameBriefFired = true
    }

    logActivity(`Match detected (${gameMode}${modeConfident ? '' : '?'}) — starting recording`)
    console.log(`[GameDetector] Match confirmed! gameMode=${gameMode} confident=${modeConfident} matchStartTime=${matchStartTime}`)

    if (game === 'valorant') {
      riotLocalApi.cancelMenuWatch()
      riotLocalApi.onMatchEnded = () => finishActiveMatch(game, 'presence')
      riotLocalApi.start(game, matchStartTime ?? undefined)
    } else if (game === 'cs2' || game === 'deadlock') {
      gsiPollTimer = setInterval(() => {
        void (async () => {
          if (!obsRecorder.isRecording() || matchHandled) return
          const ended = game === 'deadlock'
            ? isDeadlockMatchEnded()
            : isGsiMatchEnded()
          if (!ended) return
          await finishActiveMatch(game, 'gsi')
        })()
      }, 2000)
    }

    const gameProcessStillRunning = game === 'valorant'
      ? await gameDetector.isMatchProcessRunning()
      : await gameDetector.isGameProcessRunning(game)
    if (!gameProcessStillRunning) {
      log.warn('[GameDetector] Game process exited before recorder start — aborting')
      logActivity('Match ended before recording could start')
      tray?.setToolTip(idleTooltip(game))
      mainWindow?.webContents.send('recording:starting', { starting: false })
      waitingForMatch = false
      mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })
      await rearmGameDetection(game, true)
      return
    }

    tray?.setToolTip('UpForge — Starting recorder...')
    mainWindow?.webContents.send('recording:starting', { starting: true })
    try {
      // Create the overlay window just before recording starts — deferred from startup
      // so it doesn't break Valorant's exclusive fullscreen before we actually need it.
      createOverlayWindow()
      await ensureObsReady()
      if (!reclaimedExistingCapture) {
        await obsRecorder.start(game, recorderConfig)
      }
      interruptBackgroundWorkForMatch()
      // Accurate videoOffsetMs: offset = (loadSkew − recordingLag) + timeSinceGameStart.
      if (!reclaimedExistingCapture) {
        const recStartTime = Date.now()
        riotLocalApi.setRecordingStartTime(recStartTime)
        currentRecordingStartTime = recStartTime
        hotkeyBookmarks.length = 0 // clear any stale bookmarks from previous match
      } else {
        const recStartTime = obsRecorder.getRecordingStartedAt()
          ?? currentRecordingStartTime
          ?? currentMatchStartTime
          ?? Date.now()
        riotLocalApi.setRecordingStartTime(recStartTime)
        currentRecordingStartTime = recStartTime
      }
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
      await rearmGameDetection(game, true)
      return
    }
    logActivity(`Recording started (${gameMode ?? 'unknown mode'}${obsRecorder.wasNoAudio() ? ' — no audio' : ''})`)
    trackFirstRecording(game)

    if (game === 'valorant') {
      setTimeout(() => {
        void obsRecorder.refitCaptureForGameplay('post-loading settle')
      }, 12_000)
    }

    // Poll overlay/session state — drives Valorant match-end detection via pollActiveMatch.
    const pollOverlaySession = async () => {
      try {
        const state = await riotLocalApi.getSessionState()
        if (game === 'valorant' && obsRecorder.isRecording() && !matchHandled) {
          const now = Date.now()
          if (now - lastShippingProcessCheckAt >= SHIPPING_PROCESS_CHECK_MS) {
            lastShippingProcessCheckAt = now
            cachedShippingProcessUp = await gameDetector.isMatchProcessRunning()
          }
          await riotLocalApi.pollActiveMatch({
            shippingProcessRunning: cachedShippingProcessUp,
            state,
          })
        }
        if (state?.sessionLoopState === 'INGAME') {
          riotLocalApi.setGameplayStartTime(Date.now())
          const ally = state.allyScore ?? 0
          const enemy = state.enemyScore ?? 0
          if (ally + enemy > 0) {
            void obsRecorder.refitCaptureForGameplay('scoreboard active')
          }
          const round = ally + enemy + 1
          sendOverlayData('overlay:data', {
            round,
            allyScore: ally,
            enemyScore: enemy,
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
    if (overlayPollTimer) { clearInterval(overlayPollTimer); overlayPollTimer = null }
    cachedShippingProcessUp = true
    lastShippingProcessCheckAt = 0
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
    const gameLabelText = gameLabel(game)
    tray?.setToolTip(`UpForge — Recording ${gameLabelText} (${userLabel})`)

    const feedbackMode = settingsManager.get().inGameFeedback ?? 'notifications'
    deliverInGameFeedback(inGameFeedbackDeps(), {
      kind: 'recording-started',
      title: 'Recording started',
      body: `${gameLabelText} match for ${userLabel} — F9 clip · F8 screenshot · F10 overlay`,
      beep: 'success',
      flashOverlayMs: feedbackMode === 'notifications' ? 0 : 7000,
    })
  })

  gameDetector.on('game-stopped', async (game: string) => {
    console.log(`[GameDetector] ${game} stopped`)
    discordRPC.setIdle()
    riotLocalApi.cancelMenuWatch()
    riotLocalApi.onMatchEnded = null

    try {
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
    const captureActive = await obsRecorder.isCaptureActive()
    if (!captureActive) {
      waitingForMatch = false
      mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })
      tray?.setToolTip(idleTooltip(game))
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized()) mainWindow.restore()
      destroyOverlay()
      return
    }

    // Process died without a clean presence transition (crash, force-quit, etc.)
    const processStillRunning = game === 'valorant'
      ? await gameDetector.isMatchProcessRunning()
      : await gameDetector.isGameProcessRunning(game)
    if (processStillRunning) {
      console.log(`[GameDetector] game-stopped debounced — ${game} process still running`)
      return
    }

    if (game === 'valorant') {
      try {
        const state = await riotLocalApi.getSessionState()
        if (state?.sessionLoopState === 'INGAME') {
          const coreActive = await riotLocalApi.isCoreGameSessionActive()
          if (coreActive === true) {
            console.log('[GameDetector] game-stopped ignored — still INGAME with core-game')
            return
          }
        }
      } catch { /* process is gone — proceed with finalize */ }
    }

    logActivity('Game process ended — stopping recording')
    await finalizeMatchOnce(game, 'process-exit')
    // Restore main window now that game is gone
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized()) mainWindow.restore()
    destroyOverlay()
    } finally {
      if (game === 'deadlock') {
        void refreshDeadlockProfile(true)
        const sessionStart = currentMatchStartTime ?? deadlockSessionStartAt
        const autoAnalyse = settingsManager?.get().autoAnalyse !== false
        if (!matchHandled && sessionStart != null && autoAnalyse && authManager.isAuthenticated()) {
          void tryAutoUploadSourceReplay({
            game: 'deadlock',
            demoPath: null,
            matchSessionStart: sessionStart,
            auth: authManager,
            notifyWindow: mainWindow && !mainWindow.isDestroyed() ? mainWindow : null,
            meta: {
              matchId: getDeadlockLobbyMatchId(),
              matchStartedAt: Math.floor(sessionStart / 1000),
            },
          }).then(() => {
            mainWindow?.webContents.send('dashboard:refresh', { fresh: true })
          })
        }
        deadlockSessionStartAt = null
        currentMatchStartTime = null
      }
      maybeResumeDeferredUploads()
    }
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
    reconcileInterruptedUploads()
    logActivity(`Cleared stale analysis job (${decision.reason})`)
    return
  }

  if (decision.action === 'failed') {
    clearPendingJob()
    const rec = recordingsStore.getByJobId(orphanedJob.job_id)
    dispatchAnalysisFailure(decision.error, { recordingId: rec?.id ?? null, notify: false })
    logActivity(`Previous analysis failed: ${decision.error}`)
    tray?.setToolTip(idleTooltip(context.game))
    return
  }

  if (decision.action === 'completed') {
    dispatchReconciledAnalysisReady({
      jobId: orphanedJob.job_id,
      status: decision.status,
      recordingId: recordingsStore.getByJobId(orphanedJob.job_id)?.id ?? null,
      agent: context.agent ?? null,
      map: context.map ?? null,
      game: context.game ?? 'valorant',
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
    onProgress: (status) => {
      const rec = recordingsStore.getByJobId(jobId)
      if (!rec) return
      const raw = status.progress
      const progress = typeof raw === 'number' && !Number.isNaN(raw)
        ? Math.min(100, Math.max(0, Math.round(raw)))
        : status.status === 'queued' ? 0 : 5
      recordingsStore.setAnalysisProgress(rec.id, progress, status.current_step ?? null)
      mainWindow?.webContents.send('recordings:updated')
    },
    onCompleted: (status) => {
      const score = (status.result as Record<string, unknown> | undefined)?.overall_score as number | undefined
      const analysisId = extractAnalysisIdFromPollResult(status.result as Record<string, unknown> | undefined)
      const rec = recordingsStore.getByJobId(jobId)
      if (rec) {
        if (analysisId != null) recordingsStore.setAnalysisId(rec.id, analysisId)
        else recordingsStore.clearAnalysisPipeline(rec.id)
        mainWindow?.webContents.send('recordings:updated')
      }
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
    onFailed: (userMessage, rawError, status) => {
      const rec = recordingsStore.getByJobId(jobId)
      dispatchAnalysisFailure(rawError || userMessage, {
        recordingId: rec?.id ?? null,
        notify: false,
        failureDiagnostics: extractFailureDiagnostics(status),
      })
      logActivity(`Resumed analysis failed: ${rawError || userMessage}`)
      tray?.setToolTip(idleTooltip(game))
      mainWindow?.webContents.send('dashboard:refresh')
    },
    onConnectionLost: () => {
      logActivity('Resumed poll — lost connection to server (will retry when you reopen UpForge)')
      tray?.setToolTip(idleTooltip(game))
    },
    onPollEnded: (reason) => {
      if (reason === 'max_duration') {
        const rec = recordingsStore.getByJobId(jobId)
        if (rec?.id) {
          recordingsStore.clearAnalysisPipeline(rec.id)
          mainWindow?.webContents.send('recordings:updated')
        }
        logActivity('Resumed analysis poll stopped after 90 minutes — job may still be processing')
        tray?.setToolTip('UpForge — Analysis still running…')
        void runStuckAnalysisReconcile()
        showAppNotification({
          title: 'UpForge — Still analysing',
          body: 'Your match is still processing on our servers. We\'ll notify you when it\'s ready.',
          silent: notifySilent(),
        })
      }
    },
  })
}

/** Save a recording to cloud only (archive quota — no analysis). */
async function doUploadArchiveOnly(
  recordingId: string | null,
  videoPath: string,
  riotName: string,
  riotTag: string,
  game: string,
  map: string | null,
  agent: string | null,
  timeline: MatchData | null,
  targetWindow: BrowserWindow,
  deleteLocalAfterUpload = false,
): Promise<string | null> {
  const send = (channel: string, payload?: unknown) => {
    try {
      if (!targetWindow.isDestroyed()) targetWindow.webContents.send(channel, payload)
    } catch { /* destroyed */ }
  }

  await waitUntilBackgroundWorkAllowed(matchPriorityDeps(), { logActivity })

  let effectivePath = videoPath
  try {
    const resolved = await resolveUploadVideoPath(videoPath, (sizeGB) => {
      logActivity(`Recording is ${sizeGB} GB — compressing for cloud upload…`)
      send('post-game:compress-start', { sizeGB })
    })
    effectivePath = resolved.path
    if (resolved.compressed && recordingId && effectivePath !== videoPath) {
      recordingsStore.updatePath(recordingId, effectivePath)
      mainWindow?.webContents.send('recordings:updated')
    }
    if (resolved.sizeBytes > MAX_RECORDING_FILE_BYTES) {
      const errorMsg = formatRecordingTooLargeMessage(resolved.sizeBytes, false)
      sendUploadFailure(errorMsg, { targetWindow, recordingId, notify: false })
      return null
    }
  } catch (prepErr) {
    sendUploadFailure(
      prepErr instanceof Error ? prepErr.message : 'Could not prepare recording for upload',
      { targetWindow, recordingId, notify: false },
    )
    return null
  }

  if (recordingId) {
    recordingsStore.setPipelineArchiveOnly(recordingId, true)
    mainWindow?.webContents.send('recordings:updated')
  }

  send('post-game:upload-start', { game, map, agent, archiveOnly: true })
  send('post-game:upload-progress', 3)

  let coachingExtras: CoachingSubmissionExtras | undefined
  if (timeline && game === 'valorant') {
    const prepared = await prepareTimelineForCoaching(timeline, game, recordingId)
    coachingExtras = prepared.extras
  }

  try {
    logActivity(`Saving recording to cloud${map ? ` (${map})` : ''}`)
    const result = await uploadManager.archiveUpload({
      videoPath: effectivePath,
      riotName,
      riotTag,
      game,
      map,
      agent,
      timeline,
      coachingExtras,
      trainingConsent: settingsManager?.get().trainingConsent === true,
      onProgress: (pct) => send('post-game:upload-progress', pct),
    })

    if (recordingId) {
      recordingsStore.markArchived(recordingId, result.archive_id)
      mainWindow?.webContents.send('recordings:updated')
      mainWindow?.webContents.send('dashboard:refresh')
    }

    send('post-game:upload-complete', { archiveId: result.archive_id, archiveOnly: true })
    logActivity('VOD saved to cloud — analyse later from your dashboard')

    if (deleteLocalAfterUpload || settingsManager?.get().autoDelete) {
      obsRecorder.deleteRecording(videoPath)
      deleteCompressedSibling(videoPath)
      logActivity('Local recording removed — VOD available in cloud')
    }

    return result.archive_id
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Cloud save failed'
    logActivity(`Cloud save failed: ${msg}`)
    const isUpgradeError = err instanceof UpgradeRequiredError
      || (err instanceof Error && /archive.limit.reached|archive_limit_reached/i.test(err.message))
    sendUploadFailure(msg, {
      targetWindow,
      recordingId,
      needsUpgrade: isUpgradeError,
      upgradeUrl: err instanceof UpgradeRequiredError ? err.upgradeUrl : 'https://upforge.gg/pricing',
      notify: false,
    })
    return null
  } finally {
    if (recordingId) {
      recordingsStore.setPipelineArchiveOnly(recordingId, false)
      mainWindow?.webContents.send('recordings:updated')
    }
  }
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
  /** Shared enrich from handleMatchEnd — avoids duplicate Riot polling. */
  enrichPromise?: Promise<{ extras: CoachingSubmissionExtras | undefined }>,
  /** Post-game auto path — don't wait on the next match's OBS session. */
  uploadOpts?: { prioritizePostGameUpload?: boolean },
): Promise<string | null> {
  const send = (channel: string, payload?: unknown) => {
    sendPostGameEvent(targetWindow, channel, payload)
  }
  stopActiveAnalysisPoll()

  const user = authManager.getUser()
  const storedRecording = recordingId ? recordingsStore.getById(recordingId) : null
  const identity = resolveUploadPlayerIdentity(game, timeline, user, {
    riotName: storedRecording?.riotName ?? riotName,
    riotTag: storedRecording?.riotTag ?? riotTag,
  })
  riotName = identity.riotName
  riotTag = identity.riotTag

  const skipMatchDefer = uploadOpts?.prioritizePostGameUpload === true
  const deferOpts = { skipDefer: skipMatchDefer }

  if (!skipMatchDefer && recordingId && shouldDeferHeavyBackgroundWork(matchPriorityDeps())) {
    recordingsStore.setPipelineDeferReason(recordingId, 'recording')
    mainWindow?.webContents.send('recordings:updated')
    send('post-game:upload-deferred', { reason: 'recording' })
  }

  await waitUntilBackgroundWorkAllowed(matchPriorityDeps(), { logActivity, ...deferOpts })

  if (recordingId) {
    recordingsStore.clearPipelineDeferReason(recordingId)
    mainWindow?.webContents.send('recordings:updated')
  }

  if (recordingId) {
    registerDeferredUploadRetry(recordingId, async () => {
      await doUploadAndAnalyse(
        recordingId, videoPath, riotName, riotTag, game, map, agent, timeline,
        targetWindow, sessionStart, skipAutoDelete, deleteLocalAfterUpload, enrichPromise,
      )
    })
  }

  if (recordingId) {
    recordingsStore.setPipelineStatus(recordingId, 'uploading')
    activeUploadRecordingIds.add(recordingId)
    mainWindow?.webContents.send('recordings:updated')
  }

  let effectivePath = videoPath
  try {
    let readable = await clipExtractor.probe(videoPath)
    if (!readable.ok) {
      const moovMissing = readable.reason?.includes('moov atom') ?? false
      if (moovMissing) {
        for (let attempt = 0; attempt < 5 && !readable.ok; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 2_000))
          readable = await clipExtractor.probe(videoPath)
        }
      }
    }
    if (!readable.ok) {
      throw new Error(readable.reason ?? 'Recording file is incomplete')
    }

    const resolved = await resolveUploadVideoPath(videoPath, (sizeGB) => {
      if (sizeGB === 'remux') {
        logActivity('Wrapping OBS recording for upload (no re-encode)…')
      } else if (sizeGB === 'transcode') {
        logActivity('Converting OBS recording to upload format…')
      } else {
        log.warn(`[Upload] Recording is ${sizeGB} GB — compressing before upload`)
        logActivity(`Recording is ${sizeGB} GB — compressing for upload…`)
      }
      send('post-game:compress-start', { sizeGB })
    }, { forAnalysis: true })
    effectivePath = resolved.path
    if (effectivePath !== videoPath) {
      const siblingProbe = await clipExtractor.probe(effectivePath)
      if (!siblingProbe.ok) {
        log.warn(
          `[Upload] Remux/compressed path unreadable (${siblingProbe.reason}) — using original:`,
          videoPath,
        )
        effectivePath = videoPath
      }
    }
    if (recordingId) {
      recordingsStore.updatePath(recordingId, effectivePath)
      mainWindow?.webContents.send('recordings:updated')
    }
    if (resolved.compressed && effectivePath !== videoPath) {
      const newGB = (resolved.sizeBytes / (1024 ** 3)).toFixed(2)
      logActivity(`Compressed recording to ${newGB} GB — uploading`)
    }
    if (resolved.sizeBytes > MAX_RECORDING_FILE_BYTES) {
      const sizeGB = (resolved.sizeBytes / (1024 ** 3)).toFixed(1)
      const errorMsg = formatRecordingTooLargeMessage(resolved.sizeBytes, true)
      log.warn(`[Upload] Still too large after compression (${sizeGB} GB) — clips only`)
      logActivity(`Recording still too large (${sizeGB} GB) — saving highlight clips only`)
      extractMatchClips(effectivePath, timeline, null, game)
        .catch((err) => log.warn('[ClipExtract] Clip extraction (oversized) error:', err))
      sendUploadFailure(errorMsg, { targetWindow, recordingId, clipsOnly: true, notify: false })
      return null
    }
  } catch (prepErr) {
    const prepMsg = prepErr instanceof Error ? prepErr.message : 'Could not prepare recording for upload'
    if (wasBackgroundWorkInterrupted(prepErr)) {
      if (recordingId) {
        recordingsStore.setPipelineDeferReason(recordingId, 'recording')
        recordingsStore.setPipelineStatus(recordingId, 'pending')
        mainWindow?.webContents.send('recordings:updated')
      }
      logActivity('Compress/upload paused for your next match — will retry when recording ends')
      send('post-game:upload-deferred', { reason: 'recording' })
      return null
    }
    log.error('[Upload] Failed to prepare video path:', prepErr)
    sendUploadFailure(prepMsg, { targetWindow, recordingId, notify: false })
    return null
  }

  // Show upload UI as soon as the file is ready — don't block on Riot stats (can take minutes).
  send('post-game:upload-start', {
    game,
    map,
    agent,
    matchDetailsStatus: lastMatchDiagnostic?.matchDetailsStatus ?? 'pending',
    killsInTimeline: lastMatchDiagnostic?.killsInTimeline ?? 0,
  })
  send('post-game:upload-progress', 3)
  if (recordingId) {
    recordingsStore.setUploadProgress(recordingId, 3)
    mainWindow?.webContents.send('dashboard:upload-progress', { recordingId, progress: 3 })
  }

  let coachingExtras: CoachingSubmissionExtras | undefined
  const enrichTask = (async (): Promise<void> => {
    if (!timeline || game !== 'valorant') return
    try {
      if (enrichPromise) {
        const result = await enrichPromise
        coachingExtras = result.extras
      } else {
        const result = await prepareTimelineForCoaching(timeline, game, recordingId)
        coachingExtras = result.extras
      }
      if (lastMatchDiagnostic) {
        lastMatchDiagnostic.killsInTimeline = timeline.playerKills?.length ?? 0
        const rich = hasRichMatchData(timeline)
        lastMatchDiagnostic.matchDetailsStatus = rich
          ? 'fetched'
          : (timeline.matchId ? 'fetch_failed' : 'no_match_id')
      }
      if (hasRichMatchData(timeline)) {
        logActivity(
          `Riot match stats loaded (${timeline.roundSummaries?.length ?? 0} rounds, ${timeline.playerKills?.length ?? 0} kills)`,
        )
      } else if (timeline.matchId) {
        logActivity('Riot match stats not ready yet — server will wait for stats before coaching')
      }
    } catch (err) {
      log.warn('[Upload] Match details enrichment failed:', err)
    }
  })()

  // Run Riot enrich in parallel with S3 upload — stats are awaited in beforeComplete.
  void enrichTask

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
      coachingExtras,
      prepareDuelClips: timeline && game === 'valorant'
        ? async (jobId, path) => {
            const moments = duelMomentsForUpload(timeline)
            if (moments.length === 0) {
              const kills = timeline.playerKills?.length ?? 0
              const deaths = timeline.playerDeaths?.length ?? 0
              log.warn(`[Upload] No duel moments after enrich (kills=${kills} deaths=${deaths})`)
              if (deaths === 0) {
                logActivity('No deaths in match stats — duel coaching needs your death moments from Riot')
              } else {
                logActivity('Death timestamps missing — wait ~30s after the game and try Analyse again')
              }
              return []
            }
            logActivity(`Preparing ${moments.length} duel clips for AI review`)
            const withKeys = await extractAndUploadDuelClips({
              uploadManager,
              jobId,
              videoPath: path,
              moments,
              clipExtractor,
            })
            const uploaded = countMomentsWithClipKeys(withKeys)
            logActivity(`Uploaded ${uploaded}/${moments.length} duel clips for AI review`)
            if (uploaded === 0 && moments.length > 0) {
              logActivity('Duel clips not cut locally — server will extract from your recording')
            }
            return withKeys
          }
        : undefined,
      deferMatchDataOnPresign: game === 'valorant',
      getCoachingExtras: () => coachingExtras,
      beforeComplete: timeline && game === 'valorant'
        ? async () => {
            await enrichTask
            if (hasRichMatchData(timeline)) return
            logActivity('Still waiting for Riot match stats…')
            await enrichTimelineForCoaching(riotLocalApi, timeline, {
              maxWaitMs: MATCH_DETAILS_ENRICH_MAX_MS,
              onStatus: (msg) => logActivity(msg),
            })
            if (recordingId) {
              recordingsStore.updateTimeline(recordingId, timeline)
              mainWindow?.webContents.send('recordings:updated')
            }
            const rrHistory = await authManager.fetchRRHistory().catch(() => [])
            coachingExtras = buildCoachingSubmissionExtras(
              timeline,
              settingsManager.get(),
              rrHistory,
              riotLocalApi.getDiagnostics().clientVersion,
            )
          }
        : undefined,
      onProgress: (pct) => {
        send('post-game:upload-progress', pct)
        if (recordingId) {
          recordingsStore.setUploadProgress(recordingId, pct)
          mainWindow?.webContents.send('dashboard:upload-progress', { recordingId, progress: pct })
        }
      },
    })

    if (timeline && game === 'valorant') {
      if (!coachingExtras) {
        const rrHistory = await authManager.fetchRRHistory().catch(() => [])
        coachingExtras = buildCoachingSubmissionExtras(
          timeline,
          settingsManager.get(),
          rrHistory,
          riotLocalApi.getDiagnostics().clientVersion,
        )
      }
      await uploadManager.patchMatchData(result.job_id, timeline, coachingExtras).catch((err) => {
        log.warn('[Upload] Failed to patch match_data after enrich:', err)
      })
    }

    send('post-game:upload-complete', { jobId: result.job_id })
    logActivity('Upload complete — AI analysis running')
    tray?.setToolTip('UpForge — Analysing...')

    // Mark as analysed in store (if this was a saved recording)
    if (recordingId) {
      recordingsStore.markAnalysed(recordingId, result.job_id)
      mainWindow?.webContents.send('recordings:updated')
      mainWindow?.webContents.send('dashboard:refresh')
    }

    // Keep local file until analysis finishes — needed for VOD review, duel-clip debug, and retry on failure.
    startAnalysisPoll({
      uploadManager,
      jobId: result.job_id,
      targetWindow,
      mainWindow,
      onProgress: (status) => {
        if (!recordingId) return
        const raw = status.progress
        const progress = typeof raw === 'number' && !Number.isNaN(raw)
          ? Math.min(100, Math.max(0, Math.round(raw)))
          : status.status === 'queued' ? 0 : 5
        recordingsStore.setAnalysisProgress(recordingId, progress, status.current_step ?? null)
      },
      onCompleted: (status) => {
        const score = (status.result as Record<string, unknown>).overall_score as number | undefined
        const analysisId = extractAnalysisIdFromPollResult(status.result as Record<string, unknown> | undefined)
        if (recordingId) {
          if (analysisId != null) {
            recordingsStore.setAnalysisId(recordingId, analysisId)
            const rec = recordingsStore.getById(recordingId)
            if (rec?.path) {
              maybeDeleteLocalRecordingAfterAnalysis(rec.path, { deleteLocalAfterUpload, skipAutoDelete })
            }
          } else {
            recordingsStore.clearAnalysisPipeline(recordingId)
          }
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

        let localSpatial = timeline?.spatialSummary
        if (timeline) enrichTimelineSpatial(timeline)
        if (recordingId) {
          const rec = recordingsStore.getById(recordingId)
          if (rec?.timeline) {
            enrichTimelineSpatial(rec.timeline)
            recordingsStore.updateTimeline(recordingId, rec.timeline)
            localSpatial = rec.timeline.spatialSummary ?? localSpatial
          }
        }

        const categoryScores = (status.result as Record<string, unknown>).category_scores as
          | Array<{ category: string; score: number }>
          | undefined
        const coachingTags = (status.result as Record<string, unknown>).coaching_tags as string[] | undefined
        const prevSkillProfile = settingsManager.get().skillProfile
        const nextSkillProfile = mergeSkillProfileFromAnalysis(prevSkillProfile, {
          categoryScores: categoryScores ?? [],
          coachingTags: coachingTags ?? [],
          overallScore: score ?? null,
          headshotPct: timeline?.finalStats?.headshotPct ?? null,
        })
        settingsManager.save({
          skillProfile: nextSkillProfile,
          skillProfilePrevious: prevSkillProfile ?? undefined,
        })

        const rawHighlights = (status.result as Record<string, unknown>).match_highlights
        const matchHighlights = parseMatchHighlightsFromApi(rawHighlights)

        const rawTiming = (status.result as Record<string, unknown>).timing_comparisons

        send('post-game:analysis-ready', {
          recording_id: recordingId,
          overall_score: (status.result as Record<string, unknown>).overall_score,
          analysis_id: (status.result as Record<string, unknown>).analysis_id,
          top_issue: (status.result as Record<string, unknown>).top_issue,
          priority_improvements: (status.result as Record<string, unknown>).priority_improvements,
          verdict: (status.result as Record<string, unknown>).verdict ?? null,
          coaching_tags: (status.result as Record<string, unknown>).coaching_tags ?? [],
          spatial_summary: mergeSpatialSummary(
            extractSpatialFromAnalysisPayload(status.result as Record<string, unknown>),
            localSpatial,
          ),
          category_scores: (status.result as Record<string, unknown>).category_scores ?? [],
          session_start: sessionStart,
          match_id: timeline?.matchId ?? null,
          kills: timeline?.finalStats?.kills ?? null,
          deaths: timeline?.finalStats?.deaths ?? null,
          assists: timeline?.finalStats?.assists ?? null,
          match_result: matchResult,
          ally_score: lastScore?.allyScore ?? null,
          enemy_score: lastScore?.enemyScore ?? null,
          match_highlights: matchHighlights,
          skill_profile: nextSkillProfile,
          timing_comparisons: Array.isArray(rawTiming) ? rawTiming : [],
          duel_moments: (status.result as Record<string, unknown>).duel_moments
            ?? timeline?.duelMoments
            ?? null,
          pipeline: (status.result as Record<string, unknown>).pipeline
            ?? (status.result as Record<string, unknown>).pipeline_type
            ?? null,
        })
        mainWindow?.webContents.send('dashboard:refresh')
        tray?.setToolTip(idleTooltip(game))
        const notifAgent = agent ?? gameLabel(game)
        const notifMap = map ? ` on ${map}` : ''
        const notifBody = score != null
          ? `${notifAgent}${notifMap} — ${score}/100`
          : `${notifAgent}${notifMap}`.trim()
        notifyCoachingReady(notifBody, analysisId ?? undefined)
        if (!targetWindow.isDestroyed()) {
          targetWindow.flashFrame(true)
          targetWindow.once('focus', () => targetWindow.flashFrame(false))
        }
        if (analysisId && settingsManager?.get()?.autoOpenBrowser !== false) {
          shell.openExternal(`https://upforge.gg/${game}/results/${analysisId}`)
        }
        void (async () => {
          try {
            const profile = await authManager.fetchProfile()
            const total = profile?.user?.analysis_stats?.total ?? 0
            if (total <= 1) trackFirstAnalysis({ game, analysisId })
            else if (total === 2) trackSecondAnalysis()
          } catch { /* non-fatal */ }
        })()
      },
      onFailed: (userMessage, rawError, status) => {
        dispatchAnalysisFailure(rawError || userMessage, {
          recordingId,
          targetWindow,
          failureDiagnostics: extractFailureDiagnostics(status),
        })
        logAnalysisFailureActivity(rawError || userMessage, extractFailureDiagnostics(status))
        logActivity('Local recording kept on disk — use fight footage debug or VOD review to inspect duel windows')
        tray?.setToolTip(idleTooltip(game))
      },
      onConnectionLost: () => {
        logActivity('Analysis polling paused — lost connection (retrying automatically)')
        send('post-game:analysis-deferred', { jobId: result.job_id, reason: 'server' })
        tray?.setToolTip('UpForge — Analysis still running…')
        void runStuckAnalysisReconcile()
      },
      onPollEnded: (reason) => {
        if (reason === 'max_duration') {
          if (recordingId) {
            recordingsStore.clearAnalysisPipeline(recordingId)
            mainWindow?.webContents.send('recordings:updated')
          }
          logActivity('Analysis poll reached 90 minute cap — job may still be processing on server')
          send('post-game:analysis-deferred', { jobId: result.job_id, reason: 'server' })
          tray?.setToolTip('UpForge — Analysis still running…')
          void runStuckAnalysisReconcile()
          showAppNotification({
            title: 'UpForge — Still analysing',
            body: 'Your match is still processing. We\'ll notify you when results are ready.',
            silent: notifySilent(),
          })
        }
      },
    })
    if (recordingId) clearDeferredUploadRetry(recordingId)
    return result.job_id
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload failed'
    logActivity(`Upload failed: ${msg}`)
    tray?.setToolTip(idleTooltip(game))
    if (recordingId) {
      if (wasBackgroundWorkInterrupted(err)) {
        recordingsStore.setPipelineDeferReason(recordingId, 'recording')
        recordingsStore.setPipelineStatus(recordingId, 'pending')
        mainWindow?.webContents.send('recordings:updated')
        logActivity('Upload paused for your next match — will retry when recording ends')
        send('post-game:upload-deferred', { reason: 'recording' })
        return null
      }
      recordingsStore.setPipelineStatus(recordingId, 'pending')
      mainWindow?.webContents.send('recordings:updated')
      clearDeferredUploadRetry(recordingId)
    }

    // Quota exceeded — send upgrade prompt (no retry makes sense here)
    const isUpgradeError = err instanceof UpgradeRequiredError
      || (err instanceof Error && err.name === 'UpgradeRequiredError')
      || (err instanceof Error && /analysis.limit.reached|upgrade.required/i.test(err.message))
    if (isUpgradeError) {
      const upgradeErr = err as UpgradeRequiredError
      sendUploadFailure(msg, {
        targetWindow,
        recordingId,
        needsUpgrade: true,
        upgradeUrl: upgradeErr.upgradeUrl || 'https://upforge.gg/pricing',
        ppaUrl: upgradeErr.ppaUrl || 'https://upforge.gg/valorant/analyze',
        notify: false,
      })
      return null
    }

    reportPipelineError('upload', msg, {
      recordingId: recordingId ?? null,
      game,
      map,
      agent,
      stack: err instanceof Error ? err.stack?.slice(0, 2000) : undefined,
    })

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
    sendUploadFailure(msg, { targetWindow, recordingId: effectiveRecordingId ?? undefined, notify: false })
    return null
  } finally {
    if (recordingId) activeUploadRecordingIds.delete(recordingId)
  }
}

function createSplashWindow(): BrowserWindow {
  return _createSplashWindow()
}

async function startApp(): Promise<void> {
  await app.whenReady()
  electronApp.setAppUserModelId('gg.upforge.desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  uploadManager = new UploadManager(authManager)
  settingsManager = new SettingsManager()
  discordRPC.start()
  initFunnelEvents(authManager, app.getVersion())
  trackedPrimaryGame = normalizePrimaryGame(settingsManager.get().primaryGame)
  recordingsStore = new RecordingsStore()

  // Register IPC before any BrowserWindow loads (dev updater, macOS activate, second instance).
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
        session_start: Date.now() - 35 * 60 * 1000,
        match_id: 'dev-preview-match',
        kills: 18,
        deaths: 14,
        assists: 6,
        match_result: 'win',
        ally_score: 13,
        enemy_score: 11,
        top_issue: 'Positioning during post-plant — you were caught in the open on 4 of 6 clutch attempts.',
        priority_improvements: [
          'Hold off-angles after plant instead of wide peeking.',
          'Pre-aim head height on B site entries.',
        ],
        match_highlights: [{
          id: 'dev-h1',
          kind: 'mistake',
          title: 'Wide swing after plant',
          reason: 'Peeked A main alone with 20s left — lost the round win condition.',
          round: 11,
          videoOffsetMs: 312000,
          clipId: null,
          rank: 90,
        }],
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
  onSettingsSaved,
  () => {
    syncUserSessionFromAuth()
    trackLogin()
    trackAppOpened()
    refreshCoachNotificationPoller()
  },
  () => {
    stopCoachNotificationPoller()
    resetDesktopOnboardingPing()
    clearUserSession(userSessionDeps())
  },
  (jobId: string) => recordingsStore?.getPathByJobId(jobId) ?? null,
  )

  setupClipHandlers(ipcMain, clipStore, clipExtractor, authManager, hotkeyManager, recordingsStore, settingsManager)
  ipcHandlersReady = true

  // When a second instance is launched, bring the existing window to the front.
  app.on('second-instance', () => {
    focusMainWindow()
  })

  stopInstanceCoordinator = startInstanceCoordinator(() => {
    focusMainWindow()
  })

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
    stopCoachNotificationPoller()
    clearUserSession(userSessionDeps())
    mainWindow?.webContents.send('auth:session-expired')
  }

  // Resume polling for any job_id that was persisted before a crash.
  // We wait until the main window is ready before sending the result.
  if (authManager.isAuthenticated()) {
    syncUserSessionFromAuth()
    trackAppOpened()
    refreshCoachNotificationPoller()
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
  const killRetentionDays = settingsManager.get().clipKillRetentionDays
  if (killRetentionDays > 0) {
    const prunedKills = clipStore.pruneKillClipsByAge(killRetentionDays)
    if (prunedKills > 0) log.info(`[App] Pruned ${prunedKills} routine kill clips older than ${killRetentionDays} days`)
  }
  clipStore.pruneOrphanedThumbnails()

  runStorageMaintenanceIfReady(false)

  // Show splash launcher while we check for updates
  const splashWindow = createSplashWindow()
  const splashShownAt = Date.now()
  /** Minimum time splash stays visible (dev skips updater so needs a longer floor). */
  const splashMinMs = is.dev ? 2800 : 1800

  createTray()

  // Called when updater confirms no update pending (or errors out).
  // Close splash and open the main window.
  const launchMainApp = () => {
    const openMain = () => {
      mainWindow = createMainWindow(authManager.isAuthenticated())
      markStartupComplete()
      setupGameDetection()
      scheduleObsProbeOnWindowLoad(mainWindow, true)
      // Small delay so main window is loaded before splash closes
      setTimeout(() => {
        if (!splashWindow.isDestroyed()) splashWindow.close()
      }, 400)

      // If an orphaned job was found at startup, reconcile once before resuming a 90-min poll loop.
      mainWindow.webContents.once('did-finish-load', () => {
        reconcileInterruptedUploads()
        if (orphanedJob) {
          void handleOrphanedJobAtStartup(orphanedJob)
        }
      })
    }

    const waitMs = Math.max(0, splashMinMs - (Date.now() - splashShownAt))
    if (waitMs > 0) setTimeout(openMain, waitMs)
    else openMain()
  }

  setupAutoUpdater(splashWindow, launchMainApp, () => {
    isQuitting = true
    stopObsHealthMonitor?.()
    obsRecorder.forceStop()
  })

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

  // Discord Rich Presence — renderer can push state changes (e.g. when reviewing coaching)
  ipcMain.handle('discord:set-state', (_e, state: string) => {
    if (state === 'reviewing') discordRPC.setReviewing()
    else discordRPC.setIdle()
  })
  ipcMain.handle('discord:get-status', () => discordRPC.getStatus())

  // Developer diagnostics — full internal state snapshot for the admin panel
  ipcMain.handle('dev:get-diagnostics', async () => {
    const analysisPipeline = await buildAnalysisPipelineDiagnostics({
      uploadManager,
      recordingsStore,
      activePollJobId: getActiveAnalysisPollJobId(),
      pendingJob: readActivePendingJob(),
      activityLog: activityLog.slice(),
      localFileExists: (p) => fs.existsSync(p),
    })

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
      analysisPipeline,
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


  ipcMain.handle('post-game:sync', () => getPostGameSessionSnapshot())

  ipcMain.handle('post-game:retry-demo-scan', async () => {
    if (!lastReplayRetryContext) {
      return { ok: false as const, error: 'No recent match to scan' }
    }
    const notifyWin = postGameWindow && !postGameWindow.isDestroyed()
      ? postGameWindow
      : (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null)
    await tryAutoUploadSourceReplay({
      game: lastReplayRetryContext.game,
      demoPath: null,
      matchSessionStart: lastReplayRetryContext.matchSessionStart,
      auth: authManager,
      notifyWindow: notifyWin,
      customReplayDir: lastReplayRetryContext.customReplayDir,
      meta: lastReplayRetryContext.meta,
    })
    return { ok: true as const }
  })

  ipcMain.handle('recordings:get', async () => {
    scanForOrphanedRecordings()
    const pending = recordingsStore.getPending(linkedRiotFromAuth())
    await Promise.all(pending.map((rec) => refreshRecordingVodProbe(rec)))
    return pending.map((rec) => ({
      ...withAnalysisReadiness(rec),
      hasLocalFile: Boolean(rec.path && fs.existsSync(rec.path)),
      cloudUploaded: Boolean(rec.jobId || rec.analysisId || rec.archiveId),
    }))
  })

  ipcMain.handle('analysis:reconcile-stuck', async () => {
    const reconciled = await runStuckAnalysisReconcile()
    return { ok: true, reconciled }
  })

  ipcMain.handle('recordings:analyse', async (_e, { id }: { id: string }) => {
    let recording = recordingsStore.getById(id)
    if (!recording) {
      return { error: 'Recording not found', code: 'not_found' }
    }

    // Failed analysis with VOD already on S3 — retry without re-upload.
    if (recording.jobId && recording.lastAnalysisError) {
      dismissMatchWaitUi()
      recordingsStore.clearAnalysisFailure(id)
      recordingsStore.markAnalysed(id, recording.jobId)

      const user = authManager.getUser()
      const triggerRetry = async (win: BrowserWindow) => {
        stopActiveAnalysisPoll()
        win.webContents.send('post-game:upload-start', {
          game: recording!.game,
          map: recording!.map,
          agent: recording!.agent,
        })
        try {
          await uploadManager.retrySubmission(recording!.jobId!)
          win.webContents.send('post-game:upload-complete', { jobId: recording!.jobId })
          logActivity('Retrying analysis from cloud recording')
          tray?.setToolTip('UpForge — Analysing...')
          startAnalysisPoll({
            uploadManager,
            jobId: recording!.jobId!,
            targetWindow: win,
            mainWindow,
            onProgress: (status) => {
              const raw = status.progress
              const progress = typeof raw === 'number' && !Number.isNaN(raw)
                ? Math.min(100, Math.max(0, Math.round(raw)))
                : status.status === 'queued' ? 0 : 5
              recordingsStore.setAnalysisProgress(id, progress, status.current_step ?? null)
            },
            onCompleted: (status) => {
              const analysisId = extractAnalysisIdFromPollResult(status.result as Record<string, unknown> | undefined)
              if (analysisId != null) {
                recordingsStore.setAnalysisId(id, analysisId)
                const rec = recordingsStore.getById(id)
                if (rec?.path) {
                  maybeDeleteLocalRecordingAfterAnalysis(rec.path, {})
                }
              }
              mainWindow?.webContents.send('dashboard:refresh')
            },
            onFailed: (userMessage, rawError, status) => {
              dispatchAnalysisFailure(rawError || userMessage, {
                recordingId: id,
                targetWindow: win,
                failureDiagnostics: extractFailureDiagnostics(status),
              })
            },
            onConnectionLost: () => {},
            onPollEnded: () => {},
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to retry analysis'
          sendUploadFailure(msg, {
            targetWindow: win,
            recordingId: id,
            notify: false,
          })
        }
      }

      if (!postGameWindow || postGameWindow.isDestroyed()) {
        postGameWindow = createPostGameWindow()
        whenWebContentsReady(postGameWindow, () => void triggerRetry(postGameWindow!))
      } else {
        postGameWindow.show()
        postGameWindow.focus()
        void triggerRetry(postGameWindow)
      }
      return { ok: true }
    }

    const readinessCheck = await ensureAnalysisReadinessForAnalyse(id)
    if (!readinessCheck.ok) {
      return { error: readinessCheck.error, code: 'not_ready', state: readinessCheck.state }
    }
    recording = readinessCheck.recording

    // Dashboard analyse is unrelated to live match capture — don't block on lobby wait.
    dismissMatchWaitUi()
    recordingsStore.clearAnalysisFailure(id)

    const user = authManager.getUser()

    const triggerAnalysis = async (win: BrowserWindow) => {
      if (recording.archiveId && recording.cloudArchived && !recording.analysed) {
        stopActiveAnalysisPoll()
        win.webContents.send('post-game:upload-start', {
          game: recording.game,
          map: recording.map,
          agent: recording.agent,
        })
        try {
          let timeline = recording.timeline
          let coachingExtras: CoachingSubmissionExtras | undefined
          if (timeline && recording.game === 'valorant') {
            const prepared = await prepareTimelineForCoaching(timeline, recording.game, recording.id)
            coachingExtras = prepared.extras
            timeline = recordingsStore.getById(recording.id)?.timeline ?? timeline
            recordingsStore.updateTimeline(recording.id, timeline)
          }
          const result = await uploadManager.analyseArchive(
            recording.archiveId!,
            recording.game,
            timeline,
            coachingExtras,
          )
          recordingsStore.markAnalysed(recording.id, result.job_id)
          mainWindow?.webContents.send('recordings:updated')
          win.webContents.send('post-game:upload-complete', { jobId: result.job_id })
          logActivity('Analysis queued for cloud recording')
          tray?.setToolTip('UpForge — Analysing...')
          startAnalysisPoll({
            uploadManager,
            jobId: result.job_id,
            targetWindow: win,
            mainWindow,
            onProgress: (status) => {
              const raw = status.progress
              const progress = typeof raw === 'number' && !Number.isNaN(raw)
                ? Math.min(100, Math.max(0, Math.round(raw)))
                : status.status === 'queued' ? 0 : 5
              recordingsStore.setAnalysisProgress(recording.id, progress, status.current_step ?? null)
            },
            onCompleted: (status) => {
              const analysisId = extractAnalysisIdFromPollResult(status.result as Record<string, unknown> | undefined)
              if (analysisId != null) {
                recordingsStore.setAnalysisId(recording.id, analysisId)
                const rec = recordingsStore.getById(recording.id)
                if (rec?.path) {
                  maybeDeleteLocalRecordingAfterAnalysis(rec.path, {})
                }
              }
              mainWindow?.webContents.send('dashboard:refresh')
            },
            onFailed: (userMessage, rawError, status) => {
              dispatchAnalysisFailure(rawError || userMessage, {
                recordingId: recording.id,
                targetWindow: win,
                failureDiagnostics: extractFailureDiagnostics(status),
              })
            },
            onConnectionLost: () => {},
            onPollEnded: () => {},
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to queue analysis'
          sendUploadFailure(msg, {
            targetWindow: win,
            recordingId: recording.id,
            needsUpgrade: err instanceof UpgradeRequiredError,
            notify: false,
          })
        }
        return
      }

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

  ipcMain.handle('recordings:save-to-cloud', async (e, { id }: { id: string }) => {
    const recording = recordingsStore.getById(id)
    if (!recording) return { ok: false as const, error: 'Recording not found' }
    if (recording.cloudArchived && recording.archiveId) {
      return { ok: true as const, archiveId: recording.archiveId, alreadySaved: true }
    }
    if (!fs.existsSync(recording.path)) {
      return { ok: false as const, error: 'Recording file missing on disk' }
    }

    const user = authManager.getUser()
    const targetWindow = BrowserWindow.fromWebContents(e.sender)
      ?? (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null)
    if (!targetWindow || targetWindow.isDestroyed()) {
      return { ok: false as const, error: 'App window unavailable' }
    }

    const deleteLocal = settingsManager?.get().autoDelete ?? true
    const archiveId = await doUploadArchiveOnly(
      recording.id,
      recording.path,
      recording.riotName || user?.riot_name || '',
      recording.riotTag || user?.riot_tag || '',
      recording.game,
      recording.map,
      recording.agent,
      recording.timeline,
      targetWindow,
      deleteLocal,
    )

    if (!archiveId) {
      return { ok: false as const, error: 'Could not save recording to cloud' }
    }
    return { ok: true as const, archiveId }
  })

  let bulkPendingUploadRunning = false

  ipcMain.handle('storage:get-breakdown', () => {
    return getStorageBreakdown(
      recordingsStore,
      linkedRiotFromAuth(),
      recordingSavePath(),
    )
  })

  ipcMain.handle('storage:get-usage', async () => {
    const savePath = recordingSavePath()
    return buildStorageUsage(savePath, getActiveUserId(), recordingsStore)
  })

  ipcMain.handle('storage:get-estimate', () => {
    const savePath = recordingSavePath()
    const settings = settingsManager?.get()
    if (!settings) {
      return buildStorageEstimate(savePath, {
        recordingPreset: 'coaching',
        recordingBitrate: 5,
        fullMatchRecording: true,
      })
    }
    return buildStorageEstimate(savePath, settings)
  })

  ipcMain.handle('storage:purge-orphans', () => {
    const result = purgeUntrackedRecordingFiles(recordingsStore, recordingSavePath(), 0)
    mainWindow?.webContents.send('recordings:updated')
    mainWindow?.webContents.send('dashboard:refresh')
    return result
  })

  ipcMain.handle('storage:purge-cloud-backed', async () => {
    const result = await purgeCloudBackedLocals(
      recordingsStore,
      authManager,
      linkedRiotFromAuth(),
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
          const archiveId = await doUploadArchiveOnly(
            rec.id,
            rec.path,
            rec.riotName || user?.riot_name || '',
            rec.riotTag || user?.riot_tag || '',
            rec.game,
            rec.map,
            rec.agent,
            rec.timeline,
            mainWindow,
            true,
          )
          if (archiveId) {
            uploaded++
          } else {
            failed++
          }
        } catch (err) {
          const isUpgrade = err instanceof UpgradeRequiredError
            || (err instanceof Error && /archive.limit.reached|archive_limit_reached|analysis.limit.reached/i.test(err.message))
          if (isUpgrade) {
            stoppedEarly = true
            stopReason = err instanceof Error ? err.message : 'Cloud storage limit reached'
            break
          }
          failed++
          log.warn('[StorageUpload] Pending archive failed:', err)
        }
      }
    } finally {
      bulkPendingUploadRunning = false
      mainWindow?.webContents.send('storage:upload-progress', null)
      mainWindow?.webContents.send('recordings:updated')
      mainWindow?.webContents.send('dashboard:refresh')
    }

    if (uploaded > 0) {
      logActivity(`Saved ${uploaded} recording(s) to cloud — local copies removed`)
    }

    return { ok: true as const, uploaded, failed, stoppedEarly, stopReason }
  })

  ipcMain.handle('recordings:abort-in-flight', (_e, { id }: { id: string }) => {
    return abortInFlightAnalysisForRecording(id)
  })

  ipcMain.handle('recordings:dismiss', (_e, { id, deleteLocal = true }: { id: string; deleteLocal?: boolean }) => {
    const recording = recordingsStore.getById(id)
    if (
      recording
      && (recording.pipelineStatus === 'uploading' || recording.pipelineStatus === 'analysing'
        || (recording.analysed && recording.analysisId == null && !recording.lastAnalysisError))
    ) {
      abortInFlightAnalysisForRecording(id)
    }
    const wasLocalOnly = !!(
      recording
      && deleteLocal
      && !recording.clipsOnly
      && recording.path
      && isLocalOnlyRecording(recording)
    )
    if (wasLocalOnly) {
      const freed = deleteLocalRecordingFiles(recording!.path)
      if (freed > 0) {
        log.info(`[Recordings] Dismiss removed local file (${freed} bytes): ${recording!.path}`)
      }
    }
    recordingsStore.remove(id)
    mainWindow?.webContents.send('recordings:updated')
    return { ok: true as const, deletedLocal: wasLocalOnly }
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
      videoSyncOffsetMs: effectiveVideoSyncOffsetMs(recording.timeline),
    }
  })

  ipcMain.handle('recordings:reset-sync', (_e, { id }: { id: string }) => {
    const recording = recordingsStore.getById(id)
    if (!recording?.timeline) return { ok: false as const }
    const resetOffset = defaultVideoSyncOffsetMs(recording.timeline)
    recording.timeline.videoSyncOffsetMs = resetOffset
    recomputeTimelineVideoOffsets(recording.timeline)
    enrichTimelineSpatial(recording.timeline)
    recordingsStore.updateTimeline(id, recording.timeline)
    return { ok: true as const, videoSyncOffsetMs: resetOffset }
  })

  const _vodTrimInFlight = new Set<string>()

  ipcMain.handle('recordings:trim', async (_e, { id, startSec, endSec }: {
    id: string
    startSec: number
    endSec: number
  }) => {
    const recording = recordingsStore.getById(id)
    if (!recording?.path || !fs.existsSync(recording.path)) {
      return { ok: false as const, error: 'Local recording file not found on disk' }
    }
    if (recording.pipelineStatus === 'uploading' || recording.pipelineStatus === 'analysing') {
      return { ok: false as const, error: 'Wait for upload or analysis to finish before trimming' }
    }
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
      return { ok: false as const, error: 'End time must be after start time' }
    }
    if (endSec - startSec < 5) {
      return { ok: false as const, error: 'Trimmed VOD must be at least 5 seconds long' }
    }
    if (_vodTrimInFlight.has(id)) {
      return { ok: false as const, error: 'Trim already in progress for this recording' }
    }

    _vodTrimInFlight.add(id)
    const trimmedPath = trimmedOutputPath(recording.path)
    const cloudStale = Boolean(recording.analysisId || recording.archiveId)
    try {
      await clipExtractor.trimVod({
        sourcePath: recording.path,
        startSec,
        endSec,
        outputPath: trimmedPath,
      })
      swapMediaFileInPlace(recording.path, trimmedPath)
      if (recording.timeline) {
        applyVodTrimToTimeline(recording.timeline, { startSec, endSec })
        enrichTimelineSpatial(recording.timeline)
        recordingsStore.updateTimeline(id, recording.timeline)
      }
      recordingsStore.updatePath(id, recording.path)
      mainWindow?.webContents.send('recordings:updated')
      return {
        ok: true as const,
        newDurationSec: endSec - startSec,
        cloudStale,
      }
    } catch (err) {
      try { if (fs.existsSync(trimmedPath)) fs.unlinkSync(trimmedPath) } catch { /* ignore */ }
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false as const, error: msg }
    } finally {
      _vodTrimInFlight.delete(id)
    }
  })

  ipcMain.handle('archives:refresh-playback', async (_e, { archiveId }: { archiveId: string }) => {
    if (!archiveId) return null
    return fetchArchivePlaybackUrl(authManager, archiveId)
  })

  ipcMain.handle('recordings:refresh-playback', async (_e, { id }: { id: string }) => {
    const recording = recordingsStore.getById(id)
    if (!recording) return null
    if (recording.analysisId != null) {
      const url = await fetchRecordingPlaybackUrl(authManager, recording.analysisId)
      if (url) return url
    }
    if (recording.archiveId) {
      const url = await fetchArchivePlaybackUrl(authManager, recording.archiveId)
      if (url) return url
    }
    if (recording.jobId) {
      return fetchJobPlaybackUrl(authManager, recording.jobId)
    }
    return null
  })

  ipcMain.handle('recordings:preview-duel-window', async (_e, {
    id,
    windowStartMs,
    windowEndMs,
    momentId,
  }: {
    id: string
    windowStartMs: number
    windowEndMs: number
    momentId: string
  }) => {
    const recording = recordingsStore.getById(id)
    if (!recording?.path) {
      return { ok: false as const, error: 'Recording not found' }
    }
    const local = resolveLocalRecordingFile(recording.path) ?? recording.path
    if (!local || !fs.existsSync(local)) {
      return { ok: false as const, error: 'Local recording file missing — try Retry cloud playback' }
    }
    return extractDuelPreviewClip({
      videoPath: local,
      windowStartMs,
      windowEndMs,
      momentId,
      clipExtractor,
    })
  })

  ipcMain.handle('recordings:get-timeline', async (_e, { id }: { id: string }) => {
    const recording = recordingsStore.getById(id)
    if (!recording) return null
    const tl = recording.timeline
    if (tl) {
      recomputeTimelineVideoOffsets(tl)
      enrichTimelineSpatial(tl)
      recordingsStore.updateTimeline(id, tl)
    }
    const localPath = resolveLocalRecordingFile(recording.path)
    const cloudBacked = Boolean(
      recording.jobId
      || recording.analysisId != null
      || (recording.cloudArchived && recording.archiveId),
    )

    let videoPath: string | null = null
    if (cloudBacked) {
      if (recording.analysisId != null) {
        videoPath = await fetchRecordingPlaybackUrl(authManager, recording.analysisId)
      }
      if (!videoPath && recording.archiveId) {
        videoPath = await fetchArchivePlaybackUrl(authManager, recording.archiveId)
      }
      if (!videoPath && recording.jobId) {
        videoPath = await fetchJobPlaybackUrl(authManager, recording.jobId)
      }
    }
    if (!videoPath && localPath) {
      videoPath = localPath
    }
    return {
      id: recording.id,
      jobId: recording.jobId ?? null,
      analysisId: recording.analysisId ?? null,
      archiveId: recording.archiveId ?? null,
      videoPath,
      localFileMissing: !localPath,
      hasLocalFile: Boolean(localPath),
      cloudUploaded: cloudBacked,
      uploadedToCloud: cloudBacked,
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
      duelMoments: tl?.duelMoments ?? [],
      videoSyncOffsetMs: tl ? effectiveVideoSyncOffsetMs(tl) : 0,
    }
  })

  // Register global shortcut to show/focus window
  globalShortcut.register('CommandOrControl+Shift+U', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// Re-show window when clicking dock icon on Mac
app.on('activate', () => {
  if (!ipcHandlersReady) return
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

app.on('child-process-gone', (_event, details) => {
  log.warn('[Main] Child process gone:', details.type, details.reason)
})

app.on('before-quit', () => {
  isQuitting = true
  stopObsHealthMonitor?.()
  stopInstanceCoordinator?.()
  stopInstanceCoordinator = null
  obsRecorder.forceStop()
  if (trayRefreshInterval) clearInterval(trayRefreshInterval)
  try {
    tray?.destroy()
  } catch { /* ignore */ }
  tray = null
  cancelAllPollingTimers()
  gameDetector.stop()
  hotkeyManager.unregisterAll()
  globalShortcut.unregisterAll()
  destroyOverlay()
  discordRPC.destroy()
})

void (async () => {
  const role = await resolveInstanceLock()
  if (role === 'duplicate') {
    app.quit()
    return
  }
  await startApp()
})()
