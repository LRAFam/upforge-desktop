import { resolveValorantGameMode } from './riot-queue-id'
import { hasValorantReturnedToMenus, isValorantStillInLiveMatch } from './valorant-match-end'
import { startRecordingWhenReady, startRecordingWithRetry } from './recording-start'
import { resolveMatchEndCapture, shouldFinalizeMatchMedia } from './match-end-capture'
import { trackProductActivity } from './product-activity'
import { REARM_PROCESS_MAX_AGE_MS, VALORANT_IN_MATCH_PROCESS_CHECK_MS } from './process-poll-plan'
import { RECORDING_MAX_DURATION_CHECK_MS, checkRecordingMaxDuration, createIgnoredStartRearm, createSerialRunner, isSupersededGameStop, maxRecordingDurationMs, resolveGameStartOwnership } from './recording-ownership'
import { BrowserWindow } from 'electron'
import fs from 'fs'
import { showAppNotification, setMatchRecordingGuard } from './app-notifications'
import { decideMatchWaitAfterProcessMiss, formatMatchWaitCancelActivity, formatMatchWaitMilestone, MATCH_WAIT_MILESTONE_MS, shouldAbortMatchWaitOnGameStopped, shouldCancelGenericProcessMiss, shouldSuppressFinalizeOnGameStopped, shouldLogUnknownProbe, shouldReauthAfterPresenceNulls } from './match-wait-guard'
import { buildRecorderConfig } from './obs-output-settings'
import { hasProAccess } from './subscription'
import { MIN_RECORDING_DURATION_SECONDS, MIN_RECORDING_FILE_BYTES } from './recording-limits'
import { formatRecordingLabel } from './recording-preset'
import { decidePostMatchNextStep, isWaitingMatchDataState } from './post-match-steps'
import { POST_MATCH_COPY, matchDataReadyUploading, waitingMatchDataBeforeAnalyse, waitingMatchDataBeforeUpload } from '../../src/lib/post-match-copy'
import { resolveReadyRecordingPath, resolveReadyRecordingPathDetailed } from './recording-path-resolver'
import { shouldRelaunchAfterFinalize } from './obs-watchdog-policy'
import { isObsProcessRunning } from './obs-process'
import { decideRiotAccountSwitch, riotSwitchNotice } from './riot-account-switch'
import { isModeFilteredOut, getRecordedModesForGame, recordableModesForGame, normalizeCs2GameMode, modeSkippedMessage } from './recorded-modes-filter'
import type { LolCaptureContext } from './lol-account-identity'
import { probeLolLcu, resolveLolFilterMode } from './lol-lcu-api'
import { gameLabel, idleTooltip, normalizeGameId as normalizePrimaryGame, resolveGameMode, resolveMapLabel } from './game-config'
import { emptyMatchData } from './recording-sync'
import { getActiveUserId } from './user-session'
import { resolveRecordingSavePath } from './user-data-paths'
import { trackFirstRecording, trackMatchDetected, trackRecordingStarted, trackRecordingFailed } from './funnel-events'
import { clearTrainerLaunchGame } from './ipc/gaming-ipc'
import { startObsStatsSampler } from './obs-stats-sampler'
import { sha256File } from './recording-checksum'
import { formatRecordingFailure, formatCorruptRecordingMessage } from './capture-backend'
import { reportRecordingError } from './recording-errors'
import { estimateRecordingBytes, exceedsRecordingSizeCap, recommendSettingsUnderCap } from './recording-size-estimate'
import { shouldUseOnboardingBonus } from '../../src/lib/onboarding-match-mission'
import { ffmpegPath } from './clip-extractor'
import { alignValorantTimelineByRoundTimer, ffmpegFrameReader } from './valorant-timer-sync'
import { createOverlayWindow, destroyOverlay, sendOverlayData } from './overlay-window'
import { deliverInGameFeedback } from './in-game-feedback'
import { getSessionPollIntervalMs, isInGameOverlayEnabled } from './in-game-overlay'
import { shouldMinimizeForDetectedGame, shouldOpenPostGameWindow } from './onboarding-window-policy'
import type { MatchData } from './riot-types'
import log from 'electron-log'
import { reportPipelineError } from './pipeline-errors'
import { CRITICAL_FREE_DISK_BYTES, LOW_FREE_DISK_BYTES, formatFreeDiskLabel, getFreeDiskSpace } from './disk-space'
import { tryAutoUploadSourceReplay, uploadReplayInBackground } from './post-match-replay'
import { whenWebContentsReady } from './window-manager'
import { enrichTimelineForCoaching } from './match-coaching-enrich'
import { formatLolMatchEndActivity } from './lol-enrich-activity'
import { getAnalysisReadiness, waitUntilVodFileReady } from './analysis-readiness'
import { beginPreparation, setPrepStep, completePreparation, failPreparation } from './preparation-instrumentation'
import { capturePostGameSession, getPostGameSessionSnapshot, isPostGamePastPreparing, resetPostGameSession, sendPostGameEvent } from './post-game-session'
import { hasRichMatchData, hasRichMatchDataForGame, MATCH_DETAILS_ENRICH_MAX_MS, shouldDeferPostGameForDemoSync, shouldScheduleLateClipRetry, cs2RecordingSavedDashboardMessage, deadlockRecordingSavedDashboardMessage } from './match-data-quality'
import { type CoachingSubmissionExtras } from './match-coaching-context'
import { decideValorantNextMatchRearm } from './valorant-next-match-rearm'
import { startSteamGsiServer, ensureGsiAuthToken, resetSteamGsiSession, installSteamGsiConfig, isGsiServerReady, isGsiPortBlocked, isGsiMatchLive, isGsiMatchEnded, gsiMatchEndReason, hasEverReceivedGsi, getLatestGsiMap, getLatestGsiPayload, getActiveGsiPort, cs2GsiTracker } from './steam-gsi-server'
import { startDeadlockLogWatcher, stopDeadlockLogWatcher, resetDeadlockLogSession, noteDeadlockWaitStarted, isDeadlockReadyToRecord, isDeadlockMatchEnded, isDeadlockMatchLive, isDeadlockDetectionActive, suppressDeadlockAutoRecordUntilNewMatch, getDeadlockMap, getDeadlockHero, getDeadlockLobbyMatchId, getDeadlockMatchStartedAt, getDeadlockDetectionStatus } from './deadlock-match-watcher'
import { recordingHeroLabel, resolveDeadlockRecordingMatch } from './deadlock-recording-hero'
import { deadlockAllowsAutoAnalyse } from './deadlock-auto-analyse'
import { startLiveCoachFlow } from './ipc/coach-flow-live-ipc'
import { prepareMatchDataForUpload } from './match-data-payload'
import { getGameDataCapture } from './game-data-capture'
import { removeLegacyCs2DemoConfig } from './cs2-steam-setup'
import { resolveCs2LocalPlayerName } from './cs2-player-identity'
import { uploadsSourceReplay, usesDemoReplay, gameNeedsLiveMatchWindow } from './game-capabilities'
import { buildMatchEndTimeline, fetchLiveClientTimeline } from './match-end-timeline'
import { scheduleLateClipRetry } from './late-clip-retry'
import type { MainRuntimeBindings } from './main-runtime-context'

export type MainMatchDetectionContext = Pick<MainRuntimeBindings,
  | 'POST_GAME_VOD_PROBE_MAX_MS'
  | 'abortBackgroundWorkOnGameStart'
  | 'activeCapture'
  | 'activeMatchTelemetry'
  | 'authManager'
  | 'backgroundMatchState'
  | 'beginMatchPerformanceMode'
  | 'beginMatchTelemetry'
  | 'cachedShippingProcessUp'
  | 'cancelMatchWait'
  | 'captureOwnerId'
  | 'captureOwnership'
  | 'clipStore'
  | 'createPostGameWindow'
  | 'cs2DemoRetrieval'
  | 'currentGsiMapName'
  | 'currentMatchGameMode'
  | 'currentMatchStartTime'
  | 'currentRecordingOwnerGame'
  | 'currentRecordingStartTime'
  | 'deadlockAutoUploadGate'
  | 'deadlockQueueLookups'
  | 'deadlockSessionStartAt'
  | 'discordMatchContext'
  | 'discordRPC'
  | 'dropAutomaticDeadlockJobs'
  | 'emitActiveOpsLap'
  | 'endMatchPerformanceMode'
  | 'enqueuePostMatchAnalyse'
  | 'ensureObsCaptureForGame'
  | 'ensureObsReady'
  | 'ensureObsReadyOrThrow'
  | 'extractMatchClips'
  | 'finalizeAfterObsProcessDeath'
  | 'finalizeTimelineOffsetsForClips'
  | 'gameDetector'
  | 'getRecordingBackendForStatus'
  | 'gsiPollTimer'
  | 'hotkeyBookmarks'
  | 'inGameFeedbackDeps'
  | 'isBlockingVodReadiness'
  | 'isObsUnavailableError'
  | 'lastMatchDiagnostic'
  | 'lastReplayRetryContext'
  | 'lastShippingProcessCheckAt'
  | 'lateClipRetryDeps'
  | 'linkAutoDeadlockReviewJob'
  | 'localMediaWork'
  | 'logActivity'
  | 'lolLiveClientApi'
  | 'lolLocalCollector'
  | 'mainWindow'
  | 'manualEndMatchRecording'
  | 'matchDetectInFlightDepth'
  | 'matchFinalizeInFlight'
  | 'matchFlowGame'
  | 'matchFlowGeneration'
  | 'matchHandled'
  | 'maybeResumeDeferredUploads'
  | 'notifyDashboardToast'
  | 'notifyObsRecordingUnavailable'
  | 'notifyRecordingUx'
  | 'notifyRecordingsUpdated'
  | 'notifySilent'
  | 'obsRecorder'
  | 'obsWatchdogSnapshot'
  | 'offerGuestMediaClaim'
  | 'onRecordingLost'
  | 'overlayPollTimer'
  | 'overstepBridge'
  | 'pendingRecordingStart'
  | 'performanceManager'
  | 'postGameWindow'
  | 'postMatchWorker'
  | 'prepareTimelineForCoaching'
  | 'pushPregameContext'
  | 'rearmWatchInFlight'
  | 'recordingSavePath'
  | 'recordingSessionLog'
  | 'recordingsStore'
  | 'refreshDeadlockProfile'
  | 'refreshRecordingVodProbe'
  | 'refreshReplayTimelineForRecording'
  | 'registerClipOnlySession'
  | 'rememberSkippedMatch'
  | 'replayCaptureOwnerId'
  | 'requestPostGameDebrief'
  | 'requestPregameBrief'
  | 'resumeSavedLocalMedia'
  | 'riotLocalApi'
  | 'scanForOrphanedRecordings'
  | 'scheduleAnalysisReadinessRefresh'
  | 'scheduleFocusSyncAfterMatch'
  | 'sendLolLocalReport'
  | 'sendUploadFailure'
  | 'settingsManager'
  | 'shouldRequestDebrief'
  | 'stopActiveObsStatsSampler'
  | 'stopObsStatsSampling'
  | 'syncPrimaryGameFromDetection'
  | 'syncScoutMomentsForJob'
  | 'tray'
  | 'waitingForMatch'
  | 'warmupPrompt'
>

