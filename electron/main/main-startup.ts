import { FirstSessionRecovery } from './first-session-recovery'
import { setupFirstSessionRecoveryHandlers } from './ipc/first-session-recovery-ipc'
import { PracticeAppointments } from './practice-appointment'
import { setupPracticeAppointmentHandlers } from './ipc/practice-appointment-ipc'
import { Notification } from 'electron'
import { getApiBaseUrl } from './api-base'
import { openExternalSafe } from './shell-open'
import { canUseDeveloperTools, devOnly } from './dev-access'
import { createVodProbeSweep } from './vod-probe-sweep'
import { submissionFocusAreas } from '../../src/lib/submission-focus'
import { createCallRateLogger, startMainLoopLagMonitor } from './main-loop-lag'
import { saveReplay } from './valorant-replay-download'
import { ValorantReplaySync, type ReplaySyncState } from './valorant-replay-sync'
import { ValorantReplayUploader } from './valorant-replay-uploader'
import { fetchViewerReplay } from './valorant-replay-viewer'
import { setupCloudStorageHandlers } from './ipc/cloud-storage-ipc'
import { APP_VERSION } from './app-version'
import { setupReviewNotebookHandlers } from './ipc/review-notebook-ipc'
import { setupRoundReviewHandlers } from './ipc/round-review-ipc'
import { setupProgressPlanHandlers } from './ipc/progress-plan-ipc'
import { setupMarketplaceHandlers } from './ipc/marketplace-ipc'
import { setupOverstepIntegration } from './overstep-integration'
import { initProductActivity, trackProductActivity } from './product-activity'
import { backgroundWork } from './background-work'
import { matchPollPause } from './poll-pause'
import { app, BrowserWindow, ipcMain, shell, globalShortcut, powerMonitor } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { showAppNotification } from './app-notifications'
import { reportReadyNotice } from './report-ready-notice'
import { focusesReply, isFocusGame, isFocusId, parseAddFocus } from './focuses-bridge'
import { removeReady } from './ready-analyses'
import { stopCoachNotificationPoller } from './coach-notification-poller'
import { setupAutoUpdater, markStartupComplete, checkForUpdatesIfIdle } from './updater'
import { resetDesktopOnboardingPing } from './onboarding-ping'
import { buildRecorderConfig } from './obs-output-settings'
import { hasProAccess } from './subscription'
import { POST_MATCH_COPY } from '../../src/lib/post-match-copy'
import { startObsHealthMonitor } from './obs-health'
import { canHardRecoverObs } from './obs-watchdog-policy'
import { readRecentMatchReport, saveRecentMatchExports } from './recent-match-export'
import { shouldRetryFocusSync, syncMatchReports, type SyncResult } from './match-report-sync'
import { focusReportDiagnostic, readFocusSyncState, writeFocusSyncState } from './focus-state'
import { hydrateFocusResponse } from '../../src/lib/focus'
import { probeLolLcu, lolLinkedPuuidFromAuth } from './lol-lcu-api'
import { gameLabel, normalizeGameId as normalizePrimaryGame } from './game-config'
import { resolveMatchSessionStartMs } from './recording-sync'
import { UploadManager } from './upload-manager'
import { readAiTraining, saveAiTraining } from './ai-training'
import { readAccountDeletion, requestAccountDeletion, cancelAccountDeletion, readAccountExport, requestAccountExport, isSafeDownloadUrl } from './account-deletion'
import { resolveUploadPlayerIdentity } from './upload-player-identity'
import { clearUserSession, readActivePendingJob, getActiveUserId } from './user-session'
import { localMediaRoot, userRecordingsDir, legacyGlobalRecordingsDir } from './user-data-paths'
import { extractAnalysisIdFromPollStatus, asCompletedPollStatus, isTerminalPollSuccess } from './analysis-completion'
import { startAnalysisPoll, stopActiveAnalysisPoll, getActiveAnalysisPollJobId } from './analysis-poll'
import { buildAnalysisPipelineDiagnostics } from './analysis-pipeline-diagnostics'
import { SettingsManager } from './settings-manager'
import { setupIpcHandlers, setupClipHandlers } from './ipc-handlers'
import { initFunnelEvents, trackAppOpened, trackLogin, trackFirstMatchSynced } from './funnel-events'
import { UpgradeRequiredError } from './errors'
import { RecordingsStore, riotAccountRole, type PendingRecording } from './recordings-store'
import { rowTimelineSummary } from './recordings-store-files'
import { requestOverlayToggle, sendOverlayData, isOverlayVisible } from './overlay-window'
import { deliverInGameFeedback } from './in-game-feedback'
import { captureAndSaveScreenshot } from './screenshot-capture'
import log from 'electron-log'
import { reportError } from './error-reporter'
import { setupStorageHandlers } from './ipc/storage-ipc'
import { setupValorantRankHandlers } from './ipc/valorant-rank-ipc'
import { setupRecordingsHandlers } from './ipc/recordings-ipc'
import { tryAutoUploadSourceReplay } from './post-match-replay'
import { whenWebContentsReady } from './window-manager'
import { requestPostGameDebrief as _requestPostGameDebrief } from './post-game-api'
import { enrichTimelineForCoaching } from './match-coaching-enrich'
import { enrichLolTimelineForCoaching } from './lol-match-v5-enrich'
import { formatSupportBundle, getLastUploadNetworkError, runNetworkDiagnostics } from './network-diagnostics'
import { getAnalysisReadiness, getVodFileReadiness, withAnalysisReadiness } from './analysis-readiness'
import { getPostGameSessionSnapshot, isPostGameSessionForRecording, sendPostGameEventForRecording } from './post-game-session'
import { hasRichMatchData } from './match-data-quality'
import { buildCoachingSubmissionExtras, type CoachingSubmissionExtras } from './match-coaching-context'
import { startInstanceCoordinator } from './instance-coordinator'
import { isGsiMatchLive, isGsiMatchEnded } from './steam-gsi-server'
import { isDeadlockReadyToRecord, isDeadlockMatchEnded, isDeadlockMatchLive } from './deadlock-match-watcher'
import { FaceitLinkStore, registerCs2FaceitMatchIpc } from './cs2-faceit-match'
import { setupCoachFlowDemoHandlers } from './ipc/coach-flow-demo-ipc'
import { setupCoachFlowLiveHandlers } from './ipc/coach-flow-live-ipc'
import { resendMatchDataForRetry } from './retry-match-data'
import { cs2StartingReportMatches } from './cs2-starting-report'
import { registerEnemyHabitsIpc } from './ipc/enemy-habits-ipc'
import { setupGameDataCaptureHandlers } from './ipc/game-data-capture-ipc'
import { pregameQuery, sanitizePregameContext } from './pregame-view'
import { findDeepLinkInArgv } from './deep-link'
import { isReplayRetryContextEligible } from './match-end-timeline'
import { startDeadlockReplayReview } from './deadlock-review'
import { isDeadlockReviewJobId } from './recordings-store'
import { SourceReplayUploader } from './source-replay-uploader'
import { cs2MatchExtras, createCs2FocusChecker } from './cs2-focus-check'
import { lastAnalysisJob } from './analysis-trace'
import { findLatestReplay } from './source-replay-finder'
import { isTrustedRendererUrl } from './renderer-trust'
import { initValorantContentFallback } from './valorant-content-fallback'
import type { MainRuntimeBindings } from './main-runtime-context'

export type MainStartupContext = Pick<MainRuntimeBindings,
  | 'abortInFlightAnalysisForRecording'
  | 'acceptDeepLink'
  | 'activeUploadRecordingIds'
  | 'activityLog'
  | 'authManager'
  | 'backgroundMatchState'
  | 'beginMatchPerformanceMode'
  | 'bindPostGameSessionToRecording'
  | 'cancelAnalysisReadinessRefresh'
  | 'captureOwnerId'
  | 'captureOwnership'
  | 'clearAccountScopedRuntimeState'
  | 'clipExtractor'
  | 'clipFfmpegProbe'
  | 'clipStore'
  | 'createMainLagReporter'
  | 'createMainWindow'
  | 'createPostGameWindow'
  | 'createSplashWindow'
  | 'createTray'
  | 'currentRecordingOwnerGame'
  | 'currentRecordingStartTime'
  | 'discordRPC'
  | 'dismissMatchWaitUi'
  | 'dispatchAnalysisFailure'
  | 'dispatchReconciledAnalysisReady'
  | 'doUploadArchiveOnly'
  | 'endMatchPerformanceMode'
  | 'enforceRecordingPresetAccess'
  | 'enqueuePostMatchAnalyse'
  | 'enrichTimelineSpatial'
  | 'ensureAnalysisReadinessForAnalyse'
  | 'ensureObsReady'
  | 'extractFailureDiagnostics'
  | 'extractMatchClips'
  | 'ffmpegOk'
  | 'focusMainWindow'
  | 'gameDetector'
  | 'getRecordingBackendForStatus'
  | 'guestClaimDeclinedFor'
  | 'handleOrphanedJobAtStartup'
  | 'hotkeyBookmarks'
  | 'hotkeyManager'
  | 'inGameFeedbackDeps'
  | 'interruptBackgroundWorkForMatch'
  | 'ipcHandlersReady'
  | 'isQuitting'
  | 'lastMatchDiagnostic'
  | 'lastReplayRetryContext'
  | 'linkAutoDeadlockReviewJob'
  | 'linkedLolAccountsFromAuth'
  | 'linkedRiotAccountsFromAuth'
  | 'linkedRiotFromAuth'
  | 'logActivity'
  | 'lolLiveClientApi'
  | 'mainWindow'
  | 'manualEndMatchRecording'
  | 'matchCapturePriority'
  | 'matchDetectInFlightDepth'
  | 'matchPriorityDeps'
  | 'maybeCaptureRiotDnsEvidence'
  | 'maybeDeleteLocalRecordingAfterAnalysis'
  | 'maybeResumeDeferredUploads'
  | 'notifyRecordingsUpdated'
  | 'notifySilent'
  | 'obsRecorder'
  | 'obsStartupTask'
  | 'obsWatchdogSnapshot'
  | 'offerGuestMediaClaim'
  | 'onSettingsSaved'
  | 'orphanRecoveryMessage'
  | 'overlayAutoHideTimer'
  | 'overstepBridge'
  | 'pendingDeepLink'
  | 'performanceManager'
  | 'postGameWindow'
  | 'prepareLegacyOrphanRecoveryRows'
  | 'prepareTimelineForCoaching'
  | 'productionVodFixtures'
  | 'readyAnalysesList'
  | 'reconcileInterruptedUploads'
  | 'recordingFileFinalizer'
  | 'recordingSavePath'
  | 'recordingsStore'
  | 'recoverOrphanedValorantMetadata'
  | 'refreshCoachNotificationPoller'
  | 'refreshRecordingVodProbe'
  | 'refreshReplayTimelineForRecording'
  | 'reportMainLag'
  | 'resumePollForJob'
  | 'resumeSavedLocalMedia'
  | 'resumeStuckMatchStatsEnrichment'
  | 'riotLocalApi'
  | 'rowLocalExpiresAt'
  | 'runStorageMaintenanceIfReady'
  | 'runStuckAnalysisReconcile'
  | 'saveReadyAnalyses'
  | 'scanForOrphanedRecordings'
  | 'scheduleAnalysisReadinessRefresh'
  | 'scheduleFocusSyncAfterMatch'
  | 'scheduleObsProbeOnWindowLoad'
  | 'sendUploadFailure'
  | 'settingsManager'
  | 'setupGameDetection'
  | 'showDevelopmentPostGamePreview'
  | 'stopInstanceCoordinator'
  | 'stopObsHealthMonitor'
  | 'supportActivity'
  | 'syncUserSessionFromAuth'
  | 'trackedPrimaryGame'
  | 'trainerBridge'
  | 'tray'
  | 'uploadManager'
  | 'userSessionDeps'
  | 'valorantRankService'
  | 'waitingForMatch'
  | 'watchDeadlockReview'
  | 'wireObsConnectionEvents'
>

/** Keeps callbacks bound to the live application state rather than a startup snapshot. */
export function createMainStartup(mainProcess: MainStartupContext) {
  async function startApp(): Promise<void> {
    await app.whenReady()
    electronApp.setAppUserModelId('gg.upforge.desktop')
    mainProcess.reportMainLag = mainProcess.createMainLagReporter()
    startMainLoopLagMonitor((message, lagMs) => {
      log.warn(message)
      mainProcess.reportMainLag({ kind: 'main_stall', stallMs: lagMs })
    })

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    backgroundWork.configure(() => mainProcess.matchPriorityDeps().isRecording())
    initValorantContentFallback(app.getPath('userData'))
    mainProcess.uploadManager = new UploadManager(mainProcess.authManager)
    mainProcess.settingsManager = new SettingsManager()
    mainProcess.overstepBridge = setupOverstepIntegration(mainProcess.obsRecorder,
      () => buildRecorderConfig(mainProcess.settingsManager.get(), hasProAccess(mainProcess.authManager.getUser()), mainProcess.captureOwnerId()),
      () => mainProcess.waitingForMatch || mainProcess.matchDetectInFlightDepth > 0 || mainProcess.gameDetector.currentGame() !== null,
      active => active ? mainProcess.beginMatchPerformanceMode({ holdPostMatch: true }) : mainProcess.endMatchPerformanceMode(),
    )
    mainProcess.discordRPC.start()
    initFunnelEvents(mainProcess.authManager, APP_VERSION)
    initProductActivity(mainProcess.authManager, APP_VERSION)
    mainProcess.clipStore.onAdded = (clip, ownerId) => {
      trackProductActivity('clip_created', clip.game, ownerId)
      if (clip.trigger === 'manual' || clip.trigger === 'hotkey') {
        trackProductActivity('manual_clip_created', clip.game, ownerId)
      }
    }
    const activityPresenceTimer = setInterval(() => {
      if (mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed() && mainProcess.mainWindow.isFocused() && !mainProcess.mainWindow.isMinimized()) trackProductActivity('app_foreground', 'unknown')
    }, 300_000)
    activityPresenceTimer.unref()
    app.once('will-quit', () => clearInterval(activityPresenceTimer))
    mainProcess.trackedPrimaryGame = normalizePrimaryGame(mainProcess.settingsManager.get().primaryGame)
    mainProcess.recordingsStore = new RecordingsStore()
    // A parsed CS2 demo counts for the player's focus without its report page being opened.
    const cs2FocusChecker = createCs2FocusChecker({
      isAuthenticated: () => mainProcess.authManager.isAuthenticated(),
      markCounted: (id, jobId) => { mainProcess.recordingsStore.markCs2FocusCounted(id, jobId) },
      post: async (path, body) => (await mainProcess.authManager.getApi().post(path, body, { validateStatus: () => true, timeout: 30000 }).catch(() => null))?.status ?? null,
      log,
    })
    mainProcess.recordingsStore.timelineListener = (rec) => { void cs2FocusChecker.check(rec) }
    const finalizingFileTimer = setInterval(() => { void mainProcess.recordingFileFinalizer.tick() }, 5000)
    finalizingFileTimer.unref()
    app.once('will-quit', () => clearInterval(finalizingFileTimer))

    // Register IPC before any BrowserWindow loads (dev updater, macOS activate, second instance).
    setupIpcHandlers(ipcMain, mainProcess.authManager, () => mainProcess.obsRecorder, mainProcess.gameDetector, mainProcess.settingsManager, mainProcess.showDevelopmentPostGamePreview, () => mainProcess.ffmpegOk, () => mainProcess.waitingForMatch, () => mainProcess.activityLog.slice(), mainProcess.uploadManager, () => {
      // Show main window and navigate to clips tab
      if (mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed()) {
        mainProcess.mainWindow.show()
        mainProcess.mainWindow.focus()
        mainProcess.mainWindow.webContents.send('app:navigate', '/clips')
      }
    }, (target: string | { path: string; query?: Record<string, string> }) => {
      if (mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed()) {
        if (mainProcess.mainWindow.isMinimized()) mainProcess.mainWindow.restore()
        mainProcess.mainWindow.show()
        mainProcess.mainWindow.focus()
        mainProcess.mainWindow.webContents.send('app:navigate', target)
      } else {
        mainProcess.focusMainWindow()
        if (mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed()) {
          mainProcess.mainWindow.webContents.send('app:navigate', target)
        }
      }
    }, mainProcess.performanceManager, mainProcess.obsRecorder, mainProcess.trainerBridge,
    async (game: string) => {
      if (mainProcess.manualEndMatchRecording) return mainProcess.manualEndMatchRecording(game)
      if (!mainProcess.obsRecorder.isRecording()) return { ok: false, reason: 'not_recording' }
      try {
        await mainProcess.obsRecorder.stop()
        if (mainProcess.obsRecorder.hasRecordingFailure()) return { ok: false, reason: mainProcess.obsRecorder.getLastError() ?? 'OBS stop failed' }
        return { ok: true }
      } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message : String(err) }
      }
    },
    mainProcess.getRecordingBackendForStatus,
    () => mainProcess.riotLocalApi.getLastGameMode(),
    undefined,
    () => mainProcess.obsRecorder.isConnected(),
    () => mainProcess.gameDetector.isValorantClientOpen(),
    mainProcess.onSettingsSaved,
    () => {
      mainProcess.syncUserSessionFromAuth()
      trackLogin()
      trackAppOpened()
      mainProcess.refreshCoachNotificationPoller()
    },
    () => {
      stopCoachNotificationPoller()
      resetDesktopOnboardingPing()
      mainProcess.captureOwnership.set(null)
      mainProcess.guestClaimDeclinedFor = null
      mainProcess.clearAccountScopedRuntimeState()
      clearUserSession(mainProcess.userSessionDeps())
      mainProcess.riotLocalApi.setLinkedAccountRegion(null)
    },
    (jobId: string) => mainProcess.recordingsStore?.getPathByJobId(jobId) ?? null,
    () => mainProcess.obsStartupTask,
    mainProcess.currentRecordingOwnerGame,
    )

    setupFirstSessionRecoveryHandlers(ipcMain, new FirstSessionRecovery({
      userDataPath: app.getPath('userData'), appVersion: APP_VERSION,
      session: () => {
        const owner = mainProcess.authManager.getUser()?.id; const token = mainProcess.authManager.getToken()
        return typeof owner === 'number' && token ? { owner, token } : null
      },
      recordings: owner => mainProcess.recordingsStore.forUser(owner).getAll(),
      safeForeground: () => !!mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed() && mainProcess.mainWindow.isFocused() && mainProcess.mainWindow.isVisible()
        && !mainProcess.gameDetector.currentGame() && !mainProcess.matchCapturePriority && !mainProcess.backgroundMatchState.active && !mainProcess.obsRecorder.isActivelyRecording(),
      busy: id => mainProcess.activeUploadRecordingIds.has(id),
      post: async (session, endpoint, data) => (await mainProcess.authManager.getApi().post(endpoint, data, {
        headers: { Authorization: `Bearer ${session.token}` }, timeout: 8000,
      })).data,
    }))

    setupPracticeAppointmentHandlers(ipcMain, new PracticeAppointments({
      userDataPath: app.getPath('userData'),
      session: () => {
        const owner = mainProcess.authManager.getUser()?.id; const token = mainProcess.authManager.getToken()
        return typeof owner === 'number' && token ? { owner, token } : null
      },
      safeForeground: () => !!mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed() && mainProcess.mainWindow.isFocused() && mainProcess.mainWindow.isVisible()
        && !mainProcess.gameDetector.currentGame() && !mainProcess.matchCapturePriority && !mainProcess.backgroundMatchState.active && !mainProcess.obsRecorder.isActivelyRecording(),
      request: async (session, method, endpoint, data) => (await mainProcess.authManager.getApi().request({
        method, url: endpoint, data, headers: { Authorization: `Bearer ${session.token}` }, timeout: 8000,
      })).data,
      notify: (title, onClick) => new Promise(resolve => {
        if (!Notification.isSupported()) { resolve('failed'); return }
        const notification = new Notification({ title: 'Your saved practice task', body: title, silent: true })
        const timer = setTimeout(() => resolve('unknown'), 5000)
        notification.once('show', () => { clearTimeout(timer); resolve('delivered') })
        notification.once('failed', () => { clearTimeout(timer); resolve('failed') })
        notification.once('click', onClick)
        notification.show()
      }),
      openPractice: drillId => { mainProcess.focusMainWindow(); mainProcess.mainWindow?.webContents.send('app:navigate', `/training?appointmentDrill=${drillId}`) },
    }))

    setupClipHandlers(ipcMain, mainProcess.clipStore, mainProcess.clipExtractor, mainProcess.authManager, mainProcess.hotkeyManager, mainProcess.recordingsStore, mainProcess.settingsManager)
    mainProcess.ipcHandlersReady = true

    // When a second instance is launched, bring the existing window to the front.
    app.on('second-instance', (_event, argv) => {
      // ── Deep links (Windows/Linux): the link arrives as an argument of the second launch.
      mainProcess.acceptDeepLink(findDeepLinkInArgv(argv))
      mainProcess.focusMainWindow()
    })

    // ── Deep links: only the renderer of the main window may take the held action, and only when signed in.
    ipcMain.handle('deep-link:take-pending', (event) => {
      if (!mainProcess.mainWindow || mainProcess.mainWindow.isDestroyed() || event.sender !== mainProcess.mainWindow.webContents) return null
      return mainProcess.pendingDeepLink.take(mainProcess.authManager.isAuthenticated())
    })

    mainProcess.stopInstanceCoordinator = startInstanceCoordinator(() => {
      mainProcess.focusMainWindow()
    })

    // Restore auth session from keychain before creating window. A slow or offline launch opens with the
    // saved user and keeps retrying; waking the PC or unlocking it retries straight away.
    try {
      await mainProcess.authManager.loadStoredToken()
    } catch (err) {
      log.warn('[App] Failed to restore auth token — starting unauthenticated:', err)
    }
    const recheckSession = () => { void mainProcess.authManager.refreshUserNow().catch(() => false) }
    powerMonitor.on('resume', recheckSession)
    powerMonitor.on('unlock-screen', recheckSession)
    mainProcess.enforceRecordingPresetAccess()

    // When a 401 fires mid-session, tell the renderer to show the login screen
    mainProcess.authManager.onSessionExpired = () => {
      log.warn('[App] Session expired — notifying renderer')
      stopCoachNotificationPoller()
      mainProcess.clearAccountScopedRuntimeState()
      clearUserSession(mainProcess.userSessionDeps())
      mainProcess.riotLocalApi.setLinkedAccountRegion(null)
      mainProcess.mainWindow?.webContents.send('auth:session-expired')
    }

    // Resume polling for any job_id that was persisted before a crash.
    // We wait until the main window is ready before sending the result.
    if (mainProcess.authManager.isAuthenticated()) {
      mainProcess.syncUserSessionFromAuth()
      trackAppOpened()
      mainProcess.refreshCoachNotificationPoller()
    }
    const orphanedJob = readActivePendingJob()
    if (orphanedJob) {
      console.log('[App] Orphaned job found from previous session:', orphanedJob.job_id)
    }

    // Prune old clips on startup if retention is configured
    const retentionDays = mainProcess.settingsManager.get().clipRetentionDays
    if (retentionDays > 0) {
      const pruned = mainProcess.clipStore.pruneByAge(retentionDays)
      if (pruned > 0) log.info(`[App] Pruned ${pruned} clips older than ${retentionDays} days`)
    }
    const killRetentionDays = mainProcess.settingsManager.get().clipKillRetentionDays
    if (killRetentionDays > 0) {
      const prunedKills = mainProcess.clipStore.pruneKillClipsByAge(killRetentionDays)
      if (prunedKills > 0) log.info(`[App] Pruned ${prunedKills} routine kill clips older than ${killRetentionDays} days`)
    }
    mainProcess.clipStore.pruneOrphanedThumbnails()

    mainProcess.runStorageMaintenanceIfReady(false)

    // Show splash launcher while we check for updates
    const splashWindow = mainProcess.createSplashWindow()
    const splashShownAt = Date.now()
    /** Minimum time splash stays visible (dev skips updater so needs a longer floor). */
    const splashMinMs = is.dev ? 2800 : 1800

    mainProcess.createTray()

    // Called when updater confirms no update pending (or errors out).
    // Close splash and open the main window.
    const launchMainApp = () => {
      const openMain = () => {
        mainProcess.mainWindow = mainProcess.createMainWindow(mainProcess.authManager.isAuthenticated())
        markStartupComplete()
        mainProcess.mainWindow.on('focus', () => {
          checkForUpdatesIfIdle()
          trackProductActivity('app_foreground', 'unknown')
          void mainProcess.valorantRankService?.refresh('focus') // throttled to once per 2 min
        })
        void mainProcess.valorantRankService?.refresh('start')
        mainProcess.setupGameDetection()
        mainProcess.scheduleObsProbeOnWindowLoad(mainProcess.mainWindow, true)
        // Small delay so main window is loaded before splash closes
        setTimeout(() => {
          if (!splashWindow.isDestroyed()) splashWindow.close()
        }, 400)

        // If an orphaned job was found at startup, reconcile once before resuming a 90-min poll loop.
        mainProcess.mainWindow.webContents.once('did-finish-load', () => {
          mainProcess.reconcileInterruptedUploads()
          if (orphanedJob) {
            void mainProcess.handleOrphanedJobAtStartup(orphanedJob).then(() => mainProcess.runStuckAnalysisReconcile())
          }
          // Pending Valorant VODs can sit forever on "waiting for match stats" after the
          // post-match poll window — resume enrich when the app opens again.
          mainProcess.resumeStuckMatchStatsEnrichment()
          mainProcess.resumeSavedLocalMedia()
          void mainProcess.offerGuestMediaClaim()
        })
      }

      const waitMs = Math.max(0, splashMinMs - (Date.now() - splashShownAt))
      if (waitMs > 0) setTimeout(openMain, waitMs)
      else openMain()
    }

    setupAutoUpdater(splashWindow, launchMainApp, () => {
      mainProcess.isQuitting = true
      mainProcess.stopObsHealthMonitor?.()
      mainProcess.obsRecorder.forceStop()
    })

    // ffmpeg is only used for post-match clip extraction — verify bundled binary early.
    mainProcess.clipFfmpegProbe.preflight().then((result) => {
      mainProcess.ffmpegOk = result.ok
      if (!result.ok) {
        console.error('[App] Clip ffmpeg preflight FAILED:', result.error)
        mainProcess.mainWindow?.webContents.send('app:ffmpeg-status', { ok: false })
      } else {
        console.log('[App] Clip ffmpeg preflight OK')
      }
    }).catch((err) => {
      console.error('[App] Clip ffmpeg preflight threw unexpectedly:', err)
      mainProcess.ffmpegOk = false
    })

    mainProcess.wireObsConnectionEvents()
    mainProcess.stopObsHealthMonitor = startObsHealthMonitor(mainProcess.obsRecorder, () => mainProcess.mainWindow, {
      logActivity: mainProcess.logActivity,
      canHardRecover: () => canHardRecoverObs(mainProcess.obsWatchdogSnapshot({ processRunning: true })),
      recover: () => mainProcess.ensureObsReady({ allowProcessRestart: true }),
    })

    // Discord Rich Presence — renderer can push state changes (e.g. when reviewing coaching)
    ipcMain.handle('discord:set-state', (_e, state: string) => {
      if (state === 'reviewing') mainProcess.discordRPC.setReviewing()
      else mainProcess.discordRPC.setIdle()
    })
    // Deadlock "Review replay": user-started only (uses 1 analysis); the renderer confirms first.
    ipcMain.handle('deadlock:review-replay', async (event, recordingId: unknown) => {
      const senderUrl = event.senderFrame?.url
      if (!senderUrl || !isTrustedRendererUrl(senderUrl)) return { ok: false as const, error: 'Untrusted request' }
      if (typeof recordingId !== 'string' || !recordingId) return { ok: false as const, error: 'Unknown recording' }
      if (!mainProcess.authManager.getToken()) return { ok: false as const, error: 'Sign in to review replays.' }
      const result = await startDeadlockReplayReview({
        getRecording: id => mainProcess.recordingsStore.getById(id),
        findReplay: async (rec) => {
          const start = resolveMatchSessionStartMs(rec.timeline, rec.recordedAt)
          const found = await findLatestReplay('deadlock', start, undefined, { pollOnce: true })
          return found.found ? found.demoPath : null
        },
        upload: async (demoPath) => {
          try {
            const user = mainProcess.authManager.getUser()
            const steamId = user?.deadlock_account_id != null
              ? String(BigInt(user.deadlock_account_id) + BigInt('76561197960265728'))
              : null
            const { jobId } = await new SourceReplayUploader(mainProcess.authManager).upload({
              game: 'deadlock', demoPath, steamId,
              onProgress: (pct) => { try { event.sender.send('deadlock:upload-progress', { demoPath, pct }) } catch { /* window closed */ } },
            })
            return isDeadlockReviewJobId(jobId) ? { ok: true as const, jobId } : { ok: false as const, error: 'The review did not start.' }
          } catch (err) {
            return { ok: false as const, error: err instanceof Error ? err.message : 'Upload failed.' }
          }
        },
        setJob: (id, jobId) => mainProcess.recordingsStore.setDeadlockReviewJob(id, jobId),
      }, recordingId)
      if (result.ok) {
        mainProcess.notifyRecordingsUpdated()
        mainProcess.watchDeadlockReview(recordingId)
      }
      return result
    })
    setupReviewNotebookHandlers(ipcMain, mainProcess.authManager)
    // ── Dev only: "Replay a real match" coach-flow demo (local AI, production data read-only) ──
    if (is.dev) {
      setupCoachFlowDemoHandlers(ipcMain, mainProcess.authManager, (event) => {
        const url = event.senderFrame?.url
        return !!url && isTrustedRendererUrl(url)
      })
    }
    setupRoundReviewHandlers(ipcMain, mainProcess.authManager)
    // Progress v3: roadmap week + skill profile (read-only)
    setupProgressPlanHandlers(ipcMain, mainProcess.authManager)
    setupCoachFlowLiveHandlers(ipcMain, mainProcess.authManager, (event) => {
      const url = event.senderFrame?.url
      return !!url && isTrustedRendererUrl(url)
    })
    // Coach marketplace (UI v3): read-only browse + my bookings
    setupMarketplaceHandlers(ipcMain, mainProcess.authManager)
    registerCs2FaceitMatchIpc(ipcMain, () => mainProcess.authManager.getApi(), new FaceitLinkStore(app.getPath('userData')))
    // r7-val: enemy habits for the match page (read-only, local data).
    registerEnemyHabitsIpc(ipcMain, (id) => mainProcess.recordingsStore.getById(id)?.timeline ?? null)
    setupCloudStorageHandlers(ipcMain, mainProcess.authManager, (file) => {
      if (file.kind === 'clip') {
        for (const clip of mainProcess.clipStore.getAll()) if (String(clip.apiClipId) === file.id) mainProcess.clipStore.update(clip.id, { apiClipId: null, uploadStatus: 'local' })
      }
    })
    ipcMain.handle('ai-training:get', async () => {
      if (!mainProcess.authManager.isAuthenticated()) return { optOut: null }
      return readAiTraining(mainProcess.authManager.getApi())
    })
    ipcMain.handle('ai-training:set', async (_event, optOut: unknown) => {
      return saveAiTraining(mainProcess.authManager.getApi(), optOut === true)
    })
    // Self-serve account deletion + data download (server-side grace period; see account-deletion.ts).
    const signedOut = { ok: false as const, error: 'Sign in to manage your account.' }
    ipcMain.handle('account:deletion-get', async () => {
      if (!mainProcess.authManager.isAuthenticated()) return { pending: null, summary: null }
      return readAccountDeletion(mainProcess.authManager.getApi())
    })
    ipcMain.handle('account:deletion-request', async (_event, password: unknown, confirmEmail: unknown) => {
      if (!mainProcess.authManager.isAuthenticated()) return signedOut
      return requestAccountDeletion(mainProcess.authManager.getApi(), password, confirmEmail)
    })
    ipcMain.handle('account:deletion-cancel', async () => {
      if (!mainProcess.authManager.isAuthenticated()) return signedOut
      return cancelAccountDeletion(mainProcess.authManager.getApi())
    })
    ipcMain.handle('account:export-get', async () => {
      if (!mainProcess.authManager.isAuthenticated()) return null
      return readAccountExport(mainProcess.authManager.getApi())
    })
    ipcMain.handle('account:export-request', async () => {
      if (!mainProcess.authManager.isAuthenticated()) return signedOut
      return requestAccountExport(mainProcess.authManager.getApi())
    })
    // The link is re-read from the API here, never taken from the renderer.
    ipcMain.handle('account:export-open', async () => {
      if (!mainProcess.authManager.isAuthenticated()) return signedOut
      const current = await readAccountExport(mainProcess.authManager.getApi())
      if (!isSafeDownloadUrl(current?.download_url)) return { ok: false, error: 'The download link has expired. Request a new one.' }
      return openExternalSafe(current.download_url)
    })
    ipcMain.handle('coaching:preferences', async () => {
      return (await mainProcess.authManager.getApi().get('/api/user/coaching-preferences')).data
    })
    ipcMain.handle('coaching:save-preferences', async (_event, preferences: unknown) => {
      return (await mainProcess.authManager.getApi().put('/api/user/coaching-preferences', preferences)).data
    })
    ipcMain.handle('coaching:pregame', async () => {
      const context = await mainProcess.riotLocalApi.getPregameContext()
      if (!context?.agent || !context.map) return { reason: 'missing_match_context' }
      return (await mainProcess.authManager.getApi().post('/api/progress/pregame-brief', null, { params: {
        manual: 1, match_id: context.matchId, agent: context.agent, map: context.map,
        mode: context.mode, ally_agents: context.allyAgents.join(','), enemy_agents: context.enemyAgents.join(','),
      } })).data
    })
    // Read-only brief for Home during agent select (GET: never sends a DM, no AI spend).
    ipcMain.handle('coaching:pregame-view', async (event, raw: unknown) => {
      if (!mainProcess.mainWindow || event.sender !== mainProcess.mainWindow.webContents || !mainProcess.authManager.isAuthenticated()) return null
      const ctx = sanitizePregameContext(raw)
      if (!ctx) return null
      try {
        return (await mainProcess.authManager.getApi().get('/api/progress/pregame-brief', { params: pregameQuery(ctx), timeout: 15_000 })).data
      } catch {
        return null
      }
    })
    ipcMain.handle('coaching:debrief', async (event, id: string) => {
      const ownerId = getActiveUserId()
      if (ownerId === null) return { error: 'Please sign in first.' }
      const recording = mainProcess.recordingsStore.getById(id)
      if (!recording || recording.game !== 'valorant' || !recording.timeline) {
        return { error: 'Match data is not ready yet.' }
      }
      const targetWindow = BrowserWindow.fromWebContents(event.sender)
      sendPostGameEventForRecording(targetWindow, id, 'post-game:debrief-loading', undefined, ownerId)
      await _requestPostGameDebrief({
        riotName: recording.riotName, riotTag: recording.riotTag,
        agent: recording.agent, map: recording.map, timeline: recording.timeline,
        manual: true, getToken: () => mainProcess.authManager.getToken(),
        apiUrl: getApiBaseUrl(),
        sendToWindow: (channel, payload) => {
          const win = BrowserWindow.fromWebContents(event.sender)
          if (win) sendPostGameEventForRecording(win, id, channel, payload, ownerId)
        },
      })
      return { ok: true }
    })
    ipcMain.handle('discord:get-status', () => mainProcess.discordRPC.getStatus())

    // Developer/debug channels refuse in packaged builds unless dev mode is on or the user is an admin.
    const canUseDevTools = () => canUseDeveloperTools({
      isDev: is.dev,
      devModeEnabled: mainProcess.settingsManager.get().devModeEnabled,
      isAdmin: mainProcess.authManager.getUser()?.is_admin,
    })

    // Developer diagnostics — full internal state snapshot for the admin panel
    // Developer test: download the latest own Valorant replay (.vrf) into userData/valorant-replays.
    ipcMain.handle('dev:valorant-replay:download', devOnly(canUseDevTools, 'dev:valorant-replay:download', async (_event, args?: { matchId?: string }) => {
      const res = await mainProcess.riotLocalApi.downloadOwnReplay(args?.matchId)
      if (!res.ok) return { ok: false as const, error: res.error, matchId: res.matchId }
      const dir = join(app.getPath('userData'), 'valorant-replays')
      const file = saveReplay(dir, res.matchId!, res.bytes)
      return { ok: true as const, matchId: res.matchId!, file, bytes: res.bytes.length, gameVersion: res.gameVersion }
    }))

    // Replay sync: after matches, download the player's own replays from Riot and upload them for coaching.
    const replaySyncFile = join(app.getPath('userData'), 'valorant-replay-sync.json')
    const replayUploader = new ValorantReplayUploader(() => mainProcess.authManager.getToken(), app.getVersion())
    const replaySync = new ValorantReplaySync({
      enabled: () => mainProcess.settingsManager.get().valorantReplayUpload !== false && !!mainProcess.authManager.getToken(),
      isMatchActive: () => mainProcess.riotLocalApi.isMatchActive(),
      listRecentMatches: (n) => mainProcess.riotLocalApi.listRecentMatches(n),
      download: (id) => mainProcess.riotLocalApi.downloadOwnReplay(id),
      upload: (id, bytes, m) => replayUploader.upload(id, bytes, m),
      report: (id, error, m) => replayUploader.report(id, error, m),
      loadState: () => {
        try { return JSON.parse(fs.readFileSync(replaySyncFile, 'utf8')) as ReplaySyncState } catch { return {} }
      },
      saveState: (state) => {
        // Keep the newest 200 entries; older matches can't be downloaded again anyway (replays expire each patch).
        const kept = Object.fromEntries(Object.entries(state).sort((a, b) => b[1].lastTryMs - a[1].lastTryMs).slice(0, 200))
        try { fs.writeFileSync(replaySyncFile, JSON.stringify(kept)) } catch (err) { log.warn('[ReplaySync] save failed', err) }
      },
      // electron-log so replay sync shows up in main.log next to [MainLag] when diagnosing post-match lag.
      log: (msg) => log.info(msg),
    })
    const runReplaySync = () => { void replaySync.run().catch((err) => log.warn('[ReplaySync] run failed', err)) }
    setTimeout(runReplaySync, 90_000)
    setInterval(runReplaySync, 5 * 60_000)
    ipcMain.handle('dev:valorant-replay:sync', devOnly(canUseDevTools, 'dev:valorant-replay:sync', async () => ({ run: await replaySync.run(), state: replaySync.status() })))
    ipcMain.handle('valorant-replay:get', async (_event, args: { matchId?: string }) =>
      fetchViewerReplay(String(args?.matchId ?? ''), mainProcess.authManager.getToken()))

    ipcMain.handle('dev:get-diagnostics', devOnly(canUseDevTools, 'dev:get-diagnostics', async () => {
      const analysisPipeline = await buildAnalysisPipelineDiagnostics({
        uploadManager: mainProcess.uploadManager,
        recordingsStore: mainProcess.recordingsStore,
        activePollJobId: getActiveAnalysisPollJobId(),
        pendingJob: readActivePendingJob(),
        activityLog: mainProcess.activityLog.slice(),
        localFileExists: (p) => fs.existsSync(p),
      })

      let network = null as Awaited<ReturnType<typeof runNetworkDiagnostics>> | null
      try {
        network = await runNetworkDiagnostics({
          trigger: 'dev-diagnostics',
          region: mainProcess.riotLocalApi.getDiagnostics().region,
          apiBase: getApiBaseUrl(),
          lastRiotMatchDetails: mainProcess.riotLocalApi.getLastMatchDetailsFetch(),
          lastUploadError: getLastUploadNetworkError(),
        })
      } catch {
        network = null
      }

      return {
        app: {
          version: APP_VERSION,
          platform: process.platform,
          arch: process.arch,
          electronVersion: process.versions.electron,
          nodeVersion: process.versions.node,
          isDev: is.dev,
        },
        riot: mainProcess.riotLocalApi.getDiagnostics(),
        lolLcu: await probeLolLcu({ liveClient: mainProcess.lolLiveClientApi }),
        network,
        recording: {
          active: mainProcess.obsRecorder.isActivelyRecording(),
          duration: mainProcess.obsRecorder.getRecordingDuration(),
          lastError: mainProcess.obsRecorder.getLastError() ?? null,
          lastPath: mainProcess.obsRecorder.getLastRecordingPath() ?? null,
          lastSizeMb: mainProcess.obsRecorder.getLastRecordingSize() / (1024 * 1024),
          wasapiMode: mainProcess.obsRecorder.getAudioMode(),
        },
        lastMatch: mainProcess.lastMatchDiagnostic,
        clips: {
          total: mainProcess.clipStore.getAll().length,
        },
        analysisPipeline,
        activityLog: mainProcess.activityLog.slice(),
      }
    }))

    setupGameDataCaptureHandlers(ipcMain)

    ipcMain.handle('analyses:ready', () => mainProcess.readyAnalysesList())
    ipcMain.handle('analyses:mark-seen', (_e, analysisId: unknown) => {
      if (typeof analysisId !== 'number') return mainProcess.readyAnalysesList()
      const before = mainProcess.readyAnalysesList()
      const next = removeReady(before, analysisId)
      if (next.length !== before.length) mainProcess.saveReadyAnalyses(next)
      return next
    })

    ipcMain.handle('app:get-support-bundle', async () => {
      const riotDiag = mainProcess.riotLocalApi.getDiagnostics()
      const network = await runNetworkDiagnostics({
        trigger: 'support-bundle',
        region: riotDiag.region,
        apiBase: getApiBaseUrl(),
        lastRiotMatchDetails: mainProcess.riotLocalApi.getLastMatchDetailsFetch(),
        lastUploadError: getLastUploadNetworkError(),
      })
      const lcu = await probeLolLcu({ liveClient: mainProcess.lolLiveClientApi })
      const authUser = mainProcess.authManager.getUser()
      const lolPuuid = lolLinkedPuuidFromAuth(
        authUser as { lol_puuid?: string | null; riot_puuid?: string | null } | null,
      )
      const dedicatedLolAccount = Boolean(
        authUser && typeof (authUser as { lol_puuid?: string | null }).lol_puuid === 'string'
          && String((authUser as { lol_puuid?: string | null }).lol_puuid).trim() !== '',
      )
      const last = mainProcess.lastMatchDiagnostic
      const demo =
        last && (last.game === 'cs2' || last.game === 'deadlock')
          ? {
              game: last.game as 'cs2' | 'deadlock',
              demoPresent: last.killsInTimeline > 0 || last.matchDetailsStatus === 'fetched',
              demoBasename: null as string | null,
              syncStatus: last.matchDetailsStatus,
            }
          : null

      return formatSupportBundle({
        version: APP_VERSION,
        network,
        activityLog: await mainProcess.supportActivity.read(localMediaRoot(getActiveUserId())),
        riot: riotDiag,
        lastMatch: last
          ? {
              game: last.game,
              timestamp: last.timestamp,
              matchId: last.matchId,
              map: last.map,
              agent: last.agent,
              gameMode: last.gameMode,
              endReason: last.endReason,
              matchDetailsStatus: last.matchDetailsStatus,
              lolEnrichStatus: last.lolEnrichStatus ?? null,
              queueId: last.queueId ?? null,
              killsInTimeline: last.killsInTimeline,
              clipsExtracted: last.clipsExtracted,
              recordingDuration: last.recordingDuration,
              fileSizeMb: last.fileSizeMb,
            }
          : null,
        lol: {
          lockfileFound: lcu.lockfileFound,
          phase: lcu.phase,
          queueId: lcu.queueId,
          queueLabel: lcu.queueLabel,
          gameMode: lcu.gameMode,
          error: lcu.error,
          liveClientReachable: lcu.liveClient?.reachable ?? false,
          liveClientInMatch: lcu.liveClient?.inMatch ?? false,
          liveClientGameMode: lcu.liveClient?.gameMode ?? null,
          lolPlatform: (authUser as { lol_platform?: string | null } | null)?.lol_platform ?? null,
          hasLolPuuid: Boolean(lolPuuid),
          dedicatedLolAccount,
        },
        demo,
        trace: {
          userId: typeof (authUser as { id?: unknown } | null)?.id === 'number' ? (authUser as { id: number }).id : null,
          last: lastAnalysisJob(),
        },
      })
    })

    // recorder:audio-status and recorder:fix-audio are registered in ipc/media-ipc.ts

    ipcMain.handle('clips:save-bookmark', () => {
      if (mainProcess.obsRecorder.isRecording() && mainProcess.currentRecordingStartTime !== null) {
        mainProcess.hotkeyBookmarks.push(Date.now())
        mainProcess.logActivity('Clip moment bookmarked (overlay button)')
        log.info('[Overlay] Clip bookmarked via button, total:', mainProcess.hotkeyBookmarks.length)
        const elapsedSec = Math.round((Date.now() - mainProcess.currentRecordingStartTime) / 1000)
        sendOverlayData('overlay:clip-bookmarked', { bookmarkCount: mainProcess.hotkeyBookmarks.length, elapsedSec })
        return { ok: true, bookmarkCount: mainProcess.hotkeyBookmarks.length }
      }
      return { ok: false, reason: 'not-recording' }
    })

    // Protect gameplay even when recording is disabled, stopped manually, or OBS fails.
    // Poll local match signals, not FPS or screen capture. Unknown state never releases a hold.
    let matchProbeBusy = false
    let lastMatchAuthAttempt = 0
    const backgroundMatchInterval = setInterval(() => {
      if (matchProbeBusy) return
      matchProbeBusy = true
      void (async () => {
        const game = mainProcess.gameDetector.currentGame() ?? mainProcess.trackedPrimaryGame
        let inMatch: boolean | null = null
        if (game === 'valorant') {
          let state = await mainProcess.riotLocalApi.getSharedSessionState()
          if (!state && Date.now() - lastMatchAuthAttempt > 30_000) {
            lastMatchAuthAttempt = Date.now()
            if (await mainProcess.riotLocalApi.initAuth()) state = await mainProcess.riotLocalApi.getSharedSessionState({ fresh: true })
          }
          if (state?.sessionLoopState === 'INGAME' || state?.sessionLoopState === 'PREGAME') inMatch = true
          else if (state?.sessionLoopState === 'MENUS') {
            const core = await mainProcess.riotLocalApi.isCoreGameSessionActive()
            const pregame = await mainProcess.riotLocalApi.isPregameSessionActive()
            if (core === false && pregame === false) inMatch = false
            else if (core === true || pregame === true) inMatch = true
          }
        } else if (game === 'cs2') {
          if (isGsiMatchLive()) inMatch = true
          else if (isGsiMatchEnded()) inMatch = false
        } else if (game === 'deadlock') {
          if (isDeadlockMatchLive() || isDeadlockReadyToRecord()) inMatch = true
          else if (isDeadlockMatchEnded()) inMatch = false
        } else if (game === 'lol') {
          inMatch = (await mainProcess.lolLiveClientApi.probeLiveness())?.inMatch ?? null
        }
        if (inMatch === null && mainProcess.backgroundMatchState.active) {
          // A timed-out tasklist probe is unknown, not evidence that Valorant exited.
          const stopped = await mainProcess.gameDetector.probeGameProcessRecent(game) === 'stopped'
          if (stopped) inMatch = false
        }
        const wasActive = mainProcess.backgroundMatchState.active
        mainProcess.backgroundMatchState.observe(inMatch)
        // Only game APIs set inMatch=true; the process check above can only set false.
        mainProcess.gameDetector.setMatchConfirmed(inMatch === true)
        if (!wasActive && mainProcess.backgroundMatchState.active) mainProcess.interruptBackgroundWorkForMatch()
        else if (wasActive && !mainProcess.backgroundMatchState.active) { mainProcess.maybeResumeDeferredUploads(); matchPollPause.resume() }
      })().catch((err) => log.debug('[MatchPriority] Match probe unavailable:', err))
        .finally(() => { matchProbeBusy = false })
    }, 2000)
    app.on('will-quit', () => clearInterval(backgroundMatchInterval))

    // Presence heartbeat — update squad presence every 60s when authenticated
    const presenceInterval = setInterval(() => {
      if (!mainProcess.authManager.isAuthenticated()) return
      mainProcess.authManager.sendPresence(mainProcess.obsRecorder.isActivelyRecording(), mainProcess.gameDetector.currentGame())
        .catch(() => { /* ignore */ })
    }, 60000)

    app.on('will-quit', () => clearInterval(presenceInterval))

    // Register global hotkeys
    mainProcess.hotkeyManager.on('save-clip', () => {
      if (mainProcess.obsRecorder.isRecording() && mainProcess.currentRecordingStartTime !== null) {
        mainProcess.hotkeyBookmarks.push(Date.now())
        mainProcess.logActivity('Clip moment bookmarked (F9)')
        log.info('[Hotkey] F9 clip bookmarked, total bookmarks:', mainProcess.hotkeyBookmarks.length)
        const elapsedSec = Math.round((Date.now() - mainProcess.currentRecordingStartTime) / 1000)
        const timeLabel = elapsedSec < 60
          ? `${elapsedSec}s into match`
          : `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s into match`
        deliverInGameFeedback(mainProcess.inGameFeedbackDeps(), {
          kind: 'clip-saved',
          title: 'Clip moment saved',
          body: `#${mainProcess.hotkeyBookmarks.length} marked · ${timeLabel}`,
          overlayChannel: 'overlay:clip-bookmarked',
          overlayData: { bookmarkCount: mainProcess.hotkeyBookmarks.length, elapsedSec },
          beep: 'success',
        })
      } else {
        log.warn('[Hotkey] F9 pressed but recorder is not active (recording=%s, startTime=%s)',
          mainProcess.obsRecorder.isRecording(), mainProcess.currentRecordingStartTime)
        const currentGame = mainProcess.gameDetector.currentGame()
        const gameLbl = currentGame ? gameLabel(currentGame) : 'a'
        mainProcess.logActivity(`F9 pressed — not recording (start a ${gameLbl} match first)`)
        deliverInGameFeedback(mainProcess.inGameFeedbackDeps(), {
          kind: 'not-recording',
          title: 'Not recording',
          body: `Start a ${gameLbl} match first — F9 saves clip moments during recording`,
          overlayChannel: 'overlay:clip-not-recording',
          beep: 'warning',
        })
      }
    })
    mainProcess.hotkeyManager.on('take-screenshot', () => {
      void (async () => {
        log.info('[Hotkey] F8 screenshot requested')
        const result = await captureAndSaveScreenshot()
        if (result.ok) {
          mainProcess.logActivity('Screenshot saved (F8)')
          deliverInGameFeedback(mainProcess.inGameFeedbackDeps(), {
            kind: 'screenshot',
            title: 'Screenshot saved',
            body: result.filename ?? 'Saved to your UpForge screenshots folder',
            overlayChannel: 'overlay:screenshot-saved',
            overlayData: { filename: result.filename },
            beep: 'success',
          })
        } else {
          mainProcess.logActivity('Screenshot failed (F8)')
          deliverInGameFeedback(mainProcess.inGameFeedbackDeps(), {
            kind: 'screenshot',
            title: 'Screenshot failed',
            body: 'Could not capture your screen — try again',
            beep: 'warning',
            flashOverlayMs: 0,
          })
        }
      })()
    })
    mainProcess.hotkeyManager.on('toggle-overlay', () => {
      // If the auto-hide timer is running (from an F9 flash), cancel it — user is taking manual control
      if (mainProcess.overlayAutoHideTimer) { clearTimeout(mainProcess.overlayAutoHideTimer); mainProcess.overlayAutoHideTimer = null }
      requestOverlayToggle()
      // When overlay becomes visible, push current recording state immediately
      // so the user sees the correct status without waiting for the next poll cycle
      if (isOverlayVisible()) {
        sendOverlayData('overlay:data', {
          round: null,
          allyScore: null,
          enemyScore: null,
          yourCredits: null,
          enemyEstimate: null,
          recording: mainProcess.obsRecorder.isActivelyRecording(),
        })
      }
    })
    const hotkeyResults = mainProcess.hotkeyManager.registerAll()
    if (!hotkeyResults['save-clip']) {
      log.error('[Main] F9 (save-clip) hotkey failed to register — clips cannot be bookmarked via keyboard')
      mainProcess.logActivity('WARNING: F9 hotkey failed to register (may be in use by another app)')
      reportError({ message: 'F9 (save-clip) hotkey failed to register — users cannot bookmark clips via keyboard', component: 'desktop:HotkeyManager' })
    }
    // Send hotkey registration status to any open window so the UI can show a warning
    const hotkeyStatus = {
      saveClipRegistered: !!hotkeyResults['save-clip'],
      toggleOverlayRegistered: !!hotkeyResults['toggle-overlay'],
      screenshotRegistered: !!hotkeyResults['take-screenshot'],
    }
    mainProcess.mainWindow?.webContents.send('app:hotkey-status', hotkeyStatus)

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
      const gameMode = await mainProcess.riotLocalApi.getGameMode()
      const logGameMode = await mainProcess.riotLocalApi.getGameModeFromLog()
      const processRunning = await mainProcess.gameDetector.isMatchProcessRunning()
      return { portOpen, gameMode, logGameMode, processRunning }
    })

    let recentMatchesFolder = join(app.getPath('userData'), 'poc-recent-matches')
    // Debug PoC: export coaching facts from Riot history without pretending a VOD exists.
    ipcMain.handle('debug:poc-recent-matches', devOnly(canUseDevTools, 'debug:poc-recent-matches', async (_e, limit: number = 10) => {
      const started = Date.now()
      const result = await mainProcess.riotLocalApi.fetchRecentMatchTimelines(limit)
      const report = await saveRecentMatchExports(result, join(app.getPath('userData'), 'poc-recent-matches'), started)
      recentMatchesFolder = report.folder
      return report
    }))
    ipcMain.handle('debug:poc-open-folder', devOnly(canUseDevTools, 'debug:poc-open-folder', () => shell.openPath(recentMatchesFolder)))
    ipcMain.handle('debug:poc-latest-report', devOnly(canUseDevTools, 'debug:poc-latest-report', async () => {
      const report = await readRecentMatchReport(join(app.getPath('userData'), 'poc-recent-matches'))
      if (report) recentMatchesFolder = report.folder
      return report
    }))

    // ── Focus loop: send recent Riot matches (no recording needed) for checked reports ──
    let focusSyncRunning = false
    let lastFocusSyncAt = 0
    let lastFocusSyncUserId: number | null = null
    /** Match reports already announced this session ("Your match report is ready"). */
    const announcedReports = new Set<string>()
    async function runFocusSync(reason: string, limit = 20): Promise<SyncResult | null> {
      const userId = getActiveUserId()
      if (!mainProcess.authManager.isAuthenticated() || userId == null) return null
      if (focusSyncRunning) return { ok: false, reason: 'sync_in_progress', uploaded: 0, skipped: 0, latest: null }
      if (reason !== 'manual' && lastFocusSyncUserId === userId && Date.now() - lastFocusSyncAt < 2 * 60_000) return null
      focusSyncRunning = true
      lastFocusSyncAt = Date.now()
      lastFocusSyncUserId = userId
      const root = app.getPath('userData')
      const ownsSession = () => mainProcess.authManager.isAuthenticated() && getActiveUserId() === userId
      try {
        const res = await syncMatchReports({
          fetchRecent: n => mainProcess.riotLocalApi.fetchRecentMatchTimelines(n),
          post: async body => {
            if (!ownsSession()) throw new Error('Focus account changed')
            const r = await mainProcess.authManager.getApi().post('/api/match-report', body, { validateStatus: () => true, timeout: 120_000 })
            return { status: r.status, data: r.data }
          },
          loadState: () => readFocusSyncState(root, userId),
          saveState: state => writeFocusSyncState(root, userId, state),
          onReport: update => log.info(`[FocusSync] report: ${focusReportDiagnostic(update)}`),
        }, limit)
        log.info(`[FocusSync] ${reason}: ok=${res.ok} uploaded=${res.uploaded} skipped=${res.skipped}${res.reason ? ` reason=${res.reason}` : ''}`)
        if (res.ok) trackFirstMatchSynced(res.uploaded)
        // An in-flight response belongs to the account that started it, even after logout.
        if (!ownsSession()) return null
        if (res.latest) {
          mainProcess.mainWindow?.webContents.send('focus:updated', res.latest)
          if (mainProcess.postGameWindow && !mainProcess.postGameWindow.isDestroyed()) mainProcess.postGameWindow.webContents.send('focus:updated', res.latest)
        }
        // A match that was not recorded has no after-match window: say the report is ready, once.
        const notice = reportReadyNotice({
          reason,
          latest: res.latest,
          postGameShowing: !!mainProcess.postGameWindow && !mainProcess.postGameWindow.isDestroyed() && mainProcess.postGameWindow.isVisible(),
          announced: announcedReports,
        })
        if (notice) {
          announcedReports.add(notice.matchId)
          showAppNotification({
            title: notice.title,
            body: notice.body,
            silent: mainProcess.notifySilent(),
            deferWhileRecording: true,
            onClick: () => {
              mainProcess.focusMainWindow()
              if (mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed()) mainProcess.mainWindow.webContents.send('app:navigate', notice.path)
            },
          })
        }
        return res
      } catch {
        // Axios errors can contain authorization headers; never log the raw error.
        log.warn(`[FocusSync] ${reason}: ok=false reason=sync_failed`)
        return ownsSession() ? { ok: false, reason: 'sync_failed', uploaded: 0, skipped: 0, latest: null } : null
      } finally {
        focusSyncRunning = false
      }
    }
    ipcMain.handle('focus:sync', () => runFocusSync('manual'))
    // Match report (free, data-only): read the stored report for one of the player's own matches.
    ipcMain.handle('match-report:get', async (_event, matchId: unknown) => {
      if (typeof matchId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(matchId)) return { ok: false, error: 'invalid_match' }
      if (!mainProcess.authManager.isAuthenticated()) return { ok: false, error: 'signed_out' }
      const r = await mainProcess.authManager.getApi().get(`/api/match-report/${matchId}`, { validateStatus: () => true }).catch(() => null)
      if (r?.status === 404) return { ok: false, error: 'not_found' }
      if (r?.status !== 200 || !r.data?.success) return { ok: false, error: 'unavailable' }
      return { ok: true, report: r.data }
    })
    // League / Deadlock free data reports: facts computed by the API from data it already caches.
    ipcMain.handle('match-report:get-game', async (_event, game: unknown, matchId: unknown) => {
      const ok = (game === 'lol' && typeof matchId === 'string' && /^[A-Z0-9]{2,8}_\d{1,20}$/i.test(matchId))
        || (game === 'deadlock' && typeof matchId === 'string' && /^\d{1,20}$/.test(matchId))
      if (!ok) return { ok: false, error: 'invalid_match' }
      if (!mainProcess.authManager.isAuthenticated()) return { ok: false, error: 'signed_out' }
      const r = await mainProcess.authManager.getApi().get(`/api/${game}/match-report/${matchId}`, { validateStatus: () => true }).catch(() => null)
      if (r?.status === 404) return { ok: false, error: 'not_found' }
      if (r?.status !== 200 || !r.data?.success) return { ok: false, error: 'unavailable' }
      return { ok: true, report: r.data }
    })
    // AI coach notes for League / Deadlock (facts recomputed by the API) and CS2 (facts from the parsed demo).
    ipcMain.handle('match-report:game-notes', async (_event, game: unknown, matchId: unknown, facts: unknown) => {
      const idOk = (game === 'lol' && typeof matchId === 'string' && /^[A-Z0-9]{2,8}_\d{1,20}$/i.test(matchId))
        || (game === 'deadlock' && typeof matchId === 'string' && /^\d{1,20}$/.test(matchId))
        || (game === 'cs2' && typeof matchId === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(matchId))
      if (!idOk) return { ok: false, error: 'invalid_match' }
      if (game === 'cs2' && (!facts || typeof facts !== 'object')) return { ok: false, error: 'invalid_facts' }
      if (!mainProcess.authManager.isAuthenticated()) return { ok: false, error: 'signed_out' }
      const cs2Extras = game === 'cs2' ? cs2MatchExtras(mainProcess.recordingsStore.getById(matchId)) : {}
      const r = game === 'cs2'
        // played_at + job_id (when known) let the API count this match for a focus, once with its demo.
        ? await mainProcess.authManager.getApi().post('/api/cs2/match-report/notes', { match_key: matchId, facts, ...cs2Extras }, { validateStatus: () => true, timeout: 90000 }).catch(() => null)
        : await mainProcess.authManager.getApi().post(`/api/${game}/match-report/${matchId}/notes`, {}, { validateStatus: () => true, timeout: 90000 }).catch(() => null)
      if (r?.status !== 200 || !r.data?.success) return { ok: false, error: r?.status === 404 ? 'not_found' : 'unavailable' }
      if (game === 'cs2' && cs2Extras.played_at) mainProcess.recordingsStore.markCs2FocusCounted(matchId, cs2Extras.job_id ?? null)
      return {
        ok: true, notes: r.data.notes ?? null, notes_source: r.data.notes_source ?? null, capped: !!r.data.capped, notes_status: r.data.notes_status ?? null,
        // CS2: this match's focus rows (the renderer checks them); null from APIs that don't send them.
        focus_checks: Array.isArray(r.data.focus_checks) ? r.data.focus_checks : null,
      }
    })
    // Starting report: the first-join AI read of the player's last matches, one per game (stored by the API).
    const STARTING_GAMES = ['valorant', 'lol', 'deadlock', 'cs2'] as const
    const startingGame = (g: unknown): g is typeof STARTING_GAMES[number] => (STARTING_GAMES as readonly unknown[]).includes(g)
    ipcMain.handle('starting-report:get', async (_event, game: unknown) => {
      if (!startingGame(game)) return { ok: false, error: 'invalid_game' }
      if (!mainProcess.authManager.isAuthenticated()) return { ok: false, error: 'signed_out' }
      const r = await mainProcess.authManager.getApi().get(`/api/starting-report/${game}`, { validateStatus: () => true }).catch(() => null)
      if (r?.status !== 200 || !r.data?.success) return { ok: false, error: 'unavailable' }
      return { ok: true, report: r.data }
    })
    ipcMain.handle('starting-report:generate', async (_event, game: unknown) => {
      if (!startingGame(game)) return { ok: false, error: 'invalid_game' }
      if (!mainProcess.authManager.isAuthenticated()) return { ok: false, error: 'signed_out' }
      let body: Record<string, unknown> = {}
      if (game === 'cs2') {
        // CS2: only matches whose demo was parsed on this PC (newest first, max 10).
        // Full match_stats + game_mode per match; known unranked modes (Wingman, Casual…) are left out.
        const matches = cs2StartingReportMatches(mainProcess.recordingsStore.getAll())
        if (matches.length < 3) return { ok: true, report: { success: true, game, status: 'insufficient', matches_available: matches.length, report: null } }
        body = { matches }
      }
      const r = await mainProcess.authManager.getApi().post(`/api/starting-report/${game}`, body, { validateStatus: () => true, timeout: 120000 }).catch(() => null)
      if (r?.status !== 200 || !r.data?.success) return { ok: false, error: 'unavailable' }
      return { ok: true, report: r.data }
    })
    ipcMain.handle('starting-report:dismiss', async (_event, game: unknown) => {
      if (!startingGame(game) || !mainProcess.authManager.isAuthenticated()) return { ok: false }
      const r = await mainProcess.authManager.getApi().post(`/api/starting-report/${game}/dismiss`, {}, { validateStatus: () => true }).catch(() => null)
      return { ok: r?.status === 200 }
    })
    ipcMain.handle('starting-report:start-focus', async (event, game: unknown) => {
      if (!startingGame(game) || !mainProcess.authManager.isAuthenticated()) return { ok: false }
      if (mainProcess.mainWindow && event.sender !== mainProcess.mainWindow.webContents) return { ok: false }
      const r = await mainProcess.authManager.getApi().post(`/api/starting-report/${game}/focus`, {}, { validateStatus: () => true }).catch(() => null)
      return { ok: r?.status === 200 && !!r.data?.success, focus: r?.data?.focus ?? null }
    })
    ipcMain.handle('match-report:list', async (_event, limit: unknown, opts?: unknown) => {
      if (!mainProcess.authManager.isAuthenticated()) return { ok: false, error: 'signed_out' }
      const n = Number.isInteger(limit) ? Math.min(Math.max(limit as number, 1), 50) : 20
      // Ranked only unless asked for every queue (the Matches list shows Unrated, Swiftplay… too).
      const everyQueue = (opts as { everyQueue?: unknown } | null | undefined)?.everyQueue === true
      const params = everyQueue ? { limit: n, queue: 'all' } : { limit: n }
      const r = await mainProcess.authManager.getApi().get('/api/match-reports', { params, validateStatus: () => true }).catch(() => null)
      if (r?.status !== 200 || !r.data?.success) return { ok: false, error: 'unavailable' }
      return { ok: true, reports: Array.isArray(r.data.reports) ? r.data.reports : [] }
    })
    // Several focuses per game: what the player works on, what they can add, what ended (no AI, no cost).
    // An older API without /api/focuses answers 404: the app then shows its single-focus screens only.
    ipcMain.handle('focuses:list', async (_event, game: unknown) => {
      if (!isFocusGame(game)) return { ok: false, error: 'unsupported_game' }
      if (!mainProcess.authManager.isAuthenticated()) return { ok: false, error: 'signed_out' }
      return focusesReply(await mainProcess.authManager.getApi().get('/api/focuses', { params: { game }, validateStatus: () => true }).catch(() => null))
    })
    ipcMain.handle('focuses:add', async (_event, payload: unknown) => {
      const request = parseAddFocus(payload)
      if (!request.ok) return request
      if (!mainProcess.authManager.isAuthenticated()) return { ok: false, error: 'signed_out' }
      return focusesReply(await mainProcess.authManager.getApi().post('/api/focuses', request.body, { validateStatus: () => true }).catch(() => null))
    })
    ipcMain.handle('focuses:drop', async (_event, id: unknown) => {
      if (!isFocusId(id)) return { ok: false, error: 'not_found' }
      if (!mainProcess.authManager.isAuthenticated()) return { ok: false, error: 'signed_out' }
      return focusesReply(await mainProcess.authManager.getApi().delete(`/api/focuses/${id}`, { validateStatus: () => true }).catch(() => null))
    })
    ipcMain.handle('focus:get', async () => {
      const userId = getActiveUserId()
      if (!mainProcess.authManager.isAuthenticated() || userId == null) return null
      const r = await mainProcess.authManager.getApi().get('/api/focus', { validateStatus: () => true }).catch(() => null)
      if (r?.status !== 200 || !r.data?.success) return null
      const cached = await readFocusSyncState(app.getPath('userData'), userId)
      if (!mainProcess.authManager.isAuthenticated() || getActiveUserId() !== userId) return null
      return hydrateFocusResponse(r.data, cached.latest ?? null)
    })
    // First sync shortly after start (Riot client may still be launching), then after each match.
    setTimeout(() => { void runFocusSync('startup') }, 45_000)
    mainProcess.scheduleFocusSyncAfterMatch = (game: string) => {
      if (game !== 'valorant') return
      // Riot needs a minute or two to publish match details after the game ends; retry if it wasn't there yet.
      const delays = [120_000, 6 * 60_000, 15 * 60_000]
      const attempt = (i: number) => setTimeout(async () => {
        const res = await runFocusSync(i === 0 ? 'match_end' : 'match_end_retry', 5)
        if (i + 1 < delays.length && shouldRetryFocusSync(res)) attempt(i + 1)
      }, delays[i] - (i > 0 ? delays[i - 1] : 0))
      attempt(0)
    }

    ipcMain.handle('debug:probe-lol-lcu', devOnly(canUseDevTools, 'debug:probe-lol-lcu', async () => {
      return probeLolLcu({ liveClient: mainProcess.lolLiveClientApi })
    }))

    const canUseProductionFixtures = canUseDevTools
    const productionFixtureError = (err: unknown): string => {
      const apiMessage = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      return apiMessage || (err instanceof Error ? err.message : 'Production fixture request failed')
    }

    ipcMain.handle('dev:production-vods:list', async () => {
      if (!canUseProductionFixtures()) return { ok: false as const, error: 'Developer access required' }
      try {
        return { ok: true as const, archives: await mainProcess.productionVodFixtures.list(mainProcess.authManager) }
      } catch (err) {
        return { ok: false as const, error: productionFixtureError(err) }
      }
    })

    ipcMain.handle('dev:production-vods:mount', async (_event, { archiveId }: { archiveId: string }) => {
      if (!canUseProductionFixtures()) return { ok: false as const, error: 'Developer access required' }
      try {
        const fixture = await mainProcess.productionVodFixtures.mount(mainProcess.authManager, archiveId)
        mainProcess.notifyRecordingsUpdated()
        return { ok: true as const, fixture }
      } catch (err) {
        return { ok: false as const, error: productionFixtureError(err) }
      }
    })

    ipcMain.handle('dev:production-vods:active', () => ({
      ok: true as const,
      fixture: mainProcess.productionVodFixtures.getActive(),
    }))

    ipcMain.handle('dev:production-vods:unmount', () => {
      const removed = mainProcess.productionVodFixtures.unmount()
      if (removed) mainProcess.notifyRecordingsUpdated()
      return { ok: true as const, removed }
    })

    ipcMain.handle('post-game:sync', () => getPostGameSessionSnapshot())

    ipcMain.handle('post-game:retry-demo-scan', async () => {
      const activeUserId = getActiveUserId()
      const context = mainProcess.lastReplayRetryContext
      const recordingExists = Boolean(context?.recordingId && mainProcess.recordingsStore.getById(context.recordingId))
      if (!isReplayRetryContextEligible(context, activeUserId, recordingExists)) {
        return { ok: false as const, error: 'No recent match to scan' }
      }
      const notifyWin = mainProcess.postGameWindow
        && !mainProcess.postGameWindow.isDestroyed()
        && isPostGameSessionForRecording(context.recordingId, activeUserId)
        ? mainProcess.postGameWindow
        : (mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed() ? mainProcess.mainWindow : null)

      const recordingId = context.recordingId
      const synced = await mainProcess.refreshReplayTimelineForRecording(recordingId, { notifyActivity: true })
      if (synced) {
        const rec = mainProcess.recordingsStore.getById(recordingId)
        if (rec) {
          const readiness = getAnalysisReadiness(rec)
          mainProcess.notifyRecordingsUpdated()
          if (notifyWin) {
            sendPostGameEventForRecording(
              notifyWin,
              recordingId,
              'post-game:analysis-readiness',
              readiness,
              activeUserId,
            )
          }
        }
      }

      // Don't hold the IPC open for the demo job poll (up to DEMO_POLL_MAX_MS = 40 min);
      // uploadReplayInBackground streams post-game:demo-status events to the window.
      void tryAutoUploadSourceReplay({
        game: context.game,
        demoPath: null,
        matchSessionStart: context.matchSessionStart,
        auth: mainProcess.authManager,
        notifyWindow: notifyWin,
        customReplayDir: context.customReplayDir,
        meta: context.meta,
        onJobId: context.game === 'deadlock'
          ? (jobId) => mainProcess.linkAutoDeadlockReviewJob(jobId, { matchId: context.meta?.matchId ?? null, sessionStart: context.matchSessionStart }, recordingId)
          : (jobId) => { mainProcess.recordingsStore.setCs2DemoJob(recordingId, jobId) },
      }).catch((err) => log.warn('[Replay] retry scan failed:', (err as Error)?.message))
      return { ok: true as const }
    })

    const recordingsProbeSweep = createVodProbeSweep<PendingRecording>({
      readiness: (rec) => getVodFileReadiness(rec),
      probe: (rec) => mainProcess.refreshRecordingVodProbe(rec),
      notify: mainProcess.notifyRecordingsUpdated,
    })

    const logAndReportBurst = (label: string) => (message: string, burst: { callCount: number; windowS: number }) => {
      log.warn(message)
      mainProcess.reportMainLag({ kind: 'call_burst', label, ...burst })
    }
    const countRecordingsGet = createCallRateLogger('recordings:get', logAndReportBurst('recordings:get'))
    const countRecordingsListAll = createCallRateLogger('recordings:list-all', logAndReportBurst('recordings:list-all'))

    ipcMain.handle('recordings:get', async () => {
      countRecordingsGet()
      // Timelines load in the background at start-up; wait so readiness never reads files synchronously.
      await mainProcess.recordingsStore.timelinesReady()
      const userId = getActiveUserId()
      if (userId != null && mainProcess.recordingsStore) {
        mainProcess.recordingsStore.healMissingPaths([
          mainProcess.recordingSavePath(),
          userRecordingsDir(userId),
          legacyGlobalRecordingsDir(),
          mainProcess.settingsManager?.get().savePath,
        ].filter(Boolean) as string[])
      }
      mainProcess.scanForOrphanedRecordings()
      const pending = mainProcess.recordingsStore.getPending(mainProcess.linkedRiotFromAuth())
      const fixture = mainProcess.productionVodFixtures.getActive()
      if (fixture) pending.unshift(fixture)

      // Return immediately with whatever probe state is already cached — never
      // block the dashboard on ffmpeg. Any VOD whose probe is stale reads as
      // "finalizing" for one render, then we re-probe in the background and push
      // `recordings:updated` so the renderer refetches with real readiness.
      const needsProbe = pending.filter(
        (rec) => rec.path && !rec.clipsOnly && !(rec.cloudArchived && rec.archiveId),
      )
      // One sweep at a time: each change pushes `recordings:updated`, which makes the renderer call
      // this handler again; starting a new loop per call fed back into a storm after matches.
      recordingsProbeSweep.request(needsProbe)

      // List rows carry a small timeline summary only — full data: recordings:get-timeline.
      return pending.map((rec) => ({
        ...withAnalysisReadiness(rec),
        timeline: rowTimelineSummary(rec),
        hasLocalFile: Boolean(rec.path && fs.existsSync(rec.path)),
        cloudUploaded: Boolean(rec.jobId || rec.analysisId || rec.archiveId),
        localExpiresAt: mainProcess.rowLocalExpiresAt(rec),
      }))
    })

    ipcMain.handle('recordings:list-all', async (_e, opts?: { allAccounts?: boolean }) => {
      countRecordingsListAll()
      await mainProcess.recordingsStore.timelinesReady()
      // The earlier dashboard scan may have run before OBS finished writing the file.
      // Re-scan when the user opens the library so interrupted finalisation self-heals.
      mainProcess.scanForOrphanedRecordings(true)
      mainProcess.prepareLegacyOrphanRecoveryRows()
      // UI v3 asks for every linked account (main + alts) and tags each Valorant row.
      const linkedAccounts = mainProcess.linkedRiotAccountsFromAuth()
      // League alts: tag from the cached /api/lol-accounts list (refreshed in the background, at most once a minute).
      const linkedLolAccounts = mainProcess.linkedLolAccountsFromAuth()
      const all = opts?.allAccounts === true
        ? mainProcess.recordingsStore.getAllLinked(linkedAccounts)
        : mainProcess.recordingsStore.getAll(mainProcess.linkedRiotFromAuth())
      const fixture = mainProcess.productionVodFixtures.getActive()
      if (fixture) all.unshift(fixture)
      for (const rec of all) {
        if (rec.orphanedImport && rec.timeline && !hasRichMatchData(rec.timeline)) {
          mainProcess.scheduleAnalysisReadinessRefresh(rec.id, rec.game)
        }
      }
      // Cheap read: use cached probe/readiness only — the Recordings tab is for
      // browsing, not the actionable dashboard queue, so never block on ffmpeg.
      return all.map((rec) => ({
        ...withAnalysisReadiness(rec),
        timeline: rowTimelineSummary(rec),
        hasLocalFile: Boolean(rec.path && fs.existsSync(rec.path)),
        cloudUploaded: Boolean(rec.jobId || rec.analysisId || rec.archiveId),
        localExpiresAt: mainProcess.rowLocalExpiresAt(rec),
        ...(opts?.allAccounts === true ? { riotAccountRole: riotAccountRole(rec, linkedAccounts, linkedLolAccounts) } : {}),
      }))
    })

    ipcMain.handle('analysis:reconcile-stuck', async () => {
      const reconciled = await mainProcess.runStuckAnalysisReconcile()
      return { ok: true, reconciled }
    })

    ipcMain.handle('recordings:retry-match-stats', async (_e, { id }: { id: string }) => {
      if (mainProcess.productionVodFixtures.getById(id)) {
        return {
          ok: false as const,
          error: 'Production fixtures are read-only',
          analysisReadiness: null,
        }
      }
      const recording = mainProcess.recordingsStore.getById(id)
      if (!recording) {
        return { ok: false as const, error: 'Recording not found', analysisReadiness: null }
      }
      if (recording.game !== 'valorant' && recording.game !== 'lol') {
        return {
          ok: false as const,
          error: 'Match stats retry is only for Valorant and League',
          analysisReadiness: getAnalysisReadiness(recording),
        }
      }

      mainProcess.recordingsStore.setMatchStatsSyncPaused(id, false)

      if (recording.orphanedImport && recording.timeline) {
        await mainProcess.refreshRecordingVodProbe(recording)
        await mainProcess.recoverOrphanedValorantMetadata(recording)
      } else {
        // Keep background soft-poll armed, but do a short blocking attempt so the
        // dashboard Retry sync button is not locked for the full 3-minute enrich window.
        mainProcess.scheduleAnalysisReadinessRefresh(id, recording.game, { force: true })
      }

      if (recording.timeline && !recording.orphanedImport) {
        if (recording.game === 'valorant') {
          await enrichTimelineForCoaching(mainProcess.riotLocalApi, recording.timeline, {
            maxWaitMs: 25_000,
            onStatus: (msg) => mainProcess.logActivity(msg),
            api: mainProcess.authManager.getToken() ? mainProcess.authManager.getApi() : null,
            refreshPopulation: false,
          })
          mainProcess.maybeCaptureRiotDnsEvidence()
        } else if (recording.game === 'lol') {
          await enrichLolTimelineForCoaching(recording.timeline, {
            maxWaitMs: 25_000,
            onStatus: (msg) => mainProcess.logActivity(msg),
            api: mainProcess.authManager.getToken() ? mainProcess.authManager.getApi() : null,
            authUser: mainProcess.authManager.getUser(),
          })
        }
        mainProcess.recordingsStore.updateTimeline(id, recording.timeline)
      }

      const updated = mainProcess.recordingsStore.getById(id)
      const analysisReadiness = updated ? getAnalysisReadiness(updated) : null
      mainProcess.notifyRecordingsUpdated()

      if (!analysisReadiness?.ready) {
        return {
          ok: false as const,
          error: mainProcess.orphanRecoveryMessage(updated?.orphanRecoveryError)
            ?? analysisReadiness?.message
            ?? 'Could not load Riot match stats yet — check network DNS, then tap Retry sync again.',
          analysisReadiness,
        }
      }
      return { ok: true as const, analysisReadiness }
    })

    ipcMain.handle('recordings:analyse', async (_e, { id, focusAreas }: { id: string; focusAreas?: unknown }) => {
      if (mainProcess.productionVodFixtures.getById(id)) {
        return { error: 'Production fixtures are read-only', code: 'production_fixture_read_only' }
      }
      let recording = mainProcess.recordingsStore.getById(id)
      if (!recording) {
        return { error: 'Recording not found', code: 'not_found' }
      }
      if (mainProcess.activeUploadRecordingIds.has(id)) {
        return { error: 'This recording is already uploading. Check its progress on the dashboard.', code: 'upload_already_in_progress' }
      }
      try {
        const focus = submissionFocusAreas(focusAreas)
        if (focus) {
          const owner = getActiveUserId()
          const store = mainProcess.recordingsStore.forUser(owner)
          store.setSubmissionFocusAreas(id, focus)
          await store.flush()
          if (getActiveUserId() !== owner) return { error: 'Your account changed. Open the recording again.', code: 'session_changed' }
        }
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Invalid focus area', code: 'invalid_focus' }
      }

      // Reconcile every saved job before another request can reserve a credit.
      // A missing local error does not prove the previous analysis has finished.
      if (recording.jobId) {
        const statusOwner = getActiveUserId()
        const savedJobId = recording.jobId
        const abortLike = /upload.?cancel|upload.?abort|upload_aborted/i.test(
          `${recording.lastAnalysisError} ${recording.lastFailureCode ?? ''}`,
        )
        let serverStatus: Awaited<ReturnType<typeof mainProcess.uploadManager.pollStatus>> | null = null
        // pollStatus rejects with exactly this on HTTP 404: this account has no such job (stale
        // uploads are deleted and refunded server-side), so a new upload cannot charge twice.
        let jobMissing = false
        try {
          serverStatus = await mainProcess.uploadManager.pollStatus(recording.jobId)
        } catch (err) {
          serverStatus = null
          jobMissing = err instanceof Error && err.message === 'Job not found'
        }
        if (getActiveUserId() !== statusOwner) {
          return { error: 'Your account changed. Open the recording again.', code: 'session_changed' }
        }
        if (mainProcess.recordingsStore.getById(id)?.jobId !== savedJobId) {
          return { error: 'This recording changed while checking its analysis. Open it again.', code: 'recording_changed' }
        }

        if (serverStatus && (serverStatus.status === 'completed' || isTerminalPollSuccess(serverStatus))) {
          mainProcess.dismissMatchWaitUi()
          mainProcess.recordingsStore.clearAnalysisFailure(id)
          mainProcess.dispatchReconciledAnalysisReady({
            jobId: recording.jobId,
            status: asCompletedPollStatus(serverStatus),
            recordingId: id,
            agent: recording.agent ?? null,
            map: recording.map ?? null,
            game: recording.game ?? 'valorant',
          })
          return { ok: true }
        }

        if (serverStatus && (serverStatus.status === 'processing' || serverStatus.status === 'queued')) {
          mainProcess.dismissMatchWaitUi()
          mainProcess.recordingsStore.clearAnalysisFailure(id)
          mainProcess.recordingsStore.markAnalysed(id, recording.jobId)
          void mainProcess.resumePollForJob(recording.jobId, {
            agent: recording.agent ?? undefined,
            map: recording.map ?? undefined,
            game: recording.game,
          })
          return { ok: true }
        }

        if (!jobMissing && (!serverStatus || !['uploading', 'failed'].includes(serverStatus.status))) {
          return {
            error: 'Could not check the earlier analysis of this recording. Your recording is saved. Try again in a moment.',
            code: 'upload_status_unconfirmed',
          }
        }

        const canCloudRetry = serverStatus?.status === 'failed' && !abortLike
        if (!canCloudRetry) {
          // Incomplete upload, cancel, or a job the server no longer has — re-upload from local/cloud archive below.
          mainProcess.recordingsStore.clearAnalysisFailure(id)
        } else {
        mainProcess.dismissMatchWaitUi()
        mainProcess.recordingsStore.clearAnalysisFailure(id)
        mainProcess.recordingsStore.markAnalysed(id, recording.jobId)
        mainProcess.bindPostGameSessionToRecording(recording)

        const triggerRetry = async (win: BrowserWindow) => {
          stopActiveAnalysisPoll()
          sendPostGameEventForRecording(win, id, 'post-game:upload-start', {
            game: recording!.game,
            map: recording!.map,
            agent: recording!.agent,
          }, getActiveUserId())
          try {
            await mainProcess.uploadManager.retrySubmission(recording!.jobId!, recording!.submissionFocusAreas)
            if ((recording!.game ?? 'valorant') === 'valorant') {
              // The retried job still holds the first upload's match_data — re-send fresh stats.
              const resent = await resendMatchDataForRetry(
                recording!.jobId!,
                await mainProcess.recordingsStore.getTimelineAsync(id),
                {
                  fetchMatchDetails: (matchId) => mainProcess.riotLocalApi.fetchMatchDetailsLate(matchId),
                  populateFromDetails: (timeline, details) => {
                    mainProcess.riotLocalApi.populateMatchDataFromDetails(timeline, details)
                    mainProcess.enrichTimelineSpatial(timeline)
                  },
                  saveTimeline: (timeline) => { mainProcess.recordingsStore.updateTimeline(id, timeline) },
                  patchMatchData: async (jobId, timeline) => {
                    const rrHistory = await mainProcess.authManager.fetchRRHistory().catch(() => [])
                    const extras = buildCoachingSubmissionExtras(
                      timeline,
                      mainProcess.settingsManager.get(),
                      rrHistory,
                      mainProcess.riotLocalApi.getDiagnostics().clientVersion,
                    )
                    await mainProcess.uploadManager.patchMatchData(jobId, timeline, extras)
                  },
                },
              ).catch((err) => {
                log.warn('[Retry] Failed to re-send match_data:', err)
                return 'no_match_data' as const
              })
              mainProcess.logActivity(`Retry match data: ${resent}`)
            }
            sendPostGameEventForRecording(
              win,
              id,
              'post-game:upload-complete',
              { jobId: recording!.jobId },
              getActiveUserId(),
            )
            mainProcess.logActivity('Retrying analysis from cloud recording')
            mainProcess.tray?.setToolTip('UpForge — Analysing...')
            startAnalysisPoll({
              uploadManager: mainProcess.uploadManager,
              jobId: recording!.jobId!,
              recordingId: id,
              ownerUserId: getActiveUserId(),
              targetWindow: win,
              mainWindow: mainProcess.mainWindow,
              onProgress: (status) => {
                const raw = status.progress
                const progress = typeof raw === 'number' && !Number.isNaN(raw)
                  ? Math.min(100, Math.max(0, Math.round(raw)))
                  : status.status === 'queued' ? 0 : 5
                mainProcess.recordingsStore.setAnalysisProgress(id, progress, status.current_step ?? null)
              },
              onCompleted: (status) => {
                const analysisId = extractAnalysisIdFromPollStatus(status)
                const rec = mainProcess.recordingsStore.getById(id)
                if (analysisId != null) {
                  if (rec?.path) {
                    mainProcess.maybeDeleteLocalRecordingAfterAnalysis(rec.path, {})
                  }
                }
                mainProcess.dispatchReconciledAnalysisReady({
                  jobId: recording!.jobId!,
                  status,
                  recordingId: id,
                  agent: rec?.agent ?? recording!.agent ?? null,
                  map: rec?.map ?? recording!.map ?? null,
                  game: rec?.game ?? recording!.game,
                })
              },
              onFailed: (userMessage, rawError, status) => {
                mainProcess.dispatchAnalysisFailure(rawError || userMessage, {
                  recordingId: id,
                  targetWindow: win,
                  failureDiagnostics: mainProcess.extractFailureDiagnostics(status),
                })
              },
              onConnectionLost: () => {},
              onPollEnded: () => {},
            })
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to retry analysis'
            mainProcess.sendUploadFailure(msg, {
              targetWindow: win,
              recordingId: id,
              notify: false,
              game: recording!.game,
            })
          }
        }

        if (!mainProcess.postGameWindow || mainProcess.postGameWindow.isDestroyed()) {
          mainProcess.postGameWindow = mainProcess.createPostGameWindow()
          whenWebContentsReady(mainProcess.postGameWindow, () => void triggerRetry(mainProcess.postGameWindow!))
        } else {
          mainProcess.postGameWindow.show()
          mainProcess.postGameWindow.focus()
          void triggerRetry(mainProcess.postGameWindow)
        }
        return { ok: true }
        }
      }

      const readinessCheck = await mainProcess.ensureAnalysisReadinessForAnalyse(id)
      if (!readinessCheck.ok) {
        return { error: readinessCheck.error, code: 'not_ready', state: readinessCheck.state }
      }
      const isCloudOnlyAnalysis = Boolean(
        recording.archiveId && recording.cloudArchived && !recording.analysed,
      )
      if ((mainProcess.matchCapturePriority || mainProcess.obsRecorder.isActivelyRecording()) && !isCloudOnlyAnalysis) {
        mainProcess.recordingsStore.setManualAnalyseRequested(id, true)
        mainProcess.recordingsStore.setPipelineDeferReason(id, 'recording')
        mainProcess.enqueuePostMatchAnalyse({
          recordingId: recording.id,
          videoPath: recording.path,
          riotName: recording.riotName,
          riotTag: recording.riotTag,
          game: recording.game,
          map: recording.map,
          agent: recording.agent,
          requestKind: 'manual',
        })
        mainProcess.notifyRecordingsUpdated()
        mainProcess.logActivity(POST_MATCH_COPY.pausedUntilGameEnds)
        return {
          error: POST_MATCH_COPY.pausedAnalyseBlocked,
          code: 'not_ready',
          state: 'deferred_recording',
        }
      }
      recording = readinessCheck.recording

      // Dashboard analyse is unrelated to live match capture — don't block on lobby wait.
      mainProcess.dismissMatchWaitUi()
      mainProcess.recordingsStore.clearAnalysisFailure(id)

      const user = mainProcess.authManager.getUser()
      mainProcess.bindPostGameSessionToRecording(recording)

      const triggerAnalysis = async (win: BrowserWindow) => {
        if (recording.archiveId && recording.cloudArchived && !recording.analysed) {
          stopActiveAnalysisPoll()
          sendPostGameEventForRecording(win, recording.id, 'post-game:upload-start', {
            game: recording.game,
            map: recording.map,
            agent: recording.agent,
          }, getActiveUserId())
          try {
            let timeline = recording.timeline
            let coachingExtras: CoachingSubmissionExtras | undefined
            if (timeline && recording.game === 'valorant') {
              const prepared = await mainProcess.prepareTimelineForCoaching(timeline, recording.game, recording.id)
              coachingExtras = prepared.extras
              timeline = mainProcess.recordingsStore.getById(recording.id)?.timeline ?? timeline
              mainProcess.recordingsStore.updateTimeline(recording.id, timeline)
            }
            const result = await mainProcess.uploadManager.analyseArchive(
              recording.archiveId!,
              recording.game,
              timeline,
              coachingExtras,
              recording.submissionFocusAreas,
            )
            mainProcess.recordingsStore.markAnalysed(recording.id, result.job_id)
            mainProcess.notifyRecordingsUpdated()
            sendPostGameEventForRecording(
              win,
              recording.id,
              'post-game:upload-complete',
              { jobId: result.job_id },
              getActiveUserId(),
            )
            mainProcess.logActivity('Analysis queued for cloud recording')
            mainProcess.tray?.setToolTip('UpForge — Analysing...')
            startAnalysisPoll({
              uploadManager: mainProcess.uploadManager,
              jobId: result.job_id,
              recordingId: recording.id,
              ownerUserId: getActiveUserId(),
              targetWindow: win,
              mainWindow: mainProcess.mainWindow,
              onProgress: (status) => {
                const raw = status.progress
                const progress = typeof raw === 'number' && !Number.isNaN(raw)
                  ? Math.min(100, Math.max(0, Math.round(raw)))
                  : status.status === 'queued' ? 0 : 5
                mainProcess.recordingsStore.setAnalysisProgress(recording.id, progress, status.current_step ?? null)
              },
              onCompleted: (status) => {
                const analysisId = extractAnalysisIdFromPollStatus(status)
                const rec = mainProcess.recordingsStore.getById(recording.id)
                if (analysisId != null) {
                  if (rec?.path) {
                    mainProcess.maybeDeleteLocalRecordingAfterAnalysis(rec.path, {})
                  }
                }
                mainProcess.dispatchReconciledAnalysisReady({
                  jobId: result.job_id,
                  status,
                  recordingId: recording.id,
                  agent: rec?.agent ?? recording.agent ?? null,
                  map: rec?.map ?? recording.map ?? null,
                  game: rec?.game ?? recording.game,
                })
              },
              onFailed: (userMessage, rawError, status) => {
                mainProcess.dispatchAnalysisFailure(rawError || userMessage, {
                  recordingId: recording.id,
                  targetWindow: win,
                  failureDiagnostics: mainProcess.extractFailureDiagnostics(status),
                })
              },
              onConnectionLost: () => {},
              onPollEnded: () => {},
            })
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to queue analysis'
            mainProcess.sendUploadFailure(msg, {
              targetWindow: win,
              recordingId: recording.id,
              needsUpgrade: err instanceof UpgradeRequiredError,
              notify: false,
              game: recording.game,
            })
          }
          return
        }

        mainProcess.recordingsStore.setManualAnalyseRequested(recording.id, true)
        mainProcess.enqueuePostMatchAnalyse({
          recordingId: recording.id,
          videoPath: recording.path,
          ...resolveUploadPlayerIdentity(recording.game, recording.timeline, user, recording),
          game: recording.game,
          map: recording.map,
          agent: recording.agent,
          requestKind: 'manual',
        })
      }

      if (!mainProcess.postGameWindow || mainProcess.postGameWindow.isDestroyed()) {
        mainProcess.postGameWindow = mainProcess.createPostGameWindow()
        whenWebContentsReady(mainProcess.postGameWindow, () => void triggerAnalysis(mainProcess.postGameWindow!))
      } else {
        mainProcess.postGameWindow.show()
        mainProcess.postGameWindow.focus()
        void triggerAnalysis(mainProcess.postGameWindow)
      }

      return { ok: true }
    })

    ipcMain.handle('recordings:save-to-cloud', async (e, { id }: { id: string }) => {
      if (mainProcess.productionVodFixtures.getById(id)) {
        return { ok: false as const, error: 'Production fixtures are already stored in production and are read-only' }
      }
      const recording = mainProcess.recordingsStore.getById(id)
      if (!recording) return { ok: false as const, error: 'Recording not found' }
      if (recording.cloudArchived && recording.archiveId) {
        return { ok: true as const, archiveId: recording.archiveId, alreadySaved: true }
      }
      if (!fs.existsSync(recording.path)) {
        return { ok: false as const, error: 'Recording file missing on disk' }
      }

      const user = mainProcess.authManager.getUser()
      const targetWindow = BrowserWindow.fromWebContents(e.sender)
        ?? (mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed() ? mainProcess.mainWindow : null)
      if (!targetWindow || targetWindow.isDestroyed()) {
        return { ok: false as const, error: 'App window unavailable' }
      }

      const deleteLocal = mainProcess.settingsManager?.get().autoDelete ?? true
      const { archiveId, lastError } = await mainProcess.doUploadArchiveOnly(
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
        return {
          ok: false as const,
          error: lastError?.message ?? 'Could not save your recording to cloud. Try again from the dashboard.',
          title: lastError?.title,
          hint: lastError?.hint,
          failureCode: lastError?.failureCode,
        }
      }
      return { ok: true as const, archiveId }
    })

    mainProcess.valorantRankService = setupValorantRankHandlers({
      ipcMain,
      riot: mainProcess.riotLocalApi,
      auth: mainProcess.authManager,
      getWindow: () => mainProcess.mainWindow,
      isDev: is.dev,
    })

    setupStorageHandlers(ipcMain, {
      recordingsStore: mainProcess.recordingsStore,
      authManager: mainProcess.authManager,
      settingsManager: mainProcess.settingsManager,
      getMainWindow: () => mainProcess.mainWindow,
      getActiveUserId,
      linkedRiotFromAuth: mainProcess.linkedRiotFromAuth,
      recordingSavePath: mainProcess.recordingSavePath,
      logActivity: mainProcess.logActivity,
      doUploadArchiveOnly: mainProcess.doUploadArchiveOnly,
    })

    setupRecordingsHandlers(ipcMain, {
      recordingsStore: mainProcess.recordingsStore,
      clipStore: mainProcess.clipStore,
      authManager: mainProcess.authManager,
      settingsManager: mainProcess.settingsManager,
      clipExtractor: mainProcess.clipExtractor,
      getMainWindow: () => mainProcess.mainWindow,
      logActivity: mainProcess.logActivity,
      abortInFlightAnalysisForRecording: mainProcess.abortInFlightAnalysisForRecording,
      cancelMatchStatsSync: mainProcess.cancelAnalysisReadinessRefresh,
      refreshReplayTimelineForRecording: mainProcess.refreshReplayTimelineForRecording,
      extractMatchClips: mainProcess.extractMatchClips,
      enrichTimelineSpatial: mainProcess.enrichTimelineSpatial,
      productionVodFixtures: mainProcess.productionVodFixtures,
    })

    // Register global shortcut to show/focus window
    globalShortcut.register('CommandOrControl+Shift+U', () => {
      // The updater destroys windows before it installs; shortcuts stay registered until before-quit.
      if (mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed()) {
        mainProcess.mainWindow.show()
        mainProcess.mainWindow.focus()
      }
    })
  }

  return { startApp }
}