/** Keeps callbacks bound to the live application state rather than a startup snapshot. */
export function createMainMatchDetection(mainProcess: MainMatchDetectionContext) {
  function setupGameDetection(): void {
    setMatchRecordingGuard(() => mainProcess.obsRecorder.isActivelyRecording())
    ensureGsiAuthToken(mainProcess.settingsManager)
    startSteamGsiServer({
      onStaleConfig: () => mainProcess.logActivity('CS2 match detection: restart CS2 once so it loads UpForge\'s updated (secured) config', 'cs2'),
      preferredPort: mainProcess.settingsManager.get().cs2GsiPort,
      onPortChanged: ({ port, previousPort }) => {
        mainProcess.settingsManager.save({ cs2GsiPort: port })
        mainProcess.logActivity(`CS2 match detection: port ${previousPort} was busy, now using ${port} — restart CS2 if it is open`, 'cs2')
      },
    })
    // Existing installs: rewrite the CS2 GSI cfg with the auth token (CS2 loads it on next launch).
    void installSteamGsiConfig('cs2').then((r) => {
      if (r.needsRestart) log.info('[SteamGSI] CS2 GSI cfg updated with auth token — restart CS2 once to load it')
    }).catch(() => {})
    mainProcess.gameDetector.setWatchGame(normalizePrimaryGame(mainProcess.settingsManager.get().primaryGame))
    // Undo the old autoexec edit for a CS2 cvar that does not exist.
    void removeLegacyCs2DemoConfig()

    mainProcess.onRecordingLost = (error: string) => {
      const game = mainProcess.gameDetector.currentGame() ?? 'valorant'
      const obsLost = /obs disconnected/i.test(error)
      const obsProcessExited = /process exited/i.test(error)
      if (!obsProcessExited) {
        mainProcess.logActivity(
          obsLost
            ? 'OBS disconnected mid-match — OBS may still be recording; will recover when the match ends'
            : `Recording lost mid-match: ${error}`,
        )
      }
      mainProcess.notifyRecordingUx(
        obsLost
          ? 'OBS disconnected from UpForge. Keep OBS open — your match should still save when it ends. Reconnect in Settings → Recording before the next game.'
          : obsProcessExited
            ? 'OBS closed during the match — UpForge is reclaiming and saving your recording now.'
            : 'Recording stopped unexpectedly — the match continues but may not be saved. Check permissions and disk space.',
        obsLost
          ? 'UpForge — OBS Disconnected'
          : obsProcessExited
            ? 'UpForge — OBS Closed'
            : 'UpForge — Recording Lost',
      )
      mainProcess.tray?.setToolTip(
        obsLost
          ? 'UpForge — OBS disconnected'
          : obsProcessExited
            ? 'UpForge — OBS closed'
            : 'UpForge — Recording lost!',
      )
      setTimeout(() => mainProcess.tray?.setToolTip(idleTooltip(game)), 10_000)
    }

    // All known Valorant game modes returned by the Riot Local Client API
    // (includes The Range so "every chip selected" is the only all-modes path)

    /** Invalidate older game-started handlers and cancel their lobby-wait loops. */
    function beginMatchFlow(): { isStale: () => boolean } {
      mainProcess.pendingRecordingStart?.controller.abort()
      mainProcess.pendingRecordingStart = null
      // A new flow owns match end; never leave a superseded flow's GSI end-poller running.
      if (mainProcess.gsiPollTimer) { clearInterval(mainProcess.gsiPollTimer); mainProcess.gsiPollTimer = null }
      mainProcess.matchFlowGeneration++
      const generation = mainProcess.matchFlowGeneration
      mainProcess.matchHandled = false
      mainProcess.riotLocalApi.cancelMenuWatch()
      mainProcess.riotLocalApi.onMatchEnded = null
      mainProcess.cancelMatchWait?.()
      mainProcess.cancelMatchWait = null
      if (mainProcess.waitingForMatch) {
        mainProcess.waitingForMatch = false
        mainProcess.mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })
      }
      return { isStale: () => generation !== mainProcess.matchFlowGeneration }
    }

    /** Exit superseded lobby-wait loops and reset dashboard "waiting for match" UI. */
    function abortIfStale(isStale: () => boolean, game: string): boolean {
      if (!isStale()) return false
      mainProcess.waitingForMatch = false
      mainProcess.cancelMatchWait = null
      mainProcess.mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })
      mainProcess.tray?.setToolTip(idleTooltip(game))
      return true
    }

    function clearOverlayPolling(): void {
      if (mainProcess.overlayPollTimer) { clearInterval(mainProcess.overlayPollTimer); mainProcess.overlayPollTimer = null }
      if (mainProcess.gsiPollTimer) { clearInterval(mainProcess.gsiPollTimer); mainProcess.gsiPollTimer = null }
      mainProcess.cachedShippingProcessUp = true
      mainProcess.lastShippingProcessCheckAt = 0
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
      if (mainProcess.matchHandled) {
        log.info(`[MatchEnd] Ignoring duplicate end signal (${source})`)
        return false
      }
      const captureNeverStarted = mainProcess.pendingRecordingStart?.game === game && !mainProcess.obsRecorder.isRecording()
      mainProcess.matchHandled = true
      if (mainProcess.pendingRecordingStart?.game === game) mainProcess.pendingRecordingStart.controller.abort()
      clearOverlayPolling()
      mainProcess.riotLocalApi.onMatchEnded = null
      mainProcess.lolLiveClientApi.onMatchEnded = null
      mainProcess.mainWindow?.webContents.send('recording:starting', { starting: false })

      const run = async (): Promise<boolean> => {
        try {
          await handleMatchEnd(game, source, captureNeverStarted)
          mainProcess.scheduleFocusSyncAfterMatch(game)
          return true
        } catch (err) {
          log.error(`[MatchEnd] handleMatchEnd failed (${source}):`, err)
          mainProcess.matchHandled = false
          throw err
        }
      }

      mainProcess.matchFinalizeInFlight = run().finally(() => { mainProcess.matchFinalizeInFlight = null })
      return mainProcess.matchFinalizeInFlight
    }

    async function finalizeAfterObsProcessDeathImpl(): Promise<void> {
      // The game whose recording OBS was writing — never the selected game tab.
      const ownerGame = mainProcess.currentRecordingOwnerGame()
      mainProcess.logActivity('OBS process exited — reclaiming recording file if present', ownerGame ?? undefined)

      if (mainProcess.matchFinalizeInFlight) {
        await mainProcess.matchFinalizeInFlight
      } else if (!mainProcess.matchHandled && !ownerGame) {
        // No detected game owns a recording: the file is left for orphan import (labelled by session).
        log.warn('[OBS] Process exited with no detected game owning a recording — nothing to finalise')
      } else if (!mainProcess.matchHandled && ownerGame) {
        const didFinalize = await finalizeMatchOnce(ownerGame, 'obs-process-death')
        if (!didFinalize) return
        mainProcess.endMatchPerformanceMode()
        if (ownerGame === 'deadlock') void mainProcess.refreshDeadlockProfile(true)
        destroyOverlay()
      }

      const processRunning = await isObsProcessRunning()
      if (shouldRelaunchAfterFinalize(mainProcess.obsWatchdogSnapshot({ processRunning }))) {
        void mainProcess.ensureObsReady({ allowProcessRestart: true })
      }
    }

    mainProcess.finalizeAfterObsProcessDeath = finalizeAfterObsProcessDeathImpl

    /**
     * True when Riot still shows match flow (agent select / loading / live), even if
     * Shipping.exe briefly disappears from tasklist (load restart, alt-tab flake).
     * null = Riot unreachable — caller should not treat as confirmed quit.
     */
    async function isValorantMatchFlowActive(): Promise<boolean | null> {
      try {
        const state = await mainProcess.riotLocalApi.getSessionState()
        const loop = state?.sessionLoopState
        if (loop === 'PREGAME' || loop === 'INGAME') return true
        if (loop === 'MENUS') {
          const coreActive = await mainProcess.riotLocalApi.isCoreGameSessionActive()
          if (coreActive === true) return true
          const pregameActive = await mainProcess.riotLocalApi.isPregameSessionActive()
          if (pregameActive === true) return true
          if (coreActive === false && pregameActive === false) return false
          return null
        }
        if (loop) {
          // CUSTOM_GAME / other non-MENUS loops — treat as still in flow
          return true
        }
        const coreActive = await mainProcess.riotLocalApi.isCoreGameSessionActive()
        if (coreActive === true) return true
        const pregameActive = await mainProcess.riotLocalApi.isPregameSessionActive()
        if (pregameActive === true) return true
        if (coreActive === false && pregameActive === false) return false
        return null
      } catch {
        return null
      }
    }

    async function finishActiveMatch(game: string, source: string): Promise<void> {
      if (mainProcess.matchHandled) return
      const generation = mainProcess.matchFlowGeneration
      const starting = mainProcess.pendingRecordingStart?.game === game
      if (!starting && !(await mainProcess.obsRecorder.isCaptureActive())) return

      const stillLive = game === 'valorant' && await isValorantStillInLiveMatch({
        isMatchProcessRunning: () => mainProcess.gameDetector.isMatchProcessRunning(),
        getSessionState: () => mainProcess.riotLocalApi.getSessionState(),
        isCoreGameSessionActive: () => mainProcess.riotLocalApi.isCoreGameSessionActive(),
        isPregameSessionActive: () => mainProcess.riotLocalApi.isPregameSessionActive(),
        hasMatchEndSessionEvidence: () => mainProcess.riotLocalApi.hasMatchEndSessionEvidence(),
      })
      if (generation !== mainProcess.matchFlowGeneration || mainProcess.matchHandled) return
      if (stillLive) {
        log.info(`[MatchEnd] Suppressing false end (${source}) — Valorant match still live`)
        mainProcess.logActivity('False match-end ignored — recording continues')
        mainProcess.riotLocalApi.clearSuppressedMatchEnd()
        mainProcess.riotLocalApi.onMatchEnded = () => {
          if (generation === mainProcess.matchFlowGeneration) return finishActiveMatch(game, 'presence')
        }
        if (!mainProcess.obsRecorder.isRecording() && await mainProcess.obsRecorder.isObsOutputActive()) {
          await mainProcess.obsRecorder.reclaimActiveRecording()
        }
        return
      }

      if (generation !== mainProcess.matchFlowGeneration || mainProcess.matchHandled) return
      const elapsedSec = mainProcess.currentRecordingStartTime
        ? Math.floor((Date.now() - mainProcess.currentRecordingStartTime) / 1000)
        : 0
      const durationLabel = elapsedSec > 0
        ? `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`
        : 'unknown duration'
      log.info(`[MatchEnd] ${source} — stopping recording (${elapsedSec}s captured)`)
      mainProcess.logActivity(`Match ended (${source}) — stopping recording (${durationLabel})`)
      mainProcess.riotLocalApi.onMatchEnded = null
      mainProcess.lolLiveClientApi.onMatchEnded = null

      const didFinalize = await finalizeMatchOnce(game, source)
      if (!didFinalize) return
      mainProcess.endMatchPerformanceMode()
      if (game === 'deadlock') void mainProcess.refreshDeadlockProfile(true)
      if (mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed() && mainProcess.mainWindow.isMinimized()) mainProcess.mainWindow.restore()
      destroyOverlay()
      await rearmGameDetection(game)
    }

    /** Re-enter detection after a skipped match (Valorant stays running between queues). */
    async function rearmValorantDetection(game: string, waitForMatchEnd = false): Promise<void> {
      if (game !== 'valorant') return
      const emitNextMatchWatch = async () => {
        mainProcess.endMatchPerformanceMode()
        await new Promise((r) => setTimeout(r, 5000))
        if (await mainProcess.obsRecorder.releaseStaleMatchOwnership()) {
          mainProcess.logActivity('Cleared stale recording state — watching for next match')
        }
        const processRunning = await mainProcess.gameDetector.isMatchProcessRunning()
        if (decideValorantNextMatchRearm(processRunning) === 'reset_and_wait_for_process') {
          mainProcess.gameDetector.resetActiveGame(game)
          log.info('[GameDetector] Valorant process ended — waiting for the next match process')
          mainProcess.logActivity('Watching for next match...')
          return
        }

        // Avoid stop/start loops: a false early match-end while still INGAME must not
        // immediately start a second recording for the same live match.
        try {
          const authOk = await mainProcess.riotLocalApi.initAuth()
          if (authOk) {
            const state = await mainProcess.riotLocalApi.getSessionState()
            if (state?.sessionLoopState === 'INGAME') {
              const coreActive = await mainProcess.riotLocalApi.isCoreGameSessionActive()
              // coreActive null = API flake — treat as still in match while Shipping is up.
              if (coreActive !== false) {
                log.info('[GameDetector] Still INGAME — waiting for menus before re-arm')
                mainProcess.logActivity('Still in match — waiting for post-game lobby before next recording')
                mainProcess.riotLocalApi.watchUntilMenus(
                  emitNextMatchWatch,
                  () => mainProcess.gameDetector.isMatchProcessRunning(),
                )
                return
              }
            }
          } else if (await mainProcess.gameDetector.isMatchProcessRunning()) {
            // Can't read presence — don't spam re-arm while the game process is up.
            log.info('[GameDetector] Riot auth unavailable — waiting for menus before re-arm')
            mainProcess.riotLocalApi.watchUntilMenus(
              emitNextMatchWatch,
              () => mainProcess.gameDetector.isMatchProcessRunning(),
            )
            return
          }
        } catch {
          if (await mainProcess.gameDetector.isMatchProcessRunning()) {
            mainProcess.riotLocalApi.watchUntilMenus(
              emitNextMatchWatch,
              () => mainProcess.gameDetector.isMatchProcessRunning(),
            )
            return
          }
        }

        log.info('[GameDetector] Re-arming after skipped match — watching for next queue')
        mainProcess.logActivity('Watching for next match...')
        mainProcess.gameDetector.emit('game-started', game)
      }
      if (waitForMatchEnd) {
        // onMatchEnded only fires when start() is running presence polls — skipped matches
        // never call start(), so watch menus directly until the player leaves the map
        // (or goes straight into the next agent select).
        log.info('[GameDetector] Skipped match — waiting for menus or the next agent select before re-arm')
        mainProcess.riotLocalApi.watchUntilMenus(
          emitNextMatchWatch,
          () => mainProcess.gameDetector.isMatchProcessRunning(),
        )
        return
      }
      await emitNextMatchWatch()
    }

    /** Re-arm lobby watch when a title stays open between matches (or reopens after restart). */
    async function rearmGameDetection(game: string, waitForMatchEnd = false): Promise<void> {
      if (game === 'valorant') {
        return rearmValorantDetection(game, waitForMatchEnd)
      }
      if (!usesDemoReplay(game)) return
      if (mainProcess.rearmWatchInFlight === game) return
      mainProcess.rearmWatchInFlight = game

      // Keep the game active while re-arming: a null active game made the detector's next poll emit
      // its own game-started, so two match flows ran at once (3.2.5 CS2 "app"/"cs2" start/stop loop).
      mainProcess.gameDetector.reviveActiveGame(game)

      try {
        const REWATCH_MS = 15 * 60 * 1000
        const deadline = Date.now() + REWATCH_MS
        let waitingForLobbyClear = false
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 3000))
          // The detector's own process list, not a filtered tasklist per tick (20 spawns/min in-match).
          if (await mainProcess.gameDetector.probeGameProcessRecent(game, REARM_PROCESS_MAX_AGE_MS) === 'stopped') continue

          const stillInMatch = game === 'deadlock'
            ? (isDeadlockMatchLive() || isDeadlockReadyToRecord())
            : (waitForMatchEnd && isGsiMatchLive())

          if (stillInMatch) {
            if (!waitingForLobbyClear) {
              waitingForLobbyClear = true
              mainProcess.logActivity(
                `${gameLabel(game)} still in match — waiting for post-game before next recording`,
                game,
              )
            }
            continue
          }

          mainProcess.endMatchPerformanceMode()
          if (game === 'cs2') resetSteamGsiSession()
          if (game === 'deadlock') resetDeadlockLogSession()

          log.info(`[GameDetector] ${game} running — watching for next match`)
          mainProcess.logActivity(`${gameLabel(game)} detected — waiting for a live match to start recording`, game)
          mainProcess.gameDetector.rearmWatch(game)
          return
        }
      } finally {
        if (mainProcess.rearmWatchInFlight === game) mainProcess.rearmWatchInFlight = null
      }
    }

    let handleMatchEndRunning = false
    const runMatchEndSerially = createSerialRunner()
    /**
     * Serialised: a re-entrant call used to be dropped while matchHandled stayed true, leaving the
     * newer match's OBS recording owned forever (card 232). Queue it behind the running one instead.
     */
    function handleMatchEnd(game: string, endSource = 'unknown', captureNeverStarted = false): Promise<void> {
      if (handleMatchEndRunning) log.warn(`[HandleMatchEnd] Previous match end still running — queued ${game} (${endSource})`)
      return runMatchEndSerially(() => handleMatchEndSerial(game, endSource, captureNeverStarted))
    }
    async function handleMatchEndSerial(game: string, endSource: string, captureNeverStarted: boolean): Promise<void> {
      handleMatchEndRunning = true
      mainProcess.localMediaWork++
      const ownerId = mainProcess.captureOwnerId()
      const captureStore = mainProcess.recordingsStore.forUser(ownerId)
      const lolLocalCapture = game === 'lol' ? mainProcess.lolLocalCollector.snapshot() : null
      let lolSessionStart: number | null = null
      const captureClips = mainProcess.clipStore.forUser(ownerId)
      const canUploadCapture = () => ownerId !== null
        && mainProcess.authManager.isAuthenticated() && getActiveUserId() === ownerId
      try {
      const config = mainProcess.settingsManager?.get()
      const savePath = resolveRecordingSavePath(mainProcess.settingsManager?.get().savePath, ownerId)

      if (!shouldFinalizeMatchMedia(captureNeverStarted, usesDemoReplay(game))) {
        await fetchLiveClientTimeline(game, {
          stopValorantTimeline: () => mainProcess.riotLocalApi.stop(),
          stopLolTimeline: () => mainProcess.lolLiveClientApi.stop(),
        })
        mainProcess.logActivity('Match ended before recording started — no video to process', game)
        return
      }

      // Duration from OBS clock, or wall clock if WebSocket dropped mid-match.
      let recordingDuration = captureNeverStarted ? 0 : mainProcess.obsRecorder.getRecordingDuration()
      if (!captureNeverStarted && recordingDuration === 0 && mainProcess.currentRecordingStartTime) {
        recordingDuration = Math.floor((Date.now() - mainProcess.currentRecordingStartTime) / 1000)
      }
      const matchSessionStart = mainProcess.currentMatchStartTime ?? mainProcess.currentRecordingStartTime
        ?? (Date.now() - recordingDuration * 1000)
      const matchWallDurationSec = matchSessionStart
        ? Math.floor((Date.now() - matchSessionStart) / 1000)
        : recordingDuration
      const effectiveDuration = Math.max(recordingDuration, matchWallDurationSec)
      lolSessionStart = matchSessionStart

      let timeline: MatchData | null = null
      let pendingReplayPath: string | null = null

      const [liveTimeline, stoppedPath] = await Promise.all([
        fetchLiveClientTimeline(game, {
          stopValorantTimeline: () => mainProcess.riotLocalApi.stop(),
          stopLolTimeline: () => mainProcess.lolLiveClientApi.stop(),
        }),
        // A match ending before startup must not stop an onboarding-owned output.
        captureNeverStarted
          ? Promise.resolve(null)
          : mainProcess.obsRecorder.stop(),
      ])
      const outputStillFinalizing = stoppedPath !== null && mainProcess.obsRecorder.getFinalizingRecordingPath() === stoppedPath
      if (!captureNeverStarted) {
        if (mainProcess.obsRecorder.isRecording()) {
          log.warn(`[MatchEnd] ${game} (${endSource}) — OBS stop not confirmed; recording still owned`)
        } else {
          mainProcess.recordingSessionLog().end(stoppedPath)
        }
      }

      if (mainProcess.obsRecorder.hasRecordingFailure() && !usesDemoReplay(game)) {
        const message = mainProcess.obsRecorder.getLastError() ?? 'OBS recording failed. Restart OBS before the next match.'
        mainProcess.logActivity(message, game)
        mainProcess.notifyRecordingUx(message)
        // A growing/unfinished file must not be recovered by the path fallback and uploaded.
        return
      }

      const timelineBuilt = await buildMatchEndTimeline(
        {
          game,
          matchSessionStart,
          currentMatchStartTime: mainProcess.currentMatchStartTime,
          currentRecordingStartTime: mainProcess.currentRecordingStartTime,
          currentGsiMapName: mainProcess.currentGsiMapName,
          cs2DemoDir: config?.cs2DemoDir,
        },
        {
          resolveCs2LocalPlayerName: () => resolveCs2LocalPlayerName(mainProcess.settingsManager, mainProcess.authManager),
          getDeadlockMap,
          getLatestGsiMap,
          logActivity: mainProcess.logActivity,
        },
        liveTimeline,
      )
      timeline = timelineBuilt.timeline
      pendingReplayPath = timelineBuilt.pendingReplayPath
      mainProcess.lastReplayRetryContext = timelineBuilt.replayRetryContext
        ? {
            ...timelineBuilt.replayRetryContext,
            ownerUserId: getActiveUserId() ?? undefined,
          }
        : null

      if (usesDemoReplay(game) && !pendingReplayPath) {
        mainProcess.logActivity(`${game === 'cs2' ? 'CS2' : 'Deadlock'} demo missing at match end`, game)
      }

      if (game === 'cs2') {
        // GSI is the only event source until Steam lists the demo (Wingman/Casual demos may never be
        // listed). Kept apart from kill/stat fields so it cannot unlock Analyse.
        const live = cs2GsiTracker.summary()
        cs2GsiTracker.stop()
        log.info('[CS2Live]', live
          ? `kills=${live.events.filter(e => e.type === 'kill').length} deaths=${live.events.filter(e => e.type === 'death').length} rounds=${live.rounds.length} score=${live.allyScore ?? '?'}-${live.enemyScore ?? '?'}`
          : 'no GSI events (restart CS2 once so the updated GSI config loads)')
        if (live) {
          if (!timeline) {
            timeline = emptyMatchData('cs2', mainProcess.currentRecordingStartTime ?? matchSessionStart)
            timeline.matchStartTime = mainProcess.currentMatchStartTime
            timeline.gameplayStartTime = mainProcess.currentMatchStartTime
            timeline.map = mainProcess.currentGsiMapName
          }
          if (!timeline.gameMode && mainProcess.currentMatchGameMode) timeline.gameMode = mainProcess.currentMatchGameMode
          timeline.cs2Live = live
          if (!timeline.finalScore && live.allyScore != null && live.enemyScore != null) {
            timeline.finalScore = { allyScore: live.allyScore, enemyScore: live.enemyScore }
          }
        }
      }

      if (normalizePrimaryGame(game) === 'lol' && timeline) {
        mainProcess.logActivity(formatLolMatchEndActivity({
          source: endSource,
          gameId: timeline.matchId ?? null,
          queueId: timeline.queueId ?? null,
        }), 'lol')
      }

      const captured = resolveMatchEndCapture(captureNeverStarted, () => {
        const pathResolve = resolveReadyRecordingPathDetailed(mainProcess.obsRecorder.getLastRecordingPath(), savePath, matchSessionStart)
        return {
          resolvedFile: pathResolve.file,
          videoPath: pathResolve.file?.path ?? mainProcess.obsRecorder.getLastRecordingPath(),
          fileSize: pathResolve.file?.sizeBytes ?? mainProcess.obsRecorder.getLastRecordingSize(),
          usedFallback: pathResolve.usedFallback,
        }
      })
      const resolvedFile = captured?.resolvedFile ?? null
      const videoPath = captured?.videoPath ?? null
      const fileSize = captured?.fileSize ?? 0
      mainProcess.activeMatchTelemetry?.startSector('end_to_file_ready')
      mainProcess.activeMatchTelemetry?.endSector('end_to_file_ready')
      if (captured?.usedFallback) {
        mainProcess.activeMatchTelemetry?.setPathFallback(true)
      }

      if (resolvedFile && mainProcess.obsRecorder.hadDisconnectedDuringRecording()) {
        log.info(`[HandleMatchEnd] Recovered recording after OBS disconnect: ${videoPath}`)
        mainProcess.logActivity('Recovered recording after OBS disconnect — continuing upload')
      }

      if (!resolvedFile && mainProcess.obsRecorder.hadObsProcessDiedDuringMatch()) {
        mainProcess.logActivity('OBS exited — no recording file found on disk')
      }

      if (!captureNeverStarted && await mainProcess.obsRecorder.isObsOutputActive()) {
        await new Promise((r) => setTimeout(r, 1500))
        if (await mainProcess.obsRecorder.isObsOutputActive() && await isObsProcessRunning()) {
          mainProcess.logActivity('OBS looks stuck recording. Stop recording in OBS after the match.')
          mainProcess.notifyRecordingUx('OBS looks stuck recording. Stop recording in OBS after the match.')
        }
      }

      if (recordingDuration === 0 && fileSize >= MIN_RECORDING_FILE_BYTES && mainProcess.currentRecordingStartTime) {
        recordingDuration = Math.floor((Date.now() - mainProcess.currentRecordingStartTime) / 1000)
      }

      const durationForGate = Math.max(recordingDuration, effectiveDuration)

      const user = mainProcess.authManager.getUser()
      const mapRaw = timeline?.map ?? mainProcess.currentGsiMapName ?? null
      const map = mapRaw ? resolveMapLabel(game, mapRaw) : null
      const agent = timeline?.agent ?? (game === 'deadlock' ? getDeadlockHero() : null) ?? null
      const gameMode = resolveGameMode(game, {
        map,
        // CS2 has no live timeline: the GSI mode from match start (e.g. WINGMAN) is the only source.
        // Without it every CS2 match was saved as the COMPETITIVE default.
        timelineMode: (game === 'cs2' ? mainProcess.currentMatchGameMode : null) ?? timeline?.gameMode ?? mainProcess.currentMatchGameMode ?? undefined,
        valorantLiveMode: mainProcess.riotLocalApi.getLastGameMode(),
      })
      const autoAnalyse = config?.autoAnalyse !== false

      async function maybeUploadDemoOnly(reason: string): Promise<void> {
        if (!autoAnalyse || !usesDemoReplay(game)) return
        if (!canUploadCapture()) return
        const lobbyMatchId = game === 'deadlock' ? getDeadlockLobbyMatchId() : null
        const deadlockGate = game === 'deadlock' ? await mainProcess.deadlockAutoUploadGate(lobbyMatchId) : null
        if (deadlockGate && !deadlockGate.allowed) return
        const notifyWin = mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed() ? mainProcess.mainWindow : null
        const uploading = await tryAutoUploadSourceReplay({
          game: game as 'cs2' | 'deadlock',
          demoPath: pendingReplayPath,
          matchSessionStart: matchSessionStart,
          auth: mainProcess.authManager,
          notifyWindow: notifyWin,
          customReplayDir: game === 'cs2' ? config?.cs2DemoDir : undefined,
          meta: deadlockGate
            ? { matchId: lobbyMatchId, matchStartedAt: Math.floor(matchSessionStart / 1000), trigger: 'auto', queue: deadlockGate.queue }
            : undefined,
          onJobId: game === 'deadlock'
            ? (jobId) => mainProcess.linkAutoDeadlockReviewJob(jobId, { matchId: lobbyMatchId, sessionStart: matchSessionStart })
            : undefined,
          // Only announce an upload once a replay file was actually found.
          onUploadStarting: () => {
            mainProcess.logActivity(`${gameLabel(game)} replay uploading (${reason})`)
            showAppNotification({
              title: `${gameLabel(game)} replay analysis`,
              body: 'No VOD saved — uploading match replay for AI coaching.',
              silent: mainProcess.notifySilent(),
            })
          },
        })
        if (!uploading && game === 'cs2') {
          mainProcess.logActivity('CS2: no VOD saved — download the demo in CS2 (Watch → Your Matches) and attach it to get coaching')
        }
        mainProcess.mainWindow?.webContents.send('dashboard:refresh', { fresh: true })
      }
      const clipsOnly = !captureNeverStarted && (config?.fullMatchRecording === false || mainProcess.obsRecorder.isClipsOnlySession())

      if (stoppedPath && outputStillFinalizing && !clipsOnly) {
        // Persist exact owned output + capture context before releasing this match's flow.
        // It can become readable after the old 45s deadline or after the app restarts.
        captureStore.add({
          path: stoppedPath, game, map, agent, gameMode, timeline,
          riotName: timeline?.playerName?.trim() ?? '', riotTag: timeline?.playerTag?.trim() ?? '',
          fileFinalizing: true, savedOffline: true, autoAnalyseRequested: ownerId !== null && autoAnalyse,
          captureRecordingStartTime: mainProcess.currentRecordingStartTime, pendingClipBookmarks: mainProcess.hotkeyBookmarks.splice(0),
          onboardingBonus: shouldUseOnboardingBonus(mainProcess.settingsManager.get().onboardingMatchMission, game),
          onboardingAdminTest: mainProcess.settingsManager.get().onboardingMatchMission?.adminTest === true,
        }, matchSessionStart)
        await captureStore.flush()
        mainProcess.notifyRecordingsUpdated()
        mainProcess.logActivity('Recording is still finishing on disk. UpForge will continue when it is ready.', game)
        return
      }

      if (!canUploadCapture()) {
        const localClipContext = { recordingStartTime: mainProcess.currentRecordingStartTime, bookmarks: mainProcess.hotkeyBookmarks.splice(0) }
        mainProcess.finalizeTimelineOffsetsForClips(timeline)
        const clipCount = captureClips.getAll().filter(clip =>
          timeline?.matchId ? clip.matchId === timeline.matchId : clip.savedAt >= matchSessionStart,
        ).length
        if (resolvedFile || clipsOnly || clipCount > 0) {
          const saved = captureStore.add({
            path: resolvedFile?.path ?? '',
            clipsOnly: !resolvedFile,
            clipOnlyReason: !resolvedFile ? (clipsOnly ? 'clips_only_mode' : 'no_recording') : undefined,
            clipCount,
            matchId: timeline?.matchId ?? null,
            riotName: timeline?.playerName?.trim() ?? '',
            riotTag: timeline?.playerTag?.trim() ?? '',
            game, map, agent, gameMode, timeline,
            autoAnalyseRequested: ownerId !== null && autoAnalyse,
            savedOffline: true,
            pendingClipBookmarks: localClipContext.bookmarks.slice(),
            captureRecordingStartTime: localClipContext.recordingStartTime,
          }, matchSessionStart)
          mainProcess.logActivity('Match and clips saved locally. Sign in to access them.')
          mainProcess.notifyRecordingsUpdated()
          if (resolvedFile) {
            mainProcess.localMediaWork++
            void (async () => {
              // Riot's local credentials remain usable when the UpForge session expires.
              if (timeline && game === 'valorant') {
                await enrichTimelineForCoaching(mainProcess.riotLocalApi, timeline, {
                  maxWaitMs: MATCH_DETAILS_ENRICH_MAX_MS,
                  api: null,
                  onStatus: (message) => mainProcess.logActivity(message),
                }).catch(err => log.warn('[LocalCapture] Match enrichment deferred:', err))
                captureStore.updateTimeline(saved.id, timeline)
              }
              await mainProcess.extractMatchClips(resolvedFile.path, timeline, null, game, ownerId, localClipContext)
            })().catch(err => log.warn('[LocalCapture] Clip processing deferred:', err)).finally(() => {
              mainProcess.localMediaWork--
              mainProcess.resumeSavedLocalMedia()
              void mainProcess.offerGuestMediaClaim()
            })
          }
        }
        return
      }

      if (clipsOnly) {
        mainProcess.registerClipOnlySession({
          game,
          map,
          agent,
          gameMode,
          timeline,
          sessionStart: matchSessionStart,
          reason: 'clips_only_mode',
        })
        mainProcess.tray?.setToolTip(idleTooltip(game))
        mainProcess.logActivity('Clips-only mode — highlight clips saved during the match (no full VOD on disk)')
        showAppNotification({
          title: 'UpForge — Match complete',
          body: 'Clips-only mode: kill highlights were saved during the match. No full recording was stored locally.',
          silent: mainProcess.notifySilent(),
        })
        return
      }

      // Capture diagnostic state for the developer panel
      const riotDiag = mainProcess.riotLocalApi.getDiagnostics()
      const killsInTimeline = timeline?.playerKills?.length ?? 0
      let checksumPrefix: string | null = null
      if (videoPath && fs.existsSync(videoPath)) {
        try {
          const hash = await sha256File(videoPath)
          checksumPrefix = hash.slice(0, 12)
          mainProcess.activeMatchTelemetry?.setChecksumPrefix(checksumPrefix)
        } catch (err) {
          log.warn('[OpsTelemetry] checksum failed', err)
        }
      }
      mainProcess.activeMatchTelemetry?.setRecordingFacts({
        durationSec: recordingDuration,
        fileSizeMb: fileSize / (1024 * 1024),
      })
      mainProcess.activeMatchTelemetry?.setDuelsAfterVod(true)
      mainProcess.activeMatchTelemetry?.setEndReason('clean')
      const lapSnap = mainProcess.activeMatchTelemetry?.snapshot()
      mainProcess.lastMatchDiagnostic = {
        timestamp: Date.now(),
        game,
        matchId: timeline?.matchId ?? null,
        map,
        agent,
        gameMode,
        recordingDuration,
        fileSizeMb: fileSize / (1024 * 1024),
        killsInTimeline,
        clipsExtracted: 0, // updated after extractMatchClips completes
        matchDetailsStatus: game === 'lol'
          ? (timeline?.lolEnrichStatus ?? (timeline?.matchId ? 'pending' : 'no_match_id'))
          : timeline?.matchId
            ? (killsInTimeline > 0 ? 'fetched' : (riotDiag.region ? 'fetch_failed' : 'no_region'))
            : usesDemoReplay(game)
              ? (killsInTimeline > 0 ? 'fetched' : 'fetch_failed')
              : (riotDiag.accessTokenPresent ? 'no_match_id' : 'no_auth'),
        lolEnrichStatus: game === 'lol' ? (timeline?.lolEnrichStatus ?? null) : null,
        queueId: timeline?.queueId != null ? String(timeline.queueId) : null,
        correlationId: lapSnap?.match_correlation_id ?? null,
        sectorsMs: lapSnap?.sectors_ms ?? {},
        dnf: lapSnap?.dnf ?? null,
        endReason: endSource || lapSnap?.end_reason || null,
        pathFallback: lapSnap?.path_fallback ?? false,
        machineBucket: lapSnap?.machine_bucket ?? null,
        obsSkippedFrames: lapSnap?.obs_skipped_frames_max ?? null,
        audioTracks: lapSnap?.audio_tracks ?? null,
        outputMode: lapSnap?.recording_facts?.outputMode ?? null,
        checksumPrefix,
      }
      mainProcess.emitActiveOpsLap()

      log.info(
        `[HandleMatchEnd] duration=${recordingDuration}s videoPath=${videoPath} fileSize=${fileSize} ` +
        `kills=${timeline?.playerKills?.length ?? 0} matchId=${timeline?.matchId ?? 'none'}`
      )

      mainProcess.tray?.setToolTip(idleTooltip(game))

      const MIN_DURATION_SECONDS = MIN_RECORDING_DURATION_SECONDS
      const MIN_FILE_SIZE_BYTES = MIN_RECORDING_FILE_BYTES

      if (durationForGate > 0 && durationForGate < MIN_DURATION_SECONDS) {
        log.info(`[GameDetector] Recording too short (${durationForGate}s) — ignoring`)
        mainProcess.logActivity(`Recording too short (${durationForGate}s) — discarded`)
        mainProcess.activeMatchTelemetry?.setDnf('too_short')
        mainProcess.activeMatchTelemetry?.setEndReason('too_short')
        mainProcess.emitActiveOpsLap()
        mainProcess.registerClipOnlySession({
          game,
          map,
          agent,
          gameMode,
          timeline,
          sessionStart: matchSessionStart,
          reason: 'no_recording',
          requireClips: true,
        })
        mainProcess.notifyRecordingUx(
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
        mainProcess.scanForOrphanedRecordings(true)
        mainProcess.registerClipOnlySession({
          game,
          map,
          agent,
          gameMode,
          timeline,
          sessionStart: matchSessionStart,
          reason: 'no_recording',
          requireClips: true,
        })
        const lastErr = mainProcess.obsRecorder.getLastError()
        const msg = lastErr ? `Match ended — no recording was made (${lastErr})` : 'Match ended — no active recording'
        mainProcess.logActivity(msg)
        mainProcess.notifyRecordingUx(lastErr ? `No recording was saved: ${lastErr}` : 'No recording was saved for this match.', 'UpForge — No Recording')
        void maybeUploadDemoOnly('no recording')
        return
      }

      // Close any existing post-game window first (consecutive match scenario —
      // match 2 can end before match 1's window is dismissed).
      // The VOD probe cache is keyed by path + mtime, so it is never stale and is not cleared here:
      // clearing it re-probed every recording after each match and fed the post-match reload storm.
      mainProcess.postGameWindow?.close()
      resetPostGameSession(game, map, agent, getActiveUserId())
      const postMatchSession = capturePostGameSession()

      const deferPostGameUi = shouldDeferPostGameForDemoSync(game, timeline)
      const onboardingMissionActive = mainProcess.settingsManager.get().onboardingMatchMission?.active === true
      let thisPostGameWindow: BrowserWindow | null = null
      const revealPostGame = () => {
        if (!thisPostGameWindow || thisPostGameWindow.isDestroyed()) return
        if (thisPostGameWindow.isVisible()) return
        if (process.platform === 'win32') {
          thisPostGameWindow.showInactive()
        } else {
          thisPostGameWindow.show()
        }
      }
      if (shouldOpenPostGameWindow(onboardingMissionActive, deferPostGameUi)) {
        thisPostGameWindow = mainProcess.createPostGameWindow()
        mainProcess.postGameWindow = thisPostGameWindow
        thisPostGameWindow.on('closed', () => {
          if (mainProcess.postGameWindow === thisPostGameWindow) mainProcess.postGameWindow = null
          postMatchSession.clear()
        })
        // Keep hidden until pending / upload / error — avoids preparing → upload flash
        // when auto-analyse is off or Riot stats are not ready yet.
        whenWebContentsReady(thisPostGameWindow, () => {
          if (thisPostGameWindow!.isDestroyed()) return
          try {
            if (postMatchSession.isCurrent() && !isPostGamePastPreparing(getPostGameSessionSnapshot()?.phase)) {
              sendPostGameEvent(thisPostGameWindow!, 'post-game:preparing', {
                game,
                map,
                agent,
                calmSave: true,
              })
            }
          } catch { /* window may have closed */ }
        })
      } else if (game === 'cs2') {
        mainProcess.notifyDashboardToast(cs2RecordingSavedDashboardMessage(map))
      } else if (game === 'deadlock') {
        mainProcess.notifyDashboardToast(deadlockRecordingSavedDashboardMessage(map))
      }

      // OS notification after we know auto-analyse / readiness — avoid false "Uploading match".

      const postGameNotifyWindow = thisPostGameWindow
        ?? (mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed() ? mainProcess.mainWindow : null)
      const uploadTargetWindow = postGameNotifyWindow

      // Deadlock: name the hero and the real queue (Ranked, Standard, Street Brawl, bots, lobby…) on this
      // match's recordings once deadlock-api publishes the match (retries for ~12 min). The live watcher
      // can't tell the queue, so every match is recorded and starts as the COMPETITIVE placeholder.
      if (game === 'deadlock') {
        const lobbyMatchId = getDeadlockLobbyMatchId()
        if (lobbyMatchId) {
          const resolving = resolveDeadlockRecordingMatch(lobbyMatchId, {
            fetchMatch: async (id) => {
              const res = await mainProcess.authManager.fetchDeadlockMatch(id)
              getGameDataCapture()?.saveDeadlockMetadata(id, res)
              return res
            },
          })
          // The automatic upload paths wait for this queue; queued Deadlock jobs re-check once it lands.
          void mainProcess.deadlockQueueLookups.remember(lobbyMatchId, resolving.then((resolved) => resolved?.mode ?? null))
            .then((mode) => {
              if (!deadlockAllowsAutoAnalyse(mode)) mainProcess.dropAutomaticDeadlockJobs(String(lobbyMatchId), mode)
              mainProcess.postMatchWorker?.kick()
            })
          void resolving
            .then((resolved) => {
              const label = recordingHeroLabel(resolved?.player ?? null, null)
              let changed = label ? captureStore.setDeadlockHero(String(lobbyMatchId), label) : 0
              if (resolved?.mode) {
                changed += captureStore.setDeadlockMode(String(lobbyMatchId), resolved.mode)
                log.info('[Deadlock] Match queue from metadata:', lobbyMatchId, resolved.mode)
              }
              if (changed) mainProcess.notifyRecordingsUpdated()
            })
            .catch(() => { /* best effort */ })
        }
      }

      // CS2 / Deadlock replay upload — runs asynchronously and never blocks VOD upload
      if (uploadsSourceReplay(game)) {
        if (pendingReplayPath) {
          const replayPath = pendingReplayPath
          const replayMatchId = game === 'deadlock' ? getDeadlockLobbyMatchId() : null
          void (async () => {
            // Deadlock: Standard / Street Brawl are not analysed automatically (owner decision 16 Nov).
            const gate = game === 'deadlock' ? await mainProcess.deadlockAutoUploadGate(replayMatchId) : null
            if (gate && !gate.allowed) return
            const replayMeta = gate
              ? {
                  matchId: replayMatchId,
                  matchStartedAt: Math.floor(matchSessionStart / 1000),
                  trigger: 'auto' as const,
                  queue: gate.queue,
                }
              : undefined
            await uploadReplayInBackground(
              game as 'cs2' | 'deadlock',
              replayPath,
              mainProcess.authManager,
              postGameNotifyWindow,
              replayMeta,
              game === 'deadlock'
                ? (jobId) => mainProcess.linkAutoDeadlockReviewJob(jobId, { matchId: replayMatchId, sessionStart: matchSessionStart })
                : undefined,
            )
          })().catch(() => { /* logged inside */ })
        } else if (postGameNotifyWindow && !postGameNotifyWindow.isDestroyed()) {
          try {
            postGameNotifyWindow.webContents.send('post-game:demo-status', { status: 'not-found' })
          } catch { /* window closed */ }
        }
      }

      const activityRecordingOwner = ownerId
      const runPostGameUpload = async () => {
        const activationStep = (step: string, detail?: string) => {
          const line = detail ? `[Activation:${step}] ${detail}` : `[Activation:${step}]`
          log.info(line)
        }
        // Always update session state even if the post-game window is gone —
        // otherwise phase stays "preparing" and safety nets fire false upload_failed.
        const sendToWindow = (channel: string, payload?: unknown) => {
          const win = thisPostGameWindow && !thisPostGameWindow.isDestroyed() ? thisPostGameWindow : null
          if (!postMatchSession.isCurrent()) return
          postMatchSession.send(win, channel, payload)
          if (
            channel === 'post-game:pending'
            || channel === 'post-game:prep-step'
            || channel === 'post-game:upload-start'
            || channel === 'post-game:upload-error'
          ) {
            revealPostGame()
          }
        }

        activationStep('match_end', `game=${game} autoAnalyse=${autoAnalyse}`)
        beginPreparation(game, null)

        const savePath = resolveRecordingSavePath(mainProcess.settingsManager?.get().savePath, ownerId)
        setPrepStep('file_ready')
        const ready = resolveReadyRecordingPath(
          mainProcess.obsRecorder.getLastRecordingPath() ?? videoPath,
          savePath,
          matchSessionStart,
        )

        if (!ready) {
          mainProcess.scanForOrphanedRecordings(true, { fromMatchEnd: true })
          const backend = mainProcess.getRecordingBackendForStatus()
          const errorMsg = formatRecordingFailure(backend, mainProcess.obsRecorder.getLastError())
          mainProcess.logActivity('Recording file not found at expected path — check save folder in Settings')
          activationStep('file_ready', `failed: ${errorMsg}`)
          const failed = failPreparation(errorMsg || 'recording_file_missing', { step: 'file_ready' })
          reportPipelineError('upload', failed.technicalMessage, { step: 'file_ready', game, map, agent, failure_code: failed.code })
          mainProcess.sendUploadFailure(failed.userMessage, { targetWindow: uploadTargetWindow, game })
          revealPostGame()
          return
        }

        const { path: readyPath, sizeBytes: readySize } = ready
        activationStep('file_ready', `${(readySize / (1024 ** 2)).toFixed(1)} MB`)

        if (readySize < MIN_FILE_SIZE_BYTES) {
          const sizeMB = (readySize / (1024 * 1024)).toFixed(2)
          const errorMsg = formatCorruptRecordingMessage(mainProcess.getRecordingBackendForStatus(), sizeMB)
          log.error(`[GameDetector] ${errorMsg}`)
          mainProcess.logActivity(`Recording file too small (${sizeMB} MB) — upload skipped`)
          activationStep('file_ready', `too_small: ${errorMsg}`)
          const failed = failPreparation(errorMsg, { step: 'file_ready', sizeMB })
          reportPipelineError('upload', failed.technicalMessage, { step: 'file_ready', game, map, agent, sizeMB, failure_code: failed.code })
          mainProcess.sendUploadFailure(failed.userMessage, { targetWindow: uploadTargetWindow, game })
          revealPostGame()
          return
        }

        const matchId = timeline?.matchId
        const richMatchData = hasRichMatchDataForGame(game, timeline)

        // Register on the dashboard immediately — before compression/upload can take minutes.
        setPrepStep('dashboard_row')
        mainProcess.finalizeTimelineOffsetsForClips(timeline)
        const savedRecording = captureStore.add({
          path: readyPath,
          riotName: timeline?.playerName?.trim() ?? '',
          riotTag: timeline?.playerTag?.trim() ?? '',
          game,
          map,
          agent,
          gameMode,
          timeline,
          onboardingBonus: shouldUseOnboardingBonus(
            mainProcess.settingsManager.get().onboardingMatchMission,
            game,
          ),
          onboardingAdminTest: mainProcess.settingsManager.get().onboardingMatchMission?.adminTest === true,
          autoAnalyseRequested: autoAnalyse,
          savedOffline: !canUploadCapture(),
          captureRecordingStartTime: mainProcess.currentRecordingStartTime,
          pendingClipBookmarks: mainProcess.hotkeyBookmarks.splice(0),
        })
        if (activityRecordingOwner !== null) trackProductActivity('recording_saved', game, activityRecordingOwner)
        setPrepStep('dashboard_row', savedRecording.id)
        mainProcess.notifyRecordingsUpdated()

        mainProcess.logActivity(
          `Recording saved (${(readySize / (1024 ** 3)).toFixed(2)} GB) — visible on dashboard`,
        )
        if (game === 'cs2' && !richMatchData) {
          mainProcess.logActivity('CS2 match recorded — syncing demo from Steam for kill timeline and clips')
          sendToWindow('post-game:demo-status', { status: 'gc_lookup' })
          mainProcess.mainWindow?.webContents.send('post-game:demo-status', { status: 'gc_lookup' })
          mainProcess.cs2DemoRetrieval.start(savedRecording.id)
        } else if (game === 'deadlock' && !richMatchData) {
          mainProcess.logActivity('Deadlock match recorded — syncing replay from Steam for stats and clips')
          sendToWindow('post-game:demo-status', { status: 'downloading' })
          mainProcess.mainWindow?.webContents.send('post-game:demo-status', { status: 'downloading' })
          void mainProcess.refreshReplayTimelineForRecording(savedRecording.id, { notifyActivity: true })
        }
        mainProcess.scheduleAnalysisReadinessRefresh(savedRecording.id, game, { force: true })
        if (mainProcess.lastReplayRetryContext && mainProcess.lastReplayRetryContext.game === game) {
          mainProcess.lastReplayRetryContext.recordingId = savedRecording.id
        }

        sendToWindow('post-game:analysis-readiness', {
          ready: false,
          state: 'finalizing',
          message: 'Finalizing recording…',
          duelMomentCount: 0,
        })

        // Leave "preparing" immediately — don't block UI on ffprobe / Riot sync.
        void mainProcess.refreshRecordingVodProbe(savedRecording, activityRecordingOwner).catch(() => {})
        const recForStep = captureStore.getById(savedRecording.id) ?? savedRecording
        const stepReadiness = getAnalysisReadiness(recForStep)
        const nextStep = decidePostMatchNextStep({
          autoAnalyse,
          readinessReady: stepReadiness.ready,
          readinessState: stepReadiness.state,
        })

        if (nextStep === 'upload_analyse') {
          activationStep('prep', 'leaving preparing → uploading')
          setPrepStep('upload_dispatch', savedRecording.id)
          completePreparation(game)
          sendToWindow('post-game:prep-step', {
            recordingId: savedRecording.id,
            game,
            map,
            agent,
          })
        } else {
          completePreparation(game)
        }

        let coachingExtras: CoachingSubmissionExtras | undefined
        // Valorant: once Riot's details are in (they can land after the recording is saved), measure where
        // the game clock sits in this recording from the round timer, so clips, key moments and video
        // review land on the right seconds (the loading-time guess was off by up to ~15 s).
        const syncByRoundTimer = async () => {
          if (game !== 'valorant' || !timeline) return
          const synced = await alignValorantTimelineByRoundTimer(timeline, readyPath, ffmpegFrameReader(ffmpegPath()), log)
            .catch((err) => { log.warn('[TimerSync] Skipped:', err); return null })
          if (!synced) return
          mainProcess.finalizeTimelineOffsetsForClips(timeline)
          captureStore.updateTimeline(savedRecording.id, timeline)
          mainProcess.notifyRecordingsUpdated()
        }
        const enrichPromise = mainProcess.prepareTimelineForCoaching(timeline, game, savedRecording.id, ownerId)
          .then(async (result) => {
            coachingExtras = result.extras
            await syncByRoundTimer()
            return result
          })

        // After-match coach flow (production): key moments from short clips cut on this PC, within the
        // player's allowance. Runs in the background; the report shows its facts regardless.
        void enrichPromise.then(() => {
          if (game !== 'valorant' || !timeline || !hasRichMatchData(timeline)) return
          startLiveCoachFlow({
            auth: mainProcess.authManager,
            matchId: timeline.matchId,
            videoPath: savedRecording.path,
            matchData: prepareMatchDataForUpload(timeline) as Record<string, unknown> | undefined,
            send: (update) => {
              mainProcess.mainWindow?.webContents.send('coach-flow:update', update)
              if (thisPostGameWindow && !thisPostGameWindow.isDestroyed()) thisPostGameWindow.webContents.send('coach-flow:update', update)
            },
          })
        }).catch(() => { /* enrichment errors are logged below */ })

        void enrichPromise.then(() => {
          if (!thisPostGameWindow || thisPostGameWindow.isDestroyed()) return
          if (!user?.riot_name || !timeline || !mainProcess.shouldRequestDebrief(timeline, gameMode)) return
          // Debrief needs rich match stats — do not request while still syncing.
          if (!hasRichMatchData(timeline)) return
          if (!postMatchSession.isCurrent()) return
          postMatchSession.send(thisPostGameWindow, 'post-game:debrief-loading')
          void mainProcess.requestPostGameDebrief({
            riotName: user.riot_name,
            riotTag: user.riot_tag ?? 'NA1',
            agent,
            map,
            timeline,
            coachingExtras,
            sendToWindow: (channel, payload) => {
              if (thisPostGameWindow && !thisPostGameWindow.isDestroyed()) {
                postMatchSession.send(thisPostGameWindow, channel, payload)
              }
            },
          }).catch((err) => log.warn('[Debrief] Background debrief failed:', err))
        }).catch((err) => log.warn('[Enrich] Match coaching enrich failed:', err))

        void waitUntilVodFileReady(
          (id) => captureStore.getById(id),
          savedRecording.id,
          async () => {
            const rec = captureStore.getById(savedRecording.id)
            if (rec) await mainProcess.refreshRecordingVodProbe(rec)
          },
          {
            maxWaitMs: mainProcess.POST_GAME_VOD_PROBE_MAX_MS,
            pollMs: 750,
            onReadiness: (readiness) => sendToWindow('post-game:analysis-readiness', readiness),
          },
        ).then(({ ok: vodReady, readiness: vodReadiness }) => {
          if (!vodReady && mainProcess.isBlockingVodReadiness(vodReadiness.state)) {
            log.warn('[PostGame] VOD probe reported blocking state after upload started:', vodReadiness.state)
          }
        }).catch((err) => {
          log.warn('[PostGame] Background VOD probe failed:', err)
        })

        // Re-evaluate after registering VOD — probe may still be finalizing.
        const recAfterProbe = captureStore.getById(savedRecording.id) ?? savedRecording
        const readiness = getAnalysisReadiness(recAfterProbe)
        const step = decidePostMatchNextStep({
          autoAnalyse,
          readinessReady: readiness.ready,
          readinessState: readiness.state,
        })

        if (!canUploadCapture() || step === 'pending_manual' || step === 'pending_waiting_stats') {
          activationStep(
            'pending',
            step === 'pending_manual'
              ? 'autoAnalyse off — manual analyse'
              : `readiness blocked: ${readiness.state}`,
          )
          if (step === 'pending_manual') {
            mainProcess.logActivity(POST_MATCH_COPY.matchSavedAutoOff)
            if (isWaitingMatchDataState(readiness.state)) {
              mainProcess.logActivity(waitingMatchDataBeforeAnalyse(game))
            }
          } else if (isWaitingMatchDataState(readiness.state)) {
            mainProcess.logActivity(waitingMatchDataBeforeUpload(game))
          } else {
            mainProcess.logActivity(readiness.message || 'Auto-analyse skipped — recording not ready')
          }

          sendToWindow('post-game:pending', {
            recordingId: savedRecording.id,
            game,
            map,
            agent,
            analysisReadiness: readiness,
          })

          if (!deferPostGameUi) {
            const agentLabel = agent ?? gameLabel(game)
            const mapLabel = map ? ` · ${map}` : ''
            const body = step === 'pending_manual'
              ? `${agentLabel}${mapLabel} — tap Analyse now in UpForge or review later from your dashboard.`
              : `${agentLabel}${mapLabel} — ${readiness.message || 'review when ready from your dashboard.'}`
            showAppNotification({
              title: 'Match recorded',
              body,
              silent: mainProcess.notifySilent(),
            })
          }

          if (!canUploadCapture()) captureStore.markSavedOffline(savedRecording.id, true)
          await enrichPromise.catch(() => {})
          mainProcess.finalizeTimelineOffsetsForClips(timeline)

          mainProcess.extractMatchClips(readyPath, timeline, null, game, ownerId)
            .catch(err => log.warn('[ClipExtract] Clip extraction (pending) error:', err))

          if (shouldScheduleLateClipRetry(game, timeline, matchId ?? null)) {
            log.info('[HandleMatchEnd] Still sparse after enrich (pending) — scheduling late retry in 90s')
            scheduleLateClipRetry(
              {
                game,
                readyPath,
                savedRecordingId: savedRecording.id,
                timeline,
                matchSessionStart,
                matchId: matchId ?? timeline?.matchId ?? null,
              },
              mainProcess.lateClipRetryDeps(),
              { analysisJobId: null },
            )
          }
          return
        }

        if (!canUploadCapture()) {
          captureStore.markSavedOffline(savedRecording.id, true)
          return
        }
        mainProcess.tray?.setToolTip('UpForge — Uploading...')
        activationStep('upload', `recordingId=${savedRecording.id}`)
        mainProcess.logActivity(matchDataReadyUploading(game))

        if (!deferPostGameUi) {
          const agentLabel = agent ?? gameLabel(game)
          const mapLabel = map ? ` on ${map}` : ''
          showAppNotification({
            title: 'Uploading match',
            body: `${agentLabel}${mapLabel} — coaching report on the way.`,
            silent: mainProcess.notifySilent(),
            allowDuringRecording: true,
          })
        }

        mainProcess.enqueuePostMatchAnalyse({
          recordingId: savedRecording.id,
          videoPath: readyPath,
          riotName: user?.riot_name ?? '',
          riotTag: user?.riot_tag ?? '',
          game,
          map,
          agent,
          matchCorrelationId: mainProcess.activeMatchTelemetry?.correlationId ?? null,
        })
        activationStep('upload', 'queued for post-match worker')

        const jobId = null
        const needLateRetry = shouldScheduleLateClipRetry(game, timeline, matchId ?? timeline?.matchId ?? null)

        // Valorant clips wait for enrichment, which includes the round-timer sync.
        void (game === 'valorant' ? enrichPromise.catch(() => {}) : Promise.resolve())
          .then(() => {
            mainProcess.finalizeTimelineOffsetsForClips(timeline)
            return mainProcess.extractMatchClips(readyPath, timeline, jobId, game)
          })
          .then(() => mainProcess.syncScoutMomentsForJob(jobId, readyPath, timeline))
          .catch(err => log.warn('[ClipExtract] Background extraction error:', err))

        if (needLateRetry) {
          log.info('[HandleMatchEnd] Still sparse after enrich — scheduling late match details retry in 90s')
          scheduleLateClipRetry(
            {
              game,
              readyPath,
              savedRecordingId: savedRecording.id,
              timeline,
              matchSessionStart,
              matchId: matchId ?? timeline?.matchId ?? null,
            },
            mainProcess.lateClipRetryDeps(),
            {
              analysisJobId: jobId,
              patchJobWhenReady: true,
            },
          )
        }
      }

      // Hard safety net: "preparing" is a transient state — the upload flow must
      // always advance it (to uploading/pending/error). If it's still preparing
      // after this window, runPostGameUpload bailed or hung before emitting a
      // phase change, so surface a manual fallback instead of an endless spinner.
      const PREPARING_SAFETY_MS = 45_000
      const preparingSafetyTimer = setTimeout(() => {
        if (!postMatchSession.isCurrent() || getPostGameSessionSnapshot()?.phase !== 'preparing') return
        const stuckMsg =
          'Preparing is taking longer than expected — open the dashboard to upload this match manually.'
        log.error('[HandleMatchEnd] Post-game stuck in preparing — surfacing manual fallback')
        mainProcess.logActivity('Post-game preparation did not complete — resume from the dashboard.')
        const failed = failPreparation(stuckMsg, { step: 'preparing_timeout' })
        reportPipelineError('upload', failed.technicalMessage, {
          step: 'preparing_timeout',
          game,
          map,
          agent,
          phase: getPostGameSessionSnapshot()?.phase,
          failure_code: failed.code,
          prep_step: failed.step,
        })
        try {
          mainProcess.sendUploadFailure(failed.userMessage, { targetWindow: uploadTargetWindow, game })
          revealPostGame()
        } catch { /* window closed */ }
      }, PREPARING_SAFETY_MS)

      void runPostGameUpload().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        log.error('[HandleMatchEnd] Post-game upload failed:', err)
        mainProcess.logActivity(`Upload failed to start: ${msg}`)
        const failed = failPreparation(msg, { step: 'run_post_game_upload' })
        reportPipelineError('upload', failed.technicalMessage, {
          step: 'run_post_game_upload',
          game,
          map,
          agent,
          failure_code: failed.code,
          stack: err instanceof Error ? err.stack?.slice(0, 2000) : undefined,
        })
        try {
          if (postMatchSession.isCurrent()) {
            mainProcess.sendUploadFailure(failed.userMessage, { targetWindow: uploadTargetWindow, game })
            revealPostGame()
          }
        } catch { /* window closed */ }
      }).finally(() => {
        // Settled: if the flow never left preparing (silent early return), don't
        // leave the toast spinning — the timer above will still catch a true hang.
        if (postMatchSession.isCurrent() && getPostGameSessionSnapshot()?.phase === 'preparing') {
          clearTimeout(preparingSafetyTimer)
          const settledMsg =
            'Preparing did not complete — open the dashboard to upload this match manually.'
          log.error('[HandleMatchEnd] runPostGameUpload settled while still preparing — surfacing fallback')
          const failed = failPreparation(settledMsg, { step: 'preparing_settled_stuck' })
          reportPipelineError('upload', failed.technicalMessage, {
            step: 'preparing_settled_stuck',
            game,
            map,
            agent,
            failure_code: failed.code,
            prep_step: failed.step,
          })
          try {
            mainProcess.sendUploadFailure(failed.userMessage, { targetWindow: uploadTargetWindow, game })
          } catch { /* window closed */ }
        } else {
          clearTimeout(preparingSafetyTimer)
        }
      })
      } finally {
        handleMatchEndRunning = false
        if (lolLocalCapture) {
          // Link this match's saved recording (row recordedAt = session start) once the post-game wait is over.
          mainProcess.sendLolLocalReport(lolLocalCapture, () => (lolSessionStart === null ? null
            : captureStore.getAll().find(r => r.game === 'lol' && r.recordedAt === lolSessionStart)?.id ?? null))
        }
        mainProcess.localMediaWork--
        mainProcess.activeCapture = null
        mainProcess.resumeSavedLocalMedia()
        void mainProcess.offerGuestMediaClaim()
        mainProcess.currentRecordingStartTime = null
        mainProcess.currentMatchStartTime = null
        mainProcess.currentGsiMapName = null
        mainProcess.currentMatchGameMode = null
      }
    }

    mainProcess.manualEndMatchRecording = async (game: string) => {
      if (!mainProcess.obsRecorder.isRecording() && mainProcess.currentRecordingStartTime === null) {
        return { ok: false, reason: 'not_recording' }
      }
      if (mainProcess.matchHandled) {
        return { ok: false, reason: 'already_handled' }
      }
      mainProcess.logActivity('Recording stopped manually — finishing match', game)
      if (game === 'deadlock') suppressDeadlockAutoRecordUntilNewMatch()
      try {
        const didFinalize = await finalizeMatchOnce(game, 'manual')
        if (!didFinalize) return { ok: false, reason: 'already_handled' }
        if (mainProcess.obsRecorder.hasRecordingFailure()) {
          return { ok: false, reason: mainProcess.obsRecorder.getLastError() ?? 'OBS recording failed' }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        mainProcess.logActivity(`Failed to finish match after stop: ${msg}`)
        mainProcess.notifyRecordingUx(`Could not finish the match: ${msg}`, 'UpForge — Recording')
        return { ok: false, reason: msg }
      }
      if (mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed() && mainProcess.mainWindow.isMinimized()) mainProcess.mainWindow.restore()
      destroyOverlay()
      await rearmGameDetection(game)
      return { ok: true }
    }

    mainProcess.gameDetector.on('valorant-client-changed', (open: boolean) => {
      mainProcess.mainWindow?.webContents.send('game:client-changed', { game: 'valorant', open })
    })

    const ignoredStartRearm = createIgnoredStartRearm({
      isRecording: () => mainProcess.obsRecorder.isRecording(),
      currentGame: () => mainProcess.gameDetector.currentGame(),
      resetActiveGame: (g) => mainProcess.gameDetector.resetActiveGame(g),
      releaseStale: () => mainProcess.obsRecorder.releaseStaleMatchOwnership(),
      log,
    })
    mainProcess.gameDetector.on('game-started', async (game: string) => {
      if (mainProcess.overstepBridge?.isBusy()) { mainProcess.gameDetector.resetActiveGame(game); return }
      // These game processes can first be detected while a map is already loading.
      // Hold until the independent match probe confirms menus, even if OBS is unavailable.
      if (game === 'valorant' || game === 'lol') mainProcess.backgroundMatchState.observe(true)
      // game:status-changed {active:true} is sent only after ownership resolves: the renderer's
      // game-tab auto-switch must not run while an old recording may still own OBS.
      mainProcess.abortBackgroundWorkOnGameStart(game)
      // A different game starting while another game's recording is still owned saves the old
      // session first; a finalise already in flight is awaited (card 232 same-poll race).
      const ownership = await resolveGameStartOwnership({
        game,
        finalizeInFlight: () => mainProcess.matchFinalizeInFlight,
        releaseStale: async () => {
          const released = await mainProcess.obsRecorder.releaseStaleMatchOwnership()
          if (released) mainProcess.logActivity('Cleared stale recording state — ready for next match')
          return released
        },
        isRecording: () => mainProcess.obsRecorder.isRecording(),
        recordingGame: () => mainProcess.recordingSessionLog().activeGame(),
        matchHandled: () => mainProcess.matchHandled,
        finalize: async (previousGame, source) => {
          mainProcess.logActivity(`${gameLabel(game)} started — saving the ${gameLabel(previousGame)} recording first`, previousGame)
          mainProcess.riotLocalApi.onMatchEnded = null
          mainProcess.lolLiveClientApi.onMatchEnded = null
          const didFinalize = await finalizeMatchOnce(previousGame, source)
          if (didFinalize) {
            mainProcess.endMatchPerformanceMode()
            destroyOverlay()
          }
        },
        retryStop: () => mainProcess.obsRecorder.stop(),
        log,
      })
      if (ownership.action === 'ignore') {
        if (mainProcess.obsRecorder.isRecording() && mainProcess.recordingSessionLog().activeGame() !== game) {
          mainProcess.logActivity(`${gameLabel(game)} detected but the previous recording is still running in OBS — not recorded`, game)
          ignoredStartRearm.arm(game)
        }
        return
      }
      ignoredStartRearm.cancel()
      mainProcess.mainWindow?.webContents.send('game:status-changed', { game, active: true })
      mainProcess.syncPrimaryGameFromDetection(game)
      mainProcess.warmupPrompt.onGameStarted(game)

      mainProcess.activeCapture = { ownerId: mainProcess.captureOwnership.get() }
      mainProcess.replayCaptureOwnerId = mainProcess.activeCapture.ownerId
      const { isStale } = beginMatchFlow()
      mainProcess.matchFlowGame = game
      if (!usesDemoReplay(game)) mainProcess.beginMatchPerformanceMode()
      mainProcess.matchDetectInFlightDepth++
      try {
      log.info(`[GameDetector] ${game} started (flow #${mainProcess.matchFlowGeneration})`)
      mainProcess.logActivity(`${gameLabel(game)} detected — waiting for match`)
      if (game === 'deadlock') mainProcess.deadlockSessionStartAt = Date.now()
      if (game === 'valorant') {
        void mainProcess.riotLocalApi.getPregameContext().then((ctx) => {
          mainProcess.discordRPC.setInGame(game, { map: ctx?.map ?? null, agent: ctx?.agent ?? null })
        }).catch(() => mainProcess.discordRPC.setInGame(game))
      } else {
        mainProcess.discordRPC.setInGame(game)
      }

      const config = mainProcess.settingsManager?.get()
      const onboardingMissionActive = config?.onboardingMatchMission?.active === true

      // Keep unfinished setup and the capture mission visible even if the game is
      // already open; normal sessions still minimise to reduce Chromium overhead.
      if (
        mainProcess.mainWindow
        && !mainProcess.mainWindow.isDestroyed()
        && mainProcess.mainWindow.isVisible()
        && shouldMinimizeForDetectedGame(
          onboardingMissionActive,
          config?.onboardingComplete !== true,
          mainProcess.mainWindow.webContents.getURL(),
        )
      ) {
        mainProcess.mainWindow.minimize()
      }

      // Keep watching when no modes are selected: the user may enable a mode
      // in the lobby. The saved selection is checked once the match is detected.

      // Auto-kill user-configured background apps before the game starts
      if (config?.pregameKillList?.length && mainProcess.performanceManager) {
        for (const procName of config.pregameKillList) {
          mainProcess.performanceManager.killProcess(procName).catch(() => {})
        }
      }

      let recorderConfig = config ? buildRecorderConfig(config, hasProAccess(mainProcess.authManager.getUser()), mainProcess.captureOwnerId()) : undefined

      // Check disk space now so the warning shows while in lobby
      const savePath = mainProcess.recordingSavePath()
      if (!mainProcess.obsRecorder.isConnected()) {
        await mainProcess.ensureObsReady({ allowProcessRestart: true, notifyOnFailure: true })
      }
      void mainProcess.ensureObsCaptureForGame(game)
      if (recorderConfig) {
        log.info(
          `[Recorder] OBS · ${formatRecordingLabel(recorderConfig.quality, recorderConfig.bitrate, recorderConfig.fps ?? 30)}` +
          `${recorderConfig.manageObsVideo === false ? ' (OBS video settings unchanged)' : ''} (synced to OBS before recording)`,
        )
      }
      const freeBytes = await getFreeDiskSpace(savePath)
      if (freeBytes < CRITICAL_FREE_DISK_BYTES) {
        const msg = `Not enough disk space (${formatFreeDiskLabel(freeBytes)}) — recording skipped. Free space in Settings → Recording.`
        mainProcess.logActivity(msg)
        mainProcess.notifyRecordingUx(msg, 'UpForge — Disk Full')
        mainProcess.mainWindow?.webContents.send('app:warning', {
          message: msg,
          actionLabel: 'Free up space',
          actionRoute: '/settings?tab=recording',
        })
        mainProcess.tray?.setToolTip(idleTooltip(game))
        await rearmGameDetection(game, true)
        return
      }
      if (freeBytes < LOW_FREE_DISK_BYTES) {
        const msg = `Low disk space (${formatFreeDiskLabel(freeBytes)}) — recording may fail. Upload pending VODs in Settings → Recording.`
        console.warn(`[Recorder] ${msg}`)
        mainProcess.mainWindow?.webContents.send('app:warning', {
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

      mainProcess.tray?.setToolTip('UpForge — Match loading...')
      mainProcess.mainWindow?.webContents.send('recording:waiting-for-match', { waiting: true })

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
      let lolCaptureContext: LolCaptureContext | null = null
      let cancelled = false
      /** Cancel detail for activity feed (Valorant / CS2 / Deadlock / LoL). */
      let matchWaitCancelReason: string | null = null
      mainProcess.cancelMatchWait = () => { cancelled = true }
      mainProcess.waitingForMatch = true

      // CS2 — GSI live match (process open ≠ in a match).
      // Deadlock — Steam httpcache match signals; no Valve GSI.
      let authOk = false
      if (game === 'cs2') {
        resetSteamGsiSession()
        if (isGsiPortBlocked()) {
          mainProcess.logActivity(`CS2 match detection blocked — port ${getActiveGsiPort()} is in use (close other apps using it, e.g. Discord bot dev server)`)
          mainProcess.notifyRecordingUx(
            `UpForge cannot listen for CS2 match events — port ${getActiveGsiPort()} is already in use. Close the other app and restart UpForge.`,
            'UpForge — CS2 detection blocked',
          )
        }
        const gsiInstall = await installSteamGsiConfig('cs2')
        const gsiNeedsRestart = gsiInstall.needsRestart
        if (gsiInstall.needsRestart) {
          mainProcess.logActivity('CS2 detected — restart CS2 once so UpForge can auto-start recording when a match begins')
        } else if (!gsiInstall.ok) {
          mainProcess.logActivity('CS2 detected — could not install match auto-record config (check Steam/CS2 is installed)')
        }
        mainProcess.logActivity('CS2 detected — waiting for a live match to start recording')

        const MATCH_TIMEOUT_MS = 25 * 60 * 1000
        const loopStart = Date.now()
        let gsiHintShown = false
        let gsiServerHintShown = false
        let processMissStreak = 0
        let lastUnknownProbeLogAt: number | null = null
        const deadline = Date.now() + MATCH_TIMEOUT_MS
        while (Date.now() < deadline && !cancelled) {
          if (abortIfStale(isStale, game)) return
          await new Promise((r) => setTimeout(r, 1000))
          if (cancelled) break
          const processProbe = await mainProcess.gameDetector.probeGameProcess(game)
          if (processProbe === 'unknown') {
            const now = Date.now()
            if (shouldLogUnknownProbe(lastUnknownProbeLogAt, now)) {
              lastUnknownProbeLogAt = now
              log.warn('[GameDetector] CS2 process probe unknown (tasklist timeout/error) — not cancelling')
            }
          } else if (processProbe === 'stopped') {
            processMissStreak++
            if (shouldCancelGenericProcessMiss(processMissStreak)) {
              matchWaitCancelReason = 'CS2 process closed before a live match'
              cancelled = true
              break
            }
            continue
          } else {
            processMissStreak = 0
          }

          if (
            !gsiServerHintShown
            && Date.now() - loopStart > 5_000
            && !isGsiServerReady()
          ) {
            gsiServerHintShown = true
            mainProcess.logActivity(`CS2 match detection server not running — port ${getActiveGsiPort()} may be blocked`)
          }

          if (!gsiHintShown && Date.now() - loopStart > 45_000 && !hasEverReceivedGsi() && !gsiNeedsRestart) {
            gsiHintShown = true
            mainProcess.logActivity('CS2 detected — match auto-record inactive. Restart CS2 so UpForge\'s config file loads.')
          }

          if (isGsiMatchLive()) {
            matchStartTime = Date.now()
            mainProcess.currentMatchStartTime = matchStartTime
            mainProcess.currentGsiMapName = getLatestGsiMap()
            gameMode = normalizeCs2GameMode(getLatestGsiPayload()?.map?.mode) ?? 'COMPETITIVE'
            modeConfident = true
            break
          }
        }
      } else if (game === 'deadlock') {
        resetDeadlockLogSession()
        noteDeadlockWaitStarted()
        startDeadlockLogWatcher()
        mainProcess.logActivity('Deadlock running — watching Steam for match data')

        const MATCH_TIMEOUT_MS = 25 * 60 * 1000
        const loopStart = Date.now()
        let steamHintShown = false
        let detectionHintShown = false
        let processMissStreak = 0
        let lastUnknownProbeLogAt: number | null = null
        const deadline = Date.now() + MATCH_TIMEOUT_MS
        while (Date.now() < deadline && !cancelled) {
          if (abortIfStale(isStale, game)) return
          await new Promise((r) => setTimeout(r, 1000))
          if (cancelled) break
          const processProbe = await mainProcess.gameDetector.probeGameProcess(game)
          if (processProbe === 'unknown') {
            const now = Date.now()
            if (shouldLogUnknownProbe(lastUnknownProbeLogAt, now)) {
              lastUnknownProbeLogAt = now
              log.warn('[GameDetector] Deadlock process probe unknown (tasklist timeout/error) — not cancelling')
            }
          } else if (processProbe === 'stopped') {
            processMissStreak++
            if (shouldCancelGenericProcessMiss(processMissStreak)) {
              matchWaitCancelReason = 'Deadlock process closed before a live match'
              cancelled = true
              break
            }
            continue
          } else {
            processMissStreak = 0
          }

          const dlStatus = getDeadlockDetectionStatus()

          if (
            !steamHintShown
            && Date.now() - loopStart > 20_000
            && !dlStatus.logReceiving
            && !dlStatus.replayLive
          ) {
            steamHintShown = true
            mainProcess.logActivity('Keep Steam open while playing Deadlock — UpForge reads match data from Steam\'s cache')
            mainProcess.notifyRecordingUx(
              'UpForge watches Steam\'s local cache for Deadlock match data. Keep Steam running and logged in while you play.',
              'UpForge — Deadlock detection',
            )
          }

          if (
            !detectionHintShown
            && Date.now() - loopStart > 60_000
            && !isDeadlockDetectionActive()
          ) {
            detectionHintShown = true
            const replayHint = dlStatus.replayDir
              ? ` Replays folder: ${dlStatus.replayDir}`
              : ''
            mainProcess.logActivity(`Deadlock match data not seen yet — keep Steam open.${replayHint}`)
          }

          if (isDeadlockReadyToRecord()) {
            matchStartTime = getDeadlockMatchStartedAt() ?? Date.now()
            mainProcess.currentMatchStartTime = matchStartTime
            mainProcess.currentGsiMapName = getDeadlockMap()
            gameMode = 'COMPETITIVE'
            modeConfident = true
            log.info('[Deadlock] Match ready:', getDeadlockDetectionStatus())
            break
          }
        }
      } else if (game === 'lol') {
        mainProcess.logActivity('League of Legends detected — waiting for live match (Live Client API)')

        const MATCH_TIMEOUT_MS = 25 * 60 * 1000
        const loopStart = Date.now()
        let apiHintShown = false
        let processMissStreak = 0
        let lastUnknownProbeLogAt: number | null = null
        const deadline = Date.now() + MATCH_TIMEOUT_MS
        while (Date.now() < deadline && !cancelled) {
          if (abortIfStale(isStale, game)) return
          await new Promise((r) => setTimeout(r, 1500))
          if (cancelled) break
          const processProbe = await mainProcess.gameDetector.probeGameProcess(game)
          if (processProbe === 'unknown') {
            const now = Date.now()
            if (shouldLogUnknownProbe(lastUnknownProbeLogAt, now)) {
              lastUnknownProbeLogAt = now
              log.warn('[GameDetector] LoL process probe unknown (tasklist timeout/error) — not cancelling')
            }
          } else if (processProbe === 'stopped') {
            processMissStreak++
            if (shouldCancelGenericProcessMiss(processMissStreak)) {
              matchWaitCancelReason = 'League process closed before a live match'
              cancelled = true
              break
            }
            continue
          } else {
            processMissStreak = 0
          }

          const probe = await mainProcess.lolLiveClientApi.probeActiveMatch()
          if (!probe?.inMatch && !apiHintShown && Date.now() - loopStart > 45_000) {
            apiHintShown = true
            mainProcess.logActivity('In a loading screen or lobby — UpForge starts recording when the Live Client API sees an active game')
          }

          if (probe?.inMatch) {
            matchStartTime = Date.now() - Math.round(probe.gameTime * 1000)
            mainProcess.currentMatchStartTime = matchStartTime
            mainProcess.currentGsiMapName = probe.mapName
            let resolvedMode = probe.gameMode ?? 'CLASSIC'
            try {
              const lcu = await probeLolLcu({ liveClient: mainProcess.lolLiveClientApi })
              lolCaptureContext = lcu.captureContext ?? null
              if (!lolCaptureContext?.account) {
                mainProcess.logActivity('League account identity unavailable from the client. This recording may need the played account linked in Settings.', 'lol')
              }
              const fromLcu = resolveLolFilterMode({
                queueId: lcu.queueId,
                lcuGameMode: lcu.gameMode,
                liveGameMode: probe.gameMode,
                mapId: lcu.mapId,
              })
              if (fromLcu) {
                resolvedMode = fromLcu
                if (lcu.queueId != null) {
                  log.info(`[GameDetector] LoL mode from LCU queue ${lcu.queueId} → ${fromLcu}`)
                }
              }
            } catch (err) {
              log.warn('[GameDetector] LoL LCU mode probe failed:', err instanceof Error ? err.message : err)
            }
            gameMode = resolvedMode
            modeConfident = true
            break
          }
        }
      } else if (game === 'valorant') {
      // ── Presence-based match detection ────────────────────────────────────
      // Try to use the Riot Local API to detect when the match actually goes
      // INGAME, so we avoid the old blind 90s wait.  Falls back to a 90s wait
      // if the lockfile / auth is not available (rare on modern installations).
      // ──────────────────────────────────────────────────────────────────────
      authOk = await mainProcess.riotLocalApi.initAuth()

      if (authOk) {
        mainProcess.riotLocalApi.clearPendingMatchId()
        mainProcess.logActivity('Riot Client API ready — waiting for INGAME presence')
        // Wait up to 25 minutes for INGAME (handles long Agent Select)
        const PRESENCE_TIMEOUT_MS = 25 * 60 * 1000
        const waitStartedAt = Date.now()
        const deadline = waitStartedAt + PRESENCE_TIMEOUT_MS
        let lastCoreGameCheckAt = 0
        let lastMilestoneAt = waitStartedAt
        let lastUnknownProbeLogAt: number | null = null
        let presenceNullStreak = 0
        // Shipping.exe can flake mid-load / exclusive-fullscreen alt-tab; only count
        // confirmed "stopped" probes, then cross-check Riot before cancelling.
        let processMissStreak = 0
        let loggedRiotKeepAlive = false
        let lastLoopState: string | null = null
        while (Date.now() < deadline && !cancelled) {
          if (abortIfStale(isStale, game)) return
          await new Promise((r) => setTimeout(r, 1000))
          if (cancelled) break
          const now = Date.now()
          const processProbe = await mainProcess.gameDetector.probeMatchProcess()
          if (processProbe === 'unknown') {
            if (shouldLogUnknownProbe(lastUnknownProbeLogAt, now)) {
              lastUnknownProbeLogAt = now
              log.warn('[GameDetector] Valorant process probe unknown (tasklist timeout/error) — not cancelling')
            }
            continue
          }
          if (processProbe === 'stopped') {
            processMissStreak++
            const riotActive = await isValorantMatchFlowActive()
            const decision = decideMatchWaitAfterProcessMiss({
              consecutiveStopped: processMissStreak,
              riotMatchActive: riotActive,
            })
            if (decision.action === 'cancel') {
              matchWaitCancelReason = decision.reason
              log.info(`[GameDetector] Match wait cancel: ${decision.reason}`)
              cancelled = true
              break
            }
            if (decision.resetStreak) {
              processMissStreak = 0
              if (!loggedRiotKeepAlive) {
                loggedRiotKeepAlive = true
                mainProcess.logActivity('Game process briefly missing — Riot still in match, waiting')
                log.info(`[GameDetector] ${decision.reason}`)
              }
            }
            if (now - lastMilestoneAt >= MATCH_WAIT_MILESTONE_MS) {
              lastMilestoneAt = now
              mainProcess.logActivity(formatMatchWaitMilestone({
                sessionLoopState: lastLoopState,
                processMissStreak,
                waitedSec: Math.round((now - waitStartedAt) / 1000),
              }))
            }
            continue
          }
          processMissStreak = 0
          try {
            const state = await mainProcess.riotLocalApi.getSessionState()

            if (!state?.sessionLoopState) {
              presenceNullStreak++
              if (shouldReauthAfterPresenceNulls(presenceNullStreak)) {
                log.warn(`[GameDetector] Presence null ×${presenceNullStreak} — re-init Riot auth`)
                await mainProcess.riotLocalApi.initAuth().catch(() => false)
                mainProcess.logActivity('Riot presence unavailable — refreshed client auth, still waiting')
              }
            } else {
              presenceNullStreak = 0
              lastLoopState = state.sessionLoopState
            }

            if (now - lastMilestoneAt >= MATCH_WAIT_MILESTONE_MS) {
              lastMilestoneAt = now
              mainProcess.logActivity(formatMatchWaitMilestone({
                sessionLoopState: lastLoopState,
                processMissStreak,
                waitedSec: Math.round((now - waitStartedAt) / 1000),
              }))
            }

            // Range maps identify practice even when presence retains the previous queue.
            const presenceMode = resolveValorantGameMode(state?.queueId, state?.matchMap)
            if (presenceMode) {
              gameMode = presenceMode
              modeConfident = true
            }

            // Pre-game brief is only useful for competitive/premier matches.
            // Wait until mode is confirmed — do NOT default to true when unknown,
            // as that's what was causing the brief to fire for all queues.
            const modeKnown = gameMode !== null
            const isCompBrief = gameMode === 'COMPETITIVE' || gameMode === 'PREMIER'

            // Wait for the selected agent and all five allied picks before briefing.
            // During loading, the API skips a brief if match context is unavailable.
            if (!pregameBriefFired && state?.sessionLoopState === 'PREGAME') {
              const ctx = await mainProcess.riotLocalApi.getPregameContext().catch(() => null)
              mainProcess.pushPregameContext(ctx)

              // Use QueueID from the pregame match endpoint as the definitive source
              if (ctx?.mode && !gameMode) {
                gameMode = ctx.mode
              }

              const resolvedIsComp = gameMode === 'COMPETITIVE' || gameMode === 'PREMIER'

              if (!resolvedIsComp && gameMode !== null) {
                // Non-competitive queue confirmed — skip brief
                pregameBriefFired = true
              } else if (resolvedIsComp && ctx?.agent && ctx.allyAgents.length === 5) {
                // Competitive with the selected agent and a full allied roster.
                pregameBriefFired = true
                mainProcess.requestPregameBrief(ctx)
              }

              if (ctx?.map || ctx?.agent) {
                mainProcess.discordRPC.setInGame(game, { map: ctx.map, agent: ctx.agent })
              }
              // else: mode not yet known or agent not locked — keep looping, try again next tick
            }

            if (state?.sessionLoopState && state.sessionLoopState !== 'PREGAME') mainProcess.pushPregameContext(null)
            if (!pregameBriefFired && state?.sessionLoopState === 'INGAME') {
              if (modeKnown && isCompBrief) {
                // Competitive confirmed — fire fallback brief (agent may still be unknown)
                pregameBriefFired = true
                mainProcess.riotLocalApi.getPregameContext()
                  .then(ctx => mainProcess.requestPregameBrief(ctx ?? undefined))
                  .catch(() => mainProcess.requestPregameBrief())
              } else if (modeKnown) {
                // Non-competitive confirmed — suppress brief
                pregameBriefFired = true
              }
              // else: mode still unknown — keep polling; don't brief non-comp queues
            }

            if (state?.sessionLoopState === 'INGAME') {
              // Replay viewer shows INGAME presence — do not record replays
              if (state.isReplay) {
                log.info('[GameDetector] Replay detected (provisioningFlow=Replay) — skipping recording')
                mainProcess.logActivity('Replay detected — recording skipped')
                mainProcess.notifyRecordingUx('Replay viewer detected — only live matches are recorded.')
                mainProcess.tray?.setToolTip(idleTooltip(game))
                mainProcess.waitingForMatch = false
                mainProcess.cancelMatchWait = null
                mainProcess.mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })
                await rearmGameDetection(game, true)
                return
              }
              matchStartTime = Date.now()
              if (presenceMode) {
                gameMode = presenceMode
                modeConfident = true
              } else {
                const mode = await mainProcess.riotLocalApi.getGameMode()
                if (mode) {
                  gameMode = mode
                  modeConfident = true
                }
              }
              break
            }

            // Presence can flake (circuit breaker / empty private payload) while core-game is live.
            if (now - lastCoreGameCheckAt >= 3000) {
              lastCoreGameCheckAt = now
              const coreActive = await mainProcess.riotLocalApi.isCoreGameSessionActive()
              if (coreActive === true) {
                log.info('[GameDetector] core-game session active — treating as INGAME (presence fallback)')
                matchStartTime = Date.now()
                if (!gameMode) {
                  const mode = await mainProcess.riotLocalApi.getGameMode()
                  if (mode) {
                    gameMode = mode
                    modeConfident = true
                  }
                }
                break
              }
            }
          } catch (err) {
            presenceNullStreak++
            if (shouldReauthAfterPresenceNulls(presenceNullStreak)) {
              log.warn('[GameDetector] Presence poll error — re-init Riot auth:', err)
              await mainProcess.riotLocalApi.initAuth().catch(() => false)
              mainProcess.logActivity('Riot presence error — refreshed client auth, still waiting')
            }
          }
        }
      } else {
        // Fallback: wait 90 s for the loading screen (no Riot confirm available)
        const LOADING_DELAY_MS = 90_000
        mainProcess.logActivity('Riot Client API unavailable — recording starts in 90s')
        const deadline = Date.now() + LOADING_DELAY_MS
        let processMissStreak = 0
        let lastUnknownProbeLogAt: number | null = null
        const PROCESS_MISS_CANCEL = 4
        while (Date.now() < deadline && !cancelled) {
          if (abortIfStale(isStale, game)) return
          await new Promise((r) => setTimeout(r, 5000))
          if (cancelled) break
          const processProbe = await mainProcess.gameDetector.probeMatchProcess()
          if (processProbe === 'unknown') {
            const now = Date.now()
            if (shouldLogUnknownProbe(lastUnknownProbeLogAt, now)) {
              lastUnknownProbeLogAt = now
              log.warn('[GameDetector] Valorant process probe unknown during 90s fallback — not cancelling')
            }
            continue
          }
          if (processProbe === 'stopped') {
            processMissStreak++
            if (processMissStreak >= PROCESS_MISS_CANCEL) {
              matchWaitCancelReason = 'Shipping.exe gone during loading (Riot API unavailable)'
              cancelled = true
              break
            }
          } else {
            processMissStreak = 0
          }
        }
      }
      }

      mainProcess.waitingForMatch = false
      mainProcess.cancelMatchWait = null
      mainProcess.mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })

      if (abortIfStale(isStale, game)) return

      if (cancelled && matchWaitCancelReason) {
        mainProcess.logActivity(formatMatchWaitCancelActivity(matchWaitCancelReason))
        log.info('[GameDetector] Match wait cancelled — no recording:', matchWaitCancelReason)
        mainProcess.tray?.setToolTip(idleTooltip(game))
        if (gameNeedsLiveMatchWindow(game)) {
          mainProcess.gameDetector.resetActiveGame(game)
          await rearmGameDetection(game)
        }
        return
      }

      if (game === 'valorant' && cancelled) {
        mainProcess.logActivity(formatMatchWaitCancelActivity('left loading / game closed'))
        log.info('[GameDetector] Match wait cancelled — no recording')
        mainProcess.tray?.setToolTip(idleTooltip(game))
        return
      }

      // If presence API was available but INGAME was never seen, the player is idle
      // in the lobby (or queued and cancelled). Do NOT start recording — this is what
      // causes "hallucinated" matches when the app is left idle for 25+ minutes.
      if (game === 'valorant' && authOk && matchStartTime === null) {
        mainProcess.logActivity('Presence timeout — no match started, returning to idle')
        log.info('[GameDetector] Presence loop timed out without INGAME — not recording')
        mainProcess.tray?.setToolTip(idleTooltip(game))
        await rearmGameDetection(game)
        return
      }

      if (gameNeedsLiveMatchWindow(game) && cancelled) {
        mainProcess.logActivity(`${gameLabel(game)} closed before a match — watching for the game to reopen`)
        log.info('[GameDetector] Game closed during match wait — re-arming detection')
        mainProcess.tray?.setToolTip(idleTooltip(game))
        mainProcess.gameDetector.resetActiveGame(game)
        await rearmGameDetection(game)
        return
      }

      if (gameNeedsLiveMatchWindow(game) && matchStartTime === null) {
        mainProcess.logActivity('No match started — returning to idle')
        log.info(`[GameDetector] ${game} match wait timed out without live match — not recording`)
        mainProcess.tray?.setToolTip(idleTooltip(game))
        await rearmGameDetection(game)
        return
      }

      // If presence didn't give us a mode, try the log file as last resort (never overwrite queueId)
      if (game === 'valorant' && !modeConfident) {
        const logMode = await mainProcess.riotLocalApi.getGameModeFromLog()
        if (logMode) {
          if (!gameMode) gameMode = logMode
          modeConfident = true
        } else if (gameMode) {
          modeConfident = true
        }
      }

      // Settings can change while we wait in the lobby. Decide from the saved
      // selection at match start, rather than the earlier game-detection snapshot.
      const matchStartSettings = mainProcess.settingsManager?.get()
      recorderConfig = matchStartSettings
        ? buildRecorderConfig(matchStartSettings, hasProAccess(mainProcess.authManager.getUser()), mainProcess.captureOwnerId())
        : undefined
      const recordedModes = getRecordedModesForGame(
        matchStartSettings?.recordedModesByGame,
        game,
        matchStartSettings?.recordedModes,
      )
      const allRecordableModes = recordableModesForGame(game)
      // Empty list = record nothing (dashboard/settings copy). Non-empty partial list = filter.
      const filterByMode = recordedModes.length > 0 &&
        !allRecordableModes.every(m => recordedModes.includes(m))

      log.info('[RecordingDecision]', { game, gameMode, modeConfident, recordedModes, filterByMode })

      if (recordedModes.length === 0) {
        mainProcess.logActivity('No game modes selected — recording disabled')
        mainProcess.notifyRecordingUx('Select at least one game mode in Settings → Recording to record matches.')
        mainProcess.rememberSkippedMatch(game, 'This match was not recorded because no game modes are selected. Choose modes in Settings → Recording.')
        mainProcess.tray?.setToolTip(idleTooltip(game))
        await rearmGameDetection(game, true)
        return
      }

      if (filterByMode && !modeConfident) {
        log.info('[GameDetector] Skipping recording — queue mode unknown')
        mainProcess.logActivity('Queue mode unknown — recording skipped (select all modes or wait for queue)')
        mainProcess.notifyRecordingUx(
          'Could not detect this queue type — recording skipped. Enable more modes in Settings or wait until the queue is identified.',
        )
        mainProcess.rememberSkippedMatch(game, 'This match was not recorded because UpForge could not tell which queue it was. Record all modes in Settings → Recording to capture every match.')
        mainProcess.tray?.setToolTip(idleTooltip(game))
        await rearmGameDetection(game, true)
        return
      }

      if (isModeFilteredOut(recordedModes, gameMode, allRecordableModes)) {
        log.info(`[GameDetector] Skipping recording — mode is ${gameMode} (recordedModes=${recordedModes.join(',')})`)
        mainProcess.logActivity(`Mode ${gameMode} not in recorded modes (${recordedModes.join(', ')}) — skipped`)
        mainProcess.notifyRecordingUx(modeSkippedMessage(game, gameMode ?? ''))
        mainProcess.rememberSkippedMatch(game, modeSkippedMessage(game, gameMode ?? ''))
        mainProcess.tray?.setToolTip(idleTooltip(game))
        await rearmGameDetection(game, true)
        return
      }

      if (abortIfStale(isStale, game)) return
      if (mainProcess.obsRecorder.isRecording()) {
        log.info('[GameDetector] Match confirmed but capture already active — skipping duplicate start')
        return
      }
      const capturePreparation = await mainProcess.obsRecorder.prepareMatchCapture(async () => {
        if (isStale()) return false
        // The player can leave a short match while onboarding owns the recorder.
        // Shipping.exe remains open in the lobby, so process presence is not enough.
        if (game === 'valorant') return !(await hasValorantReturnedToMenus(mainProcess.riotLocalApi))
        if (game === 'lol') return (await mainProcess.lolLiveClientApi.probeActiveMatch())?.inMatch === true
        return true
      }, game === 'lol' && matchStartTime !== null ? { matchStartedAt: matchStartTime } : undefined)
      if (abortIfStale(isStale, game)) return
      if (capturePreparation === 'cancelled') {
        mainProcess.logActivity('Match ended before recording could start — watching for the next match')
        mainProcess.tray?.setToolTip(idleTooltip(game))
        await rearmGameDetection(game, true)
        return
      }
      const reclaimedExistingCapture = capturePreparation === 'reclaimed'
      if (capturePreparation !== 'idle') {
        if (reclaimedExistingCapture) {
          log.info('[GameDetector] Reclaimed in-progress OBS recording — continuing same file')
          mainProcess.logActivity('Recovered in-progress recording — continuing capture')
        } else {
          log.info('[GameDetector] OBS output active but not reclaimable — skipping duplicate start')
          return
        }
      }

      if (!gameMode) gameMode = 'COMPETITIVE'
      mainProcess.currentMatchGameMode = gameMode
      mainProcess.matchHandled = false
      if (matchStartTime != null) mainProcess.currentMatchStartTime = matchStartTime

      if (game === 'valorant' && mainProcess.authManager.isAuthenticated()) {
        const riotUser = mainProcess.authManager.getUser()
        const { playerName, playerTag } = mainProcess.riotLocalApi.getDiagnostics()
        const riotSwitch = decideRiotAccountSwitch({
          inGameName: playerName,
          inGameTag: playerTag,
          accounts: riotUser?.riot_accounts ?? [],
          maxAccounts: riotUser?.max_valorant_accounts ?? 1,
        })

        // Never skip the match for an unlinked or unswitchable Riot ID: record it (the upload carries the
        // in-game Riot ID and PUUID) and ask the player to link it alongside.
        let activateFailed = false
        if (riotSwitch.action === 'activate') {
          const activated = await mainProcess.authManager.activateRiotAccount(riotSwitch.accountId)
          if (activated.ok) {
            mainProcess.riotLocalApi.setLinkedAccountRegion(mainProcess.authManager.getUser()?.riot_region ?? null)
          } else {
            activateFailed = true
            log.info(`[GameDetector] Riot account activate failed: ${activated.error ?? 'unknown'} (recording anyway)`)
          }
        }
        const notice = riotSwitchNotice(riotSwitch, activateFailed)
        if (notice) {
          log.info(`[GameDetector] ${riotSwitch.action}: ${notice.message}`)
          mainProcess.logActivity(notice.message)
          mainProcess.notifyRecordingUx(notice.message)
          if (notice.prompt) mainProcess.mainWindow?.webContents.send('riot:prompt-link', notice.prompt)
        }
      }

      if (game === 'valorant' && !pregameBriefFired && (gameMode === 'COMPETITIVE' || gameMode === 'PREMIER')) {
        mainProcess.requestPregameBrief({ agent: null, map: null, mode: gameMode })
        pregameBriefFired = true
      }

      mainProcess.logActivity(`Match detected (${gameMode}${modeConfident ? '' : '?'}) — starting recording`)
      log.info(`[GameDetector] Match confirmed! gameMode=${gameMode} confident=${modeConfident} matchStartTime=${matchStartTime}`)
      if (game === 'valorant') trackMatchDetected('valorant')
      mainProcess.beginMatchPerformanceMode({ holdPostMatch: true })

      if (isStale() || mainProcess.matchHandled) return
      const recordingStart = { game, controller: new AbortController() }
      mainProcess.pendingRecordingStart = recordingStart

      if (game === 'valorant') {
        mainProcess.riotLocalApi.cancelMenuWatch()
        mainProcess.riotLocalApi.onMatchEnded = () => {
          if (!isStale()) return finishActiveMatch(game, 'presence')
        }
        mainProcess.riotLocalApi.start(game, matchStartTime ?? undefined)
      } else if (game === 'lol') {
        mainProcess.lolLocalCollector.reset(lolCaptureContext)
        mainProcess.lolLiveClientApi.start(matchStartTime ?? undefined, lolCaptureContext)
        mainProcess.lolLiveClientApi.onMatchEnded = () => {
          if (!isStale()) return finishActiveMatch(game, 'live-client')
        }
      } else if (usesDemoReplay(game)) {
        // Exactly one end-poller: a leaked interval from a superseded flow used to stop the NEXT
        // recording within a second of it starting ("Match ended (gsi) — … (unknown duration)").
        if (mainProcess.gsiPollTimer) clearInterval(mainProcess.gsiPollTimer)
        const timer: ReturnType<typeof setInterval> = setInterval(() => {
          void (async () => {
            if (isStale()) {
              clearInterval(timer)
              if (mainProcess.gsiPollTimer === timer) mainProcess.gsiPollTimer = null
              return
            }
            if (mainProcess.matchHandled || (!mainProcess.obsRecorder.isRecording() && mainProcess.pendingRecordingStart?.game !== game)) return
            const ended = game === 'deadlock'
              ? isDeadlockMatchEnded()
              : isGsiMatchEnded()
            if (!ended) return
            if (game === 'deadlock') getGameDataCapture()?.deadlockMatchEnded()
            // CS2: say why (gameover / left-server / map-changed) so a split match is traceable in main.log.
            await finishActiveMatch(game, game === 'cs2' ? `gsi:${gsiMatchEndReason() ?? 'ended'}` : 'gsi')
          })()
        }, 2000)
        mainProcess.gsiPollTimer = timer
      }

      const gameProcessStillRunning = game === 'valorant'
        ? await mainProcess.gameDetector.isMatchProcessRunning()
        : await mainProcess.gameDetector.isGameProcessRunning(game)
      if (!reclaimedExistingCapture && !gameProcessStillRunning) {
        recordingStart.controller.abort()
        if (mainProcess.pendingRecordingStart === recordingStart) mainProcess.pendingRecordingStart = null
        log.warn('[GameDetector] Game process exited before recorder start — aborting')
        mainProcess.logActivity('Match ended before recording could start')
        mainProcess.tray?.setToolTip(idleTooltip(game))
        mainProcess.mainWindow?.webContents.send('recording:starting', { starting: false })
        mainProcess.waitingForMatch = false
        mainProcess.mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })
        await rearmGameDetection(game, true)
        return
      }

      // Valorant's port-2999 Live Client API is deprecated / often half-open; waiting on it
      // stalled match start ("Waiting for round start…") with no recording. Start at INGAME.
      if (abortIfStale(isStale, game)) return
      if (cancelled) {
        recordingStart.controller.abort()
        if (mainProcess.pendingRecordingStart === recordingStart) mainProcess.pendingRecordingStart = null
        mainProcess.logActivity('Match ended during load — recording skipped')
        mainProcess.tray?.setToolTip(idleTooltip(game))
        await rearmGameDetection(game, true)
        return
      }

      mainProcess.tray?.setToolTip('UpForge — Starting recorder...')
      mainProcess.logActivity('Starting OBS recording…')
      if (recorderConfig && mainProcess.settingsManager?.get().fullMatchRecording !== false) {
        const estimateBytes = estimateRecordingBytes({
          bitrateMbps: recorderConfig.bitrate,
          fps: recorderConfig.fps ?? 30,
          quality: recorderConfig.quality === '1080p' ? '1080p' : '720p',
        })
        if (exceedsRecordingSizeCap(estimateBytes)) {
          const recommended = recommendSettingsUnderCap()
          const estimateGb = (estimateBytes / (1024 ** 3)).toFixed(1)
          const msg =
            `Recording settings may exceed the upload limit (~${estimateGb} GB per match). ` +
            `Try ${formatRecordingLabel(recommended.quality, recommended.bitrate, recommended.fps)} in Settings → Recording.`
          log.warn(`[Recorder] ${msg}`)
          mainProcess.logActivity(msg)
          mainProcess.mainWindow?.webContents.send('app:warning', {
            message: msg,
            actionLabel: 'Open Recording settings',
            actionRoute: '/settings?tab=recording',
          })
        }
      }
      mainProcess.mainWindow?.webContents.send('recording:starting', { starting: true })
      const telemetry = mainProcess.beginMatchTelemetry(game)
      telemetry.startSector('detect_to_record_start')
      /** Hard cap so a hung OBS WebSocket call cannot block the whole game session. */
      const OBS_RECORD_START_TIMEOUT_MS = 90_000
      mainProcess.obsRecorder.resetRecordingDiagnostics(game)
      try {
        // Create the overlay window just before recording starts — deferred from startup
        // so it doesn't break Valorant's exclusive fullscreen before we actually need it.
        if (isInGameOverlayEnabled()) createOverlayWindow()
        await startRecordingWithRetry({
          attempt: () => startRecordingWhenReady({
            ensureReady: mainProcess.ensureObsReadyOrThrow,
            start: async (signal) => {
              if (!reclaimedExistingCapture) {
                await mainProcess.obsRecorder.start(game, recorderConfig, { signal, isCancelled: () => isStale() || mainProcess.matchHandled })
              }
            },
            timeoutMs: OBS_RECORD_START_TIMEOUT_MS,
            signal: recordingStart.controller.signal,
          }),
          // Retry while the match is live; never for problems the player must fix in OBS.
          isRetryable: (msg) => !reclaimedExistingCapture
            && !/already recording|Advanced|cancelled/i.test(msg)
            && !mainProcess.isObsUnavailableError(msg),
          isCancelled: () => isStale() || mainProcess.matchHandled,
          signal: recordingStart.controller.signal,
          onRetry: (attemptNumber, delayMs, msg) => {
            log.warn(`[Recorder] ${game} recording start failed (${msg}) — attempt ${attemptNumber} in ${Math.round(delayMs / 1000)}s`)
            mainProcess.logActivity(`Recording did not start — trying again in ${Math.round(delayMs / 1000)}s while the match is live`)
          },
        })
        if (recordingStart.controller.signal.aborted || isStale() || mainProcess.matchHandled) return
        telemetry.endSector('detect_to_record_start')
        telemetry.setAudioTracks(mainProcess.obsRecorder.wasNoAudio() ? 0 : 1)
        telemetry.setRecordingFacts({
          resolution: recorderConfig?.quality === '1080p' ? '1920x1080' : '1280x720',
          targetFps: recorderConfig?.fps ?? 30,
          encoder: mainProcess.settingsManager?.get()?.cachedEncoder ?? null,
        })
        mainProcess.stopObsStatsSampling()
        if (mainProcess.obsRecorder.isConnected()) {
          mainProcess.stopActiveObsStatsSampler = startObsStatsSampler(mainProcess.obsRecorder.getObsClient(), (sample) => {
            mainProcess.activeMatchTelemetry?.addObsSample(sample)
          })
        }
        // Accurate videoOffsetMs: offset = (loadSkew − recordingLag) + timeSinceGameStart.
        if (!reclaimedExistingCapture) {
          const recStartTime = Date.now()
          if (game === 'valorant') mainProcess.riotLocalApi.setRecordingStartTime(recStartTime)
          else if (game === 'lol') mainProcess.lolLiveClientApi.setRecordingStartTime(recStartTime)
          else if (game === 'cs2') cs2GsiTracker.start(recStartTime)
          mainProcess.currentRecordingStartTime = recStartTime
          mainProcess.hotkeyBookmarks.length = 0 // clear any stale bookmarks from previous match
        } else {
          const recStartTime = mainProcess.obsRecorder.getRecordingStartedAt()
            ?? mainProcess.currentRecordingStartTime
            ?? mainProcess.currentMatchStartTime
            ?? Date.now()
          if (game === 'valorant') mainProcess.riotLocalApi.setRecordingStartTime(recStartTime)
          else if (game === 'lol') mainProcess.lolLiveClientApi.setRecordingStartTime(recStartTime)
          else if (game === 'cs2') {
            if (cs2GsiTracker.active) cs2GsiTracker.setRecordingStart(recStartTime)
            else cs2GsiTracker.start(recStartTime)
          }
          mainProcess.currentRecordingStartTime = recStartTime
        }
        if (mainProcess.currentRecordingStartTime != null) mainProcess.recordingSessionLog().begin(game, mainProcess.currentRecordingStartTime)
        log.info(`[Recorder] ${game} recording started${reclaimedExistingCapture ? ' (reclaimed existing output)' : ''}`)
        // Push recording=true to the overlay immediately — don't wait for the poll cycle
        if (isInGameOverlayEnabled()) {
          sendOverlayData('overlay:data', { round: null, allyScore: null, enemyScore: null, yourCredits: null, enemyEstimate: null, recording: true })
        }
      } catch (err) {
        // Match finalization or a newer match owns cleanup and the current UI now.
        if (recordingStart.controller.signal.aborted || isStale() || mainProcess.matchHandled) return
        const msg = err instanceof Error ? err.message : String(err)
        log.error('[Main] Failed to start recording:', msg)
        reportRecordingError('start', err, { recording_context: mainProcess.obsRecorder.getRecordingDiagnostics() })
        if (/already recording/i.test(msg)) {
          telemetry.setDnf('unowned_obs_recording', msg)
        } else if (/Advanced/i.test(msg)) {
          telemetry.setDnf('advanced_output', msg)
        } else if (mainProcess.isObsUnavailableError(msg)) {
          telemetry.setDnf('obs_not_ready', msg)
        } else if (/did not become active/i.test(msg)) {
          telemetry.setDnf('start_verify_failed', msg)
        } else if (/OBS start timed out/i.test(msg)) {
          telemetry.setDnf('start_timeout', msg)
        } else {
          telemetry.setDnf('other', msg)
        }
        telemetry.setEndReason('start_failed')
        mainProcess.emitActiveOpsLap()
        if (game === 'valorant') {
          trackRecordingFailed(msg, mainProcess.isObsUnavailableError(msg) ? 'obs' : 'record')
        }
        const unownedBlocked = /already recording/i.test(msg)
        const startVerifyFailed = /did not become active/i.test(msg)
        const startTimedOut = /OBS start timed out/i.test(msg)
        const userFacingStartMsg = unownedBlocked
          ? 'OBS is already recording — stop it in OBS, then UpForge can capture.'
          : startVerifyFailed
            ? 'OBS did not start recording — check OBS Output settings.'
            : startTimedOut
              ? 'OBS start timed out — restart OBS from Settings → Recording, then queue again.'
              : null
        mainProcess.logActivity(userFacingStartMsg ?? `Recording failed to start: ${msg}`)
        mainProcess.matchHandled = false
        mainProcess.riotLocalApi.onMatchEnded = null
        mainProcess.lolLiveClientApi.onMatchEnded = null
        try {
          if (game === 'valorant') await mainProcess.riotLocalApi.stop()
          else if (game === 'lol') await mainProcess.lolLiveClientApi.stop()
        } catch { /* ignore */ }
        destroyOverlay()
        mainProcess.mainWindow?.webContents.send('recording:starting', { starting: false })
        if (mainProcess.isObsUnavailableError(msg)) {
          mainProcess.notifyObsRecordingUnavailable(
            'OBS isn\'t connected. UpForge will resume match detection when OBS connects.',
          )
          mainProcess.endMatchPerformanceMode()
          mainProcess.logActivity('Waiting for OBS — recording will resume when connected')
          mainProcess.tray?.setToolTip('UpForge — Waiting for OBS…')
          // Keep activeGame tracked; maybeResumeMatchDetectionAfterObsConnect re-enters detect.
          return
        }
        mainProcess.notifyRecordingUx(
          userFacingStartMsg ?? `Could not start recording: ${msg}`,
          'UpForge — Recording Failed',
        )
        mainProcess.rememberSkippedMatch(game, `This match was not recorded because recording did not start. ${userFacingStartMsg ?? msg}`)
        mainProcess.tray?.setToolTip('UpForge — Recording failed!')
        setTimeout(() => mainProcess.tray?.setToolTip(idleTooltip(game)), 10_000)
        await rearmGameDetection(game, true)
        return
      } finally {
        if (mainProcess.pendingRecordingStart === recordingStart) mainProcess.pendingRecordingStart = null
      }
      mainProcess.logActivity(`Recording started (${gameMode ?? 'unknown mode'}${mainProcess.obsRecorder.wasNoAudio() ? ' — no audio' : ''})`)
      const applied = mainProcess.obsRecorder.getOBSStatus().lastApplied
      if (applied?.outputWidth && applied.outputHeight) {
        mainProcess.logActivity(`OBS canvas ${applied.outputWidth}×${applied.outputHeight} @ ${applied.fps} fps (${applied.quality})`)
      }
      if (game === 'valorant') trackRecordingStarted('valorant')
      else trackFirstRecording(game)

      if (game === 'valorant') {
        setTimeout(() => {
          void mainProcess.obsRecorder.refitCaptureForGameplay('post-loading settle')
        }, 12_000)
      }

      // Poll overlay/session state — drives Valorant match-end detection via pollActiveMatch.
      const pollOverlaySession = async () => {
        try {
          if (game === 'lol' && mainProcess.obsRecorder.isRecording() && !mainProcess.matchHandled) {
            const ctx = mainProcess.lolLiveClientApi.getLiveMatchContext()
            if (ctx?.champion || ctx?.map) {
              mainProcess.discordRPC.setInGame(game, { map: ctx.map, agent: ctx.champion })
            }
          }

          if (game !== 'valorant') {
            if (mainProcess.obsRecorder.isRecording()) {
              const start =
                mainProcess.currentRecordingStartTime != null ? new Date(mainProcess.currentRecordingStartTime) : new Date()
              mainProcess.discordRPC.setRecording(game, start, mainProcess.discordMatchContext())
            }
            return
          }

          const state = await mainProcess.riotLocalApi.getSharedSessionState()
          if (mainProcess.obsRecorder.isRecording() && !mainProcess.matchHandled) {
            const now = Date.now()
            if (now - mainProcess.lastShippingProcessCheckAt >= VALORANT_IN_MATCH_PROCESS_CHECK_MS) {
              mainProcess.lastShippingProcessCheckAt = now
              mainProcess.cachedShippingProcessUp = await mainProcess.gameDetector.isMatchProcessRunningRecent()
            }
            await mainProcess.riotLocalApi.pollActiveMatch({
              shippingProcessRunning: mainProcess.cachedShippingProcessUp,
              state,
            })
          }
          if (state?.sessionLoopState === 'INGAME') {
            mainProcess.riotLocalApi.setGameplayStartTime(Date.now())
            const ally = state.allyScore ?? 0
            const enemy = state.enemyScore ?? 0
            if (ally + enemy > 0) {
              void mainProcess.obsRecorder.refitCaptureForGameplay('scoreboard active')
            }
            const round = ally + enemy + 1
            if (isInGameOverlayEnabled()) {
              sendOverlayData('overlay:data', {
                round,
                allyScore: ally,
                enemyScore: enemy,
                yourCredits: null,
                enemyEstimate: null,
                recording: true,
              })
            }
          }
          if (mainProcess.obsRecorder.isRecording()) {
            const start =
              mainProcess.currentRecordingStartTime != null ? new Date(mainProcess.currentRecordingStartTime) : new Date()
            mainProcess.discordRPC.setRecording(game, start, mainProcess.discordMatchContext())
          }
        } catch { /* ignore — session endpoint may be unavailable */ }
      }
      if (mainProcess.overlayPollTimer) { clearInterval(mainProcess.overlayPollTimer); mainProcess.overlayPollTimer = null }
      mainProcess.cachedShippingProcessUp = true
      mainProcess.lastShippingProcessCheckAt = 0
      void pollOverlaySession()
      mainProcess.overlayPollTimer = setInterval(
        () => { void pollOverlaySession() },
        getSessionPollIntervalMs(),
      )

      if (mainProcess.obsRecorder.wasNoAudio()) {
        mainProcess.mainWindow?.webContents.send('app:warning', {
          message: 'Recording started without audio — your system audio device was unavailable'
        })
      }

      const startupWarning = mainProcess.obsRecorder.getStartupWarning()
      if (startupWarning) {
        mainProcess.mainWindow?.webContents.send('app:warning', { message: startupWarning })
      }

      const user = mainProcess.authManager.getUser()
      const userLabel = (user?.riot_name && user?.riot_tag)
        ? `${user.riot_name}#${user.riot_tag}`
        : user?.name ?? 'your account'
      const gameLabelText = gameLabel(game)
      mainProcess.tray?.setToolTip(`UpForge — Recording ${gameLabelText} (${userLabel})`)

      const feedbackMode = mainProcess.settingsManager.get().inGameFeedback ?? 'notifications'
      deliverInGameFeedback(mainProcess.inGameFeedbackDeps(), {
        kind: 'recording-started',
        title: 'Recording started',
        body: `${gameLabelText} match for ${userLabel} — F9 clip · F8 screenshot${isInGameOverlayEnabled() ? ' · F10 overlay' : ''}`,
        beep: 'none',
        flashOverlayMs: feedbackMode === 'notifications' ? 0 : 7000,
      })
      } finally {
        mainProcess.matchDetectInFlightDepth = Math.max(0, mainProcess.matchDetectInFlightDepth - 1)
      }
    })

    // Card 232 safety stop: a stranded recording ran 3.5 h as one League session. Past the
    // per-game cap, save it when the game is gone or the live API reports no match.
    let maxDurationCheckInFlight = false
    const maxDurationTimer = setInterval(() => {
      if (maxDurationCheckInFlight || mainProcess.matchFinalizeInFlight || !mainProcess.obsRecorder.isRecording()) return
      const recordingGame = mainProcess.recordingSessionLog().activeGame()
      const startedAt = mainProcess.obsRecorder.getRecordingStartedAt() ?? mainProcess.currentRecordingStartTime
      if (!recordingGame || startedAt == null) return
      maxDurationCheckInFlight = true
      void checkRecordingMaxDuration({
        game: recordingGame,
        now: Date.now(),
        recordingStartedAt: startedAt,
        probeProcess: async (g) => (await mainProcess.gameDetector.probeGameProcess(g)) !== 'stopped',
        probeLiveMatch: async (g) => {
          if (g === 'lol') {
            const probe = await mainProcess.lolLiveClientApi.probeActiveMatch()
            return probe ? probe.inMatch : null
          }
          if (g === 'valorant') return isValorantMatchFlowActive()
          if (g === 'cs2') return isGsiMatchEnded() ? false : isGsiMatchLive() ? true : null
          if (g === 'deadlock') return isDeadlockMatchEnded() ? false : null
          return null
        },
        finalize: async (g, source) => {
          mainProcess.logActivity(`${gameLabel(g)} recording passed ${maxRecordingDurationMs(g) / 60_000} min with no live match — saving it`, g)
          if (mainProcess.matchHandled) {
            // The match already finalised; only the OBS stop is stranded.
            await mainProcess.obsRecorder.stop()
            return
          }
          mainProcess.riotLocalApi.onMatchEnded = null
          mainProcess.lolLiveClientApi.onMatchEnded = null
          const didFinalize = await finalizeMatchOnce(g, source)
          if (!didFinalize) return
          mainProcess.endMatchPerformanceMode()
          destroyOverlay()
          if (mainProcess.gameDetector.currentGame() === g) await rearmGameDetection(g)
        },
        log,
      }).catch((err) => {
        log.warn('[Recorder] Max-duration check failed:', err instanceof Error ? err.message : err)
      }).finally(() => { maxDurationCheckInFlight = false })
    }, RECORDING_MAX_DURATION_CHECK_MS)
    maxDurationTimer.unref?.()

    mainProcess.gameDetector.on('game-stopped', async (game: string) => {
      if (mainProcess.overstepBridge?.isBusy()) return
      log.info(`[GameDetector] ${game} stopped`)
      const processStillRunning = game === 'valorant'
        ? await mainProcess.gameDetector.isMatchProcessRunning()
        : await mainProcess.gameDetector.isGameProcessRunning(game)
      if (processStillRunning) {
        log.info(`[GameDetector] game-stopped debounced — ${game} process still running`)
        return
      }
      mainProcess.mainWindow?.webContents.send('game:status-changed', { game, active: false })
      mainProcess.warmupPrompt.onGameStopped(game)
      clearTrainerLaunchGame(game)
      // A late stop for a game the flow already left (e.g. League exit after Valorant took over)
      // must not clear the new game's match hooks or finalise its recording as this game.
      if (isSupersededGameStop({
        stoppedGame: game,
        flowGame: mainProcess.matchFlowGame,
        recordingGame: mainProcess.obsRecorder.isRecording() ? mainProcess.recordingSessionLog().activeGame() : null,
      })) {
        log.info(`[GameDetector] ${game} stopped — ignored, ${mainProcess.matchFlowGame} owns the current match flow`)
        return
      }

      if (game === 'deadlock') stopDeadlockLogWatcher()
      mainProcess.endMatchPerformanceMode()
      mainProcess.discordRPC.setIdle()
      mainProcess.riotLocalApi.cancelMenuWatch()
      mainProcess.riotLocalApi.onMatchEnded = null
      mainProcess.lolLiveClientApi.cancel()

      try {
      // Game quit while still in lobby (before match started).
      // Only cancel the wait if the match hasn't already been handled by presence — if it has,
      // the re-arm is running inside cancelMatchWait and we should NOT cancel it: the
      // isMatchProcessRunning() check inside the loop will cancel it naturally when Shipping.exe
      // is no longer running.
      if (mainProcess.cancelMatchWait && !mainProcess.matchHandled) {
        if (game === 'valorant') {
          const riotActive = await isValorantMatchFlowActive()
          if (!shouldAbortMatchWaitOnGameStopped(riotActive)) {
            // Process flake (common with exclusive fullscreen alt-tab) — keep waiting.
            mainProcess.gameDetector.reviveActiveGame(game)
            log.info(
              `[GameDetector] game-stopped ignored during match wait — Riot match flow=${riotActive}`,
            )
            mainProcess.logActivity('Game process blip during loading — still waiting for match')
            return
          }
        }
        mainProcess.cancelMatchWait()
        mainProcess.cancelMatchWait = null
        mainProcess.waitingForMatch = false
        mainProcess.mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })
        mainProcess.tray?.setToolTip(idleTooltip(game))
        log.info('[GameDetector] Game quit before match — no recording to save')
        if (gameNeedsLiveMatchWindow(game)) {
          mainProcess.gameDetector.resetActiveGame(game)
          if (mainProcess.rearmWatchInFlight !== game) void rearmGameDetection(game)
        } else {
          mainProcess.logActivity('Game quit before match started — nothing recorded')
        }
        // Restore main window now that game is gone
        if (mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed() && mainProcess.mainWindow.isMinimized()) mainProcess.mainWindow.restore()
        destroyOverlay()
        return
      }

      // Match already finalized (or waiting for next queue) — clear lobby state if game quit
      if (mainProcess.matchHandled) {
        if (!mainProcess.obsRecorder.isRecording()) {
          mainProcess.cancelMatchWait?.()
          mainProcess.cancelMatchWait = null
          mainProcess.waitingForMatch = false
          mainProcess.mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })
          mainProcess.tray?.setToolTip(idleTooltip(game))
          mainProcess.logActivity('Game closed — returned to idle')
        } else {
          log.info('[GameDetector] Match already handled — skipping game-stopped')
        }
        mainProcess.riotLocalApi.onMatchEnded = null
        if (mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed() && mainProcess.mainWindow.isMinimized()) mainProcess.mainWindow.restore()
        destroyOverlay()
        return
      }

      // Skipped-match menu watch or idle — no recorder running.
      if (mainProcess.pendingRecordingStart?.game === game) {
        await finishActiveMatch(game, 'process-exit')
        return
      }
      const captureActive = await mainProcess.obsRecorder.isCaptureActive()
      if (!captureActive) {
        mainProcess.waitingForMatch = false
        mainProcess.mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })
        mainProcess.tray?.setToolTip(idleTooltip(game))
        if (mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed() && mainProcess.mainWindow.isMinimized()) mainProcess.mainWindow.restore()
        destroyOverlay()
        return
      }

      let endActivity = 'Game process ended — stopping recording'
      if (game === 'valorant') {
        try {
          const riotActive = await isValorantMatchFlowActive()
          if (shouldSuppressFinalizeOnGameStopped(riotActive)) {
            mainProcess.gameDetector.reviveActiveGame(game)
            log.info(
              `[GameDetector] game-stopped ignored mid-record — Riot match flow=${riotActive}`,
            )
            mainProcess.logActivity('False match-end ignored — recording continues')
            return
          }
          if (riotActive === null) {
            log.warn('[GameDetector] game-stopped with Riot unreachable — stopping recording')
            endActivity = 'Game process ended (Riot status unclear) — stopping recording'
          }
        } catch { /* Riot unreachable and process gone — proceed with finalize */ }
      }

      mainProcess.logActivity(endActivity)
      await finalizeMatchOnce(game, 'process-exit')
      // Restore main window now that game is gone
      if (mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed() && mainProcess.mainWindow.isMinimized()) mainProcess.mainWindow.restore()
      destroyOverlay()
      } finally {
        if (game === 'deadlock') {
          void mainProcess.refreshDeadlockProfile(true)
          const sessionStart = mainProcess.currentMatchStartTime ?? mainProcess.deadlockSessionStartAt
          const autoAnalyse = mainProcess.settingsManager?.get().autoAnalyse !== false
          if (!mainProcess.matchHandled && sessionStart != null && autoAnalyse && mainProcess.authManager.isAuthenticated()) {
            const exitMatchId = getDeadlockLobbyMatchId()
            void mainProcess.deadlockAutoUploadGate(exitMatchId).then((gate) => {
              if (!gate.allowed) return
              return tryAutoUploadSourceReplay({
                game: 'deadlock',
                demoPath: null,
                matchSessionStart: sessionStart,
                auth: mainProcess.authManager,
                notifyWindow: mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed() ? mainProcess.mainWindow : null,
                meta: {
                  matchId: exitMatchId,
                  matchStartedAt: Math.floor(sessionStart / 1000),
                  trigger: 'auto',
                  queue: gate.queue,
                },
                onJobId: (jobId) => mainProcess.linkAutoDeadlockReviewJob(jobId, { matchId: exitMatchId, sessionStart }),
              }).then(() => {
                mainProcess.mainWindow?.webContents.send('dashboard:refresh', { fresh: true })
              })
            })
          }
          mainProcess.deadlockSessionStartAt = null
          mainProcess.currentMatchStartTime = null
        }
        mainProcess.maybeResumeDeferredUploads()
      }
    })

    mainProcess.gameDetector.start()
  }

  return { setupGameDetection }
}
