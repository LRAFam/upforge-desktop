// Must stay the first import: redirects userData before any other module loads in self-test mode.
import { selftestRequest } from './selftest-early'
import { getApiBaseUrl } from './api-base'
import { openExternalSafe } from './shell-open'
import { buildQuitActivity, createQuitGuard } from './quit-guard'
import { askQuitChoice } from './quit-dialog'
import { canUseDeveloperTools, devOnly } from './dev-access'
import { createCoalescedNotifier, createVodProbeSweep } from './vod-probe-sweep'
import { createRecordingFileFinalizer } from './recording-file-finalizer'
import { submissionFocusAreas } from '../../src/lib/submission-focus'
import { insightText as insightTextFrom } from '../../src/lib/last-insight'
import { parseDiscordLinkCallback } from './discord-link'
import { createCallRateLogger, startMainLoopLagMonitor } from './main-loop-lag'
import { saveReplay } from './valorant-replay-download'
import { ValorantReplaySync, type ReplaySyncState } from './valorant-replay-sync'
import { ValorantReplayUploader } from './valorant-replay-uploader'
import { fetchViewerReplay } from './valorant-replay-viewer'
import { resolveValorantGameMode } from './riot-queue-id'
import { hasValorantReturnedToMenus, isValorantStillInLiveMatch } from './valorant-match-end'
import { startRecordingWhenReady, startRecordingWithRetry } from './recording-start'
import { resolveMatchEndCapture, shouldFinalizeMatchMedia } from './match-end-capture'
import { setupCloudStorageHandlers } from './ipc/cloud-storage-ipc'
import { APP_VERSION } from './app-version'
import { setupReviewNotebookHandlers } from './ipc/review-notebook-ipc'
import { setupRoundReviewHandlers } from './ipc/round-review-ipc'
import { setupProgressPlanHandlers } from './ipc/progress-plan-ipc'
import { setupMarketplaceHandlers } from './ipc/marketplace-ipc'
import { buildTimelineFromDemo, cs2DemoReadError, CS2_DEMO_UNREADABLE_MESSAGE } from './demo-timeline'
import { Cs2DemoRetrieval, cs2DemoRetrievalStatus } from './cs2-demo-retrieval'
import { setupOverstepIntegration } from './overstep-integration'
import type { OverstepBridge } from './overstep-bridge'
import { registeredLocalRecordingPaths } from './local-media-paths'
import { CaptureOwnership } from './capture-ownership'
import { initProductActivity, trackProductActivity } from './product-activity'
import { backgroundWork } from './background-work'
import { BackgroundMatchState } from './background-match-state'
import { matchPollPause } from './poll-pause'
import { REARM_PROCESS_MAX_AGE_MS, VALORANT_IN_MATCH_PROCESS_CHECK_MS } from './process-poll-plan'
import {
  RECORDING_MAX_DURATION_CHECK_MS,
  checkRecordingMaxDuration,
  createIgnoredStartRearm,
  createSerialRunner,
  isSupersededGameStop,
  maxRecordingDurationMs,
  recordingOwnerGame,
  resolveGameStartOwnership,
} from './recording-ownership'
import { RecordingSessionLog, canScanForOrphanRecordings, resolveOrphanRecordingGame } from './recording-session-log'
import { StartupFailureSummary, fileSeenStore } from './startup-failure-summary'
import {
  app,
  BrowserWindow,
  Tray,
  ipcMain,
  shell,
  globalShortcut,
  dialog,
  powerMonitor,
} from 'electron'
import { join } from 'path'
import fs from 'fs'
import { addExcludedObsRecordingPath } from './obs-recording-exclusions'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { showAppNotification, setMatchRecordingGuard } from './app-notifications'
import { reportReadyNotice } from './report-ready-notice'
import { focusesReply, isFocusGame, isFocusId, parseAddFocus } from './focuses-bridge'
import { addReady, readReadyFile, removeReady, writeReadyFile, type ReadyAnalysis } from './ready-analyses'
import {
  startCoachNotificationPoller,
  stopCoachNotificationPoller,
} from './coach-notification-poller'
import {
  setupAutoUpdater,
  markStartupComplete,
  checkForUpdatesIfIdle,
  setUpdateActivityGuard,
  resumeDeferredUpdateWork,
  setInstallGate,
} from './updater'
import { pingDesktopOnboarding, resetDesktopOnboardingPing } from './onboarding-ping'
import { GameDetector } from './game-detector'
import {
  decideMatchWaitAfterProcessMiss,
  formatMatchWaitCancelActivity,
  formatMatchWaitMilestone,
  MATCH_WAIT_MILESTONE_MS,
  shouldAbortMatchWaitOnGameStopped,
  shouldCancelGenericProcessMiss,
  shouldSuppressFinalizeOnGameStopped,
  shouldLogUnknownProbe,
  shouldReauthAfterPresenceNulls,
} from './match-wait-guard'
import { Recorder } from './recorder'
import { OBSRecorder } from './obs-recorder'
import { shouldResumeMatchDetectionOnObsConnect } from './obs-match-resume'
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
  RecordingPreparationError,
  resolveUploadVideoPath,
  deleteCompressedSibling,
  deleteLocalRecordingFiles,
} from './vod-compressor'
import {
  waitUntilBackgroundWorkAllowed,
  registerDeferredUploadRetry,
  clearDeferredUploadRetry,
  flushDeferredUploadRetries,
  shouldDeferHeavyBackgroundWork,
  abortVodCompression,
} from './match-priority-guard'
import { AccountChangedError, bumpAccountScope, snapshotAccountOwner } from './account-scope'
import {
  canAutoEnqueueRecording,
  decidePostMatchNextStep,
  isWaitingMatchDataState,
} from './post-match-steps'
import { RecordingPipelineSingleFlight } from './recording-pipeline-single-flight'
import { POST_MATCH_COPY, matchDataReadyStartingUpload, matchDataReadyUploading, waitingMatchDataBeforeAnalyse, waitingMatchDataBeforeUpload } from '../../src/lib/post-match-copy'
import {
  addDeferredUploadId,
  getDeferredUploadQueuePath,
  readDeferredUploadIds,
  removeDeferredUploadId,
} from './deferred-upload-queue'
import {
  getPostMatchJobStorePath,
  PostMatchJobStore,
  type PostMatchJob,
} from './post-match-job-store'
import { PostMatchDeferredError, PostMatchWorker } from './post-match-worker'
import {
  resolveReadyRecordingPath,
  resolveReadyRecordingPathDetailed,
  listUnregisteredRecordingFiles,
} from './recording-path-resolver'
import { broadcastObsConnection, startObsHealthMonitor } from './obs-health'
import { ensureObsConnected } from './obs-ensure'
import { canHardRecoverObs, shouldRelaunchAfterFinalize, type ObsWatchdogSnapshot } from './obs-watchdog-policy'
import { isObsProcessRunning } from './obs-process'
import {
  ensureObsProfileInstalled,
  resolveObsWebSocketPassword,
  UPFORGE_OBS_DEFAULT_PASSWORD,
} from './obs-profile-installer'
import {
  RiotLocalApi,
  recomputeTimelineVideoOffsets,
} from './riot-local-api'
import { readRecentMatchReport, saveRecentMatchExports } from './recent-match-export'
import { shouldRetryFocusSync, syncMatchReports, type SyncResult } from './match-report-sync'
import { focusReportDiagnostic, readFocusSyncState, writeFocusSyncState } from './focus-state'
import { hydrateFocusResponse } from '../../src/lib/focus'
import { decideRiotAccountSwitch, riotSwitchNotice } from './riot-account-switch'
import { isModeFilteredOut, getRecordedModesForGame, recordableModesForGame, normalizeCs2GameMode, modeSkippedMessage } from './recorded-modes-filter'
import { applyLiveKillStampsToTimeline } from './live-kill-stamps'
import { withTimeout } from './promise-timeout'
import { LoLLiveClientApi } from './lol-live-client-api'
import type { LolCaptureContext } from './lol-account-identity'
import { createSupportActivityStore } from './support-activity-history'
import { probeLolLcu, resolveLolFilterMode, lolLinkedPuuidFromAuth, findLolLockfile, lcuGet } from './lol-lcu-api'
import {
  gameLabel,
  idleTooltip,
  normalizeGameId as normalizePrimaryGame,
  resolveGameMode,
  resolveMapLabel,
  type GameId,
} from './game-config'
import {
  emptyMatchData,
  resolveMatchSessionStartMs,
} from './recording-sync'
import { applySpatialEnrichment } from './spatial/enrich'
import { refreshMatchPopulationBenchmarks } from './spatial/enrich-population'
import { applyDemoSpatialEnrichment } from './spatial/demo-enrich'
import { UploadManager, savePendingJob, clearPendingJob } from './upload-manager'
import { readAiTraining, saveAiTraining } from './ai-training'
import { UploadRequestError } from './upload-request-errors'
import {
  readAccountDeletion, requestAccountDeletion, cancelAccountDeletion,
  readAccountExport, requestAccountExport, isSafeDownloadUrl,
} from './account-deletion'
import { resolveUploadPlayerIdentity } from './upload-player-identity'
import {
  activateUserSession,
  clearUserSession,
  readActivePendingJob,
  getActiveUserId,
  persistActiveUserOverlay,
} from './user-session'
import {
  resolveRecordingSavePath,
  userDataRoot,
  localMediaRoot,
  userRecordingsDir,
  legacyGlobalRecordingsDir,
} from './user-data-paths'
import { extractAnalysisIdFromPollStatus, asCompletedPollStatus, isTerminalPollSuccess } from './analysis-completion'
import { wasBackgroundWorkInterrupted } from './background-interrupt'
import { startAnalysisPoll, stopActiveAnalysisPoll, reconcileOrphanedJob, getActiveAnalysisPollJobId, type AnalysisPollStatus } from './analysis-poll'
import { abortInFlightAnalysis } from './abort-in-flight-analysis'
import { buildAnalysisPipelineDiagnostics } from './analysis-pipeline-diagnostics'
import { reconcileStuckAnalysisJobs, type ReconciledAnalysisContext } from './stuck-analysis-reconciler'
import { buildAnalysisErrorPayload, classifyAnalysisFailure, formatAnalysisFailureMessage, isDegradedTelemetryResult, type AnalysisErrorPayload } from './analysis-failure-messages'
import { parseDuelFailureDiagnostics, diagnosticsSummary, type DuelFailureDiagnostics } from '../../src/lib/duel-diagnostics'
import { AuthManager } from './auth-manager'
import { closeWebShell } from './web-shell'
import { clearWebShellSession } from './web-shell-session'
import { SettingsManager, DEFAULT_CLIP_CAPTURE } from './settings-manager'
import { setupIpcHandlers, setupClipHandlers, cancelAllPollingTimers } from './ipc-handlers'
import {
  initFunnelEvents,
  trackAppOpened,
  trackLogin,
  trackFirstRecording,
  trackMatchDetected,
  trackRecordingStarted,
  trackRecordingFailed,
  trackUploadStarted,
  trackUploadFailed,
  trackPreparationStarted,
  trackPreparationCompleted,
  trackQuotaReached,
  trackUpgradePromptShown,
  trackObsConnected,
  trackFirstAnalysis,
  trackSecondAnalysis,
  trackOpsRecordingLap,
  trackAnalysisDegraded,
  trackPostgameOpened,
  trackFirstMatchSynced,
  trackFunnelEvent,
} from './funnel-events'
import { WarmupPrompt, fileWarmupStore, shouldCloseTrainerOnGameStart } from './warmup-prompt'
import { clearTrainerLaunchGame, launchTrainerDrill, loadWarmupData, onTrainerRunFinished, trainerLaunchedWhileGameOpen } from './ipc/gaming-ipc'
import { collectMachineProfile } from './machine-profile'
import { MatchTelemetrySession, type SectorName } from './match-telemetry'
import { startObsStatsSampler } from './obs-stats-sampler'
import { sha256File } from './recording-checksum'
import {
  formatRecordingFailure,
  formatCorruptRecordingMessage,
  type RecordingBackend,
} from './capture-backend'
import { reportRecordingError } from './recording-errors'
import { UpgradeRequiredError } from './errors'
import { classifyActivationError } from './activation-error-codes'
import {
  estimateRecordingBytes,
  exceedsRecordingSizeCap,
  recommendSettingsUnderCap,
} from './recording-size-estimate'
import { mergeSkillProfileFromAnalysis } from '../../src/lib/skill-profile'
import { shouldUseOnboardingBonus } from '../../src/lib/onboarding-match-mission'
import { parseMatchHighlightsFromApi } from '../../src/lib/match-highlights'
import { extractSpatialFromAnalysisPayload } from '../../src/lib/analysis-enrichment'
import { desktopVodResultsUrl, isPrimaryGame } from '../../src/lib/games'
import { isTrainerGame } from '../../src/lib/trainer-games'
import { analysisScoreText, coachingReadyBody } from '../../src/lib/analysis-ready-copy'
import { RecordingsStore, riotAccountRole, type ClipOnlyReason, type PendingRecording } from './recordings-store'
import { flushAllCataloguesSync, rowTimelineSummary } from './recordings-store-files'
import { ProductionVodFixtureLibrary } from './production-vod-fixture'
import {
  buildOrphanValorantTimeline,
  inspectOrphanRecordingTiming,
} from './orphan-recording-recovery'
import { ClipExtractor, ffmpegPath } from './clip-extractor'
import { alignValorantTimelineByRoundTimer, ffmpegFrameReader } from './valorant-timer-sync'
import { ClipStore } from './clip-store'
import { HotkeyManager } from './hotkey-manager'
import { createOverlayWindow, requestOverlayToggle, destroyOverlay, sendOverlayData, isOverlayVisible, showOverlay, hideOverlay } from './overlay-window'
import { deliverInGameFeedback, usesOverlayFeedback } from './in-game-feedback'
import { getSessionPollIntervalMs, isInGameOverlayEnabled } from './in-game-overlay'
import { shouldMinimizeForDetectedGame, shouldOpenPostGameWindow } from './onboarding-window-policy'
import { captureAndSaveScreenshot } from './screenshot-capture'
import { PerformanceManager } from './performance-manager'
import { TrainerBridge } from './trainer-bridge'
import type { MatchData } from './riot-types'
import log from 'electron-log'
import { setupMainProcessErrorHandlers, reportError, reportDiagnostic } from './error-reporter'
import { recordErrorActivity, clearErrorActivity, recentErrorActivity } from './error-activity'
import { runSelftest } from './selftest'
import { createDiagnosticReporter, type DiagnosticEvent, type DiagnosticRateState } from './diagnostic-reporter'
import { reportPipelineError, shouldReportAnalysisPipelineError } from './pipeline-errors'
import {
  CRITICAL_FREE_DISK_BYTES,
  LOW_FREE_DISK_BYTES,
  formatFreeDiskLabel,
  getFreeDiskSpace,
} from './disk-space'
import { cleanupLegacyRecordingDuplicates, isLocalOnlyRecording, runRecordingStorageMaintenance } from './storage-cleanup'
import { isOwnedRecordingFile } from './owned-recording-files'
import { expiryNotificationBody, localExpiryDeleteAt } from './recording-expiry'
import { untrackedNotificationBody } from './untracked-recording-grace'
import { setupStorageHandlers } from './ipc/storage-ipc'
import { setupValorantRankHandlers } from './ipc/valorant-rank-ipc'
import type { ValorantRankService } from './valorant-rank'
import { setupRecordingsHandlers } from './ipc/recordings-ipc'
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
import { extractAndUploadDuelClips, countMomentsWithClipKeys, selectRecordedDuelMoments } from './duel-clip-uploader'
import { requestPregameBrief as _requestPregameBrief, requestPostGameDebrief as _requestPostGameDebrief } from './post-game-api'
import { enrichTimelineForCoaching } from './match-coaching-enrich'
import { enrichLolTimelineForCoaching } from './lol-match-v5-enrich'
import { LolLocalMatchCollector, lolLocalReportsEnabled, type LolLocalMatchCapture } from './lol-local-match'
import { LolLocalMatchQueue, LOL_LOCAL_MATCH_ENDPOINT, readLolEndOfGame, submitLolLocalMatch } from './lol-local-match-service'
import {
  formatNetworkProbeSummary,
  formatSupportBundle,
  getLastUploadNetworkError,
  isLikelyNetworkFailure,
  noteUploadNetworkFailure,
  runNetworkDiagnostics,
} from './network-diagnostics'
import {
  formatLolLinkActivity,
  formatLolMatchEndActivity,
} from './lol-enrich-activity'
import {
  getAnalysisReadiness,
  getVodFileReadiness,
  isTerminalAnalysisReadinessState,
  refreshVodProbe,
  waitUntilVodFileReady,
  withAnalysisReadiness,
  type AnalysisReadiness,
} from './analysis-readiness'
import {
  beginPreparation,
  setPrepStep,
  completePreparation,
  failPreparation,
} from './preparation-instrumentation'
import {
  clearPostGameSession,
  capturePostGameSession,
  getPostGameSessionSnapshot,
  isPostGamePastPreparing,
  isPostGameSessionForRecording,
  resetPostGameSession,
  sendPostGameEvent,
  sendPostGameEventForRecording,
} from './post-game-session'
import { hasDemoKillRows, hasRichMatchData, hasRichMatchDataForGame, MATCH_DETAILS_ENRICH_MAX_MS, demoSyncMaxMsForGame, shouldDeferPostGameForDemoSync, shouldScheduleLateClipRetry, cs2RecordingSavedDashboardMessage, deadlockRecordingSavedDashboardMessage, valorantMatchStatsPollIntervalMs } from './match-data-quality'
import {
  buildCoachingSubmissionExtras,
  topSkillFocus,
  type CoachingSubmissionExtras,
} from './match-coaching-context'
import { resolveInstanceLock, startInstanceCoordinator } from './instance-coordinator'
import { decideValorantNextMatchRearm } from './valorant-next-match-rearm'
import {
  startSteamGsiServer,
  ensureGsiAuthToken,
  resetSteamGsiSession,
  installSteamGsiConfig,
  isGsiServerReady,
  isGsiPortBlocked,
  isGsiMatchLive,
  isGsiMatchEnded,
  gsiMatchEndReason,
  hasEverReceivedGsi,
  getLatestGsiMap,
  getLatestGsiPayload,
  getActiveGsiPort,
  cs2GsiTracker,
} from './steam-gsi-server'
import {
  startDeadlockLogWatcher,
  stopDeadlockLogWatcher,
  resetDeadlockLogSession,
  noteDeadlockWaitStarted,
  isDeadlockReadyToRecord,
  isDeadlockMatchEnded,
  isDeadlockMatchLive,
  isDeadlockDetectionActive,
  suppressDeadlockAutoRecordUntilNewMatch,
  getDeadlockMap,
  getDeadlockHero,
  getDeadlockLobbyMatchId,
  getDeadlockMatchStartedAt,
  getDeadlockMatchSalts,
  getDeadlockDetectionStatus,
} from './deadlock-match-watcher'
import { recordingHeroLabel, resolveDeadlockRecordingMatch } from './deadlock-recording-hero'
import { DeadlockQueueLookups, deadlockAllowsAutoAnalyse, deadlockApiQueue, deadlockAutoAnalyseDecision, deadlockManualOnlyActivity } from './deadlock-auto-analyse'
import { linkDeadlockAutoReview } from './deadlock-auto-review-link'
import { FaceitLinkStore, registerCs2FaceitMatchIpc } from './cs2-faceit-match'
import { setupCoachFlowDemoHandlers } from './ipc/coach-flow-demo-ipc'
import { setupCoachFlowLiveHandlers, startLiveCoachFlow } from './ipc/coach-flow-live-ipc'
import { prepareMatchDataForUpload } from './match-data-payload'
import { resendMatchDataForRetry } from './retry-match-data'
import { cs2StartingReportMatches } from './cs2-starting-report'
import { registerEnemyHabitsIpc } from './ipc/enemy-habits-ipc'
import { getGameDataCapture } from './game-data-capture'
import { setupGameDataCaptureHandlers } from './ipc/game-data-capture-ipc'

import { createMainLifecycle } from './main-lifecycle'
import { createMainDevPreview } from './main-dev-preview'
import type { MainRuntimeBindings } from './main-runtime-context'
import { createMainMatchDetection } from './main-match-detection'
import { createMainStartup } from './main-startup'
import { createMainAnalysis } from './main-analysis'
import { createMainReplay } from './main-replay'
import { createMainReadiness } from './main-readiness'
import { createMainSession } from './main-session'
import { createMainAnalysisNotifications } from './main-analysis-notifications'
const mainRuntimeBindings: MainRuntimeBindings = {
  get FAILURE_NOTIFY_COOLDOWN_MS(): MainRuntimeBindings["FAILURE_NOTIFY_COOLDOWN_MS"] { return FAILURE_NOTIFY_COOLDOWN_MS },
  get POST_GAME_VOD_PROBE_MAX_MS(): MainRuntimeBindings["POST_GAME_VOD_PROBE_MAX_MS"] { return POST_GAME_VOD_PROBE_MAX_MS },
  get abortBackgroundWorkOnGameStart(): MainRuntimeBindings["abortBackgroundWorkOnGameStart"] { return abortBackgroundWorkOnGameStart },
  get abortInFlightAnalysisForRecording(): MainRuntimeBindings["abortInFlightAnalysisForRecording"] { return abortInFlightAnalysisForRecording },
  get acceptDeepLink(): MainRuntimeBindings["acceptDeepLink"] { return acceptDeepLink },
  get activeCapture(): MainRuntimeBindings["activeCapture"] { return activeCapture },
  set activeCapture(value) { activeCapture = value },
  get activeMatchTelemetry(): MainRuntimeBindings["activeMatchTelemetry"] { return activeMatchTelemetry },
  set activeMatchTelemetry(value) { activeMatchTelemetry = value },
  get activeUploadRecordingIds(): MainRuntimeBindings["activeUploadRecordingIds"] { return activeUploadRecordingIds },
  get activityLog(): MainRuntimeBindings["activityLog"] { return activityLog },
  get analysisPipelineSingleFlight(): MainRuntimeBindings["analysisPipelineSingleFlight"] { return analysisPipelineSingleFlight },
  get analysisReadinessRefreshGeneration(): MainRuntimeBindings["analysisReadinessRefreshGeneration"] { return analysisReadinessRefreshGeneration },
  get authManager(): MainRuntimeBindings["authManager"] { return authManager },
  get backgroundMatchState(): MainRuntimeBindings["backgroundMatchState"] { return backgroundMatchState },
  get beginMatchPerformanceMode(): MainRuntimeBindings["beginMatchPerformanceMode"] { return beginMatchPerformanceMode },
  get beginMatchTelemetry(): MainRuntimeBindings["beginMatchTelemetry"] { return beginMatchTelemetry },
  get bindPostGameSessionToRecording(): MainRuntimeBindings["bindPostGameSessionToRecording"] { return bindPostGameSessionToRecording },
  get cachedShippingProcessUp(): MainRuntimeBindings["cachedShippingProcessUp"] { return cachedShippingProcessUp },
  set cachedShippingProcessUp(value) { cachedShippingProcessUp = value },
  get cancelAnalysisReadinessRefresh(): MainRuntimeBindings["cancelAnalysisReadinessRefresh"] { return cancelAnalysisReadinessRefresh },
  get cancelMatchWait(): MainRuntimeBindings["cancelMatchWait"] { return cancelMatchWait },
  set cancelMatchWait(value) { cancelMatchWait = value },
  get captureNetworkEvidence(): MainRuntimeBindings["captureNetworkEvidence"] { return captureNetworkEvidence },
  get captureOwnerId(): MainRuntimeBindings["captureOwnerId"] { return captureOwnerId },
  get captureOwnership(): MainRuntimeBindings["captureOwnership"] { return captureOwnership },
  get clearAccountScopedRuntimeState(): MainRuntimeBindings["clearAccountScopedRuntimeState"] { return clearAccountScopedRuntimeState },
  get clearDeferredUploadRetryPersisted(): MainRuntimeBindings["clearDeferredUploadRetryPersisted"] { return clearDeferredUploadRetryPersisted },
  get clipExtractor(): MainRuntimeBindings["clipExtractor"] { return clipExtractor },
  get clipFfmpegProbe(): MainRuntimeBindings["clipFfmpegProbe"] { return clipFfmpegProbe },
  get clipStore(): MainRuntimeBindings["clipStore"] { return clipStore },
  get createMainLagReporter(): MainRuntimeBindings["createMainLagReporter"] { return createMainLagReporter },
  get createMainWindow(): MainRuntimeBindings["createMainWindow"] { return createMainWindow },
  get createPostGameWindow(): MainRuntimeBindings["createPostGameWindow"] { return createPostGameWindow },
  get createSplashWindow(): MainRuntimeBindings["createSplashWindow"] { return createSplashWindow },
  get createTray(): MainRuntimeBindings["createTray"] { return createTray },
  get cs2DemoRetrieval(): MainRuntimeBindings["cs2DemoRetrieval"] { return cs2DemoRetrieval },
  get currentGsiMapName(): MainRuntimeBindings["currentGsiMapName"] { return currentGsiMapName },
  set currentGsiMapName(value) { currentGsiMapName = value },
  get currentMatchGameMode(): MainRuntimeBindings["currentMatchGameMode"] { return currentMatchGameMode },
  set currentMatchGameMode(value) { currentMatchGameMode = value },
  get currentMatchStartTime(): MainRuntimeBindings["currentMatchStartTime"] { return currentMatchStartTime },
  set currentMatchStartTime(value) { currentMatchStartTime = value },
  get currentRecordingOwnerGame(): MainRuntimeBindings["currentRecordingOwnerGame"] { return currentRecordingOwnerGame },
  get currentRecordingStartTime(): MainRuntimeBindings["currentRecordingStartTime"] { return currentRecordingStartTime },
  set currentRecordingStartTime(value) { currentRecordingStartTime = value },
  get deadlockAutoUploadGate(): MainRuntimeBindings["deadlockAutoUploadGate"] { return deadlockAutoUploadGate },
  get deadlockQueueLookups(): MainRuntimeBindings["deadlockQueueLookups"] { return deadlockQueueLookups },
  get deadlockReplayFailureNotices(): MainRuntimeBindings["deadlockReplayFailureNotices"] { return deadlockReplayFailureNotices },
  get deadlockReviewPolls(): MainRuntimeBindings["deadlockReviewPolls"] { return deadlockReviewPolls },
  get deadlockSessionStartAt(): MainRuntimeBindings["deadlockSessionStartAt"] { return deadlockSessionStartAt },
  set deadlockSessionStartAt(value) { deadlockSessionStartAt = value },
  get discordMatchContext(): MainRuntimeBindings["discordMatchContext"] { return discordMatchContext },
  get discordRPC(): MainRuntimeBindings["discordRPC"] { return discordRPC },
  get dismissMatchWaitUi(): MainRuntimeBindings["dismissMatchWaitUi"] { return dismissMatchWaitUi },
  get dispatchAnalysisFailure(): MainRuntimeBindings["dispatchAnalysisFailure"] { return dispatchAnalysisFailure },
  get dispatchReconciledAnalysisReady(): MainRuntimeBindings["dispatchReconciledAnalysisReady"] { return dispatchReconciledAnalysisReady },
  get doUploadArchiveOnly(): MainRuntimeBindings["doUploadArchiveOnly"] { return doUploadArchiveOnly },
  get dropAutomaticDeadlockJobs(): MainRuntimeBindings["dropAutomaticDeadlockJobs"] { return dropAutomaticDeadlockJobs },
  get emitActiveOpsLap(): MainRuntimeBindings["emitActiveOpsLap"] { return emitActiveOpsLap },
  get endMatchPerformanceMode(): MainRuntimeBindings["endMatchPerformanceMode"] { return endMatchPerformanceMode },
  get enforceRecordingPresetAccess(): MainRuntimeBindings["enforceRecordingPresetAccess"] { return enforceRecordingPresetAccess },
  get enqueuePostMatchAnalyse(): MainRuntimeBindings["enqueuePostMatchAnalyse"] { return enqueuePostMatchAnalyse },
  get enrichTimelineSpatial(): MainRuntimeBindings["enrichTimelineSpatial"] { return enrichTimelineSpatial },
  get ensureAnalysisReadinessForAnalyse(): MainRuntimeBindings["ensureAnalysisReadinessForAnalyse"] { return ensureAnalysisReadinessForAnalyse },
  get ensureObsCaptureForGame(): MainRuntimeBindings["ensureObsCaptureForGame"] { return ensureObsCaptureForGame },
  get ensureObsReady(): MainRuntimeBindings["ensureObsReady"] { return ensureObsReady },
  get ensureObsReadyOrThrow(): MainRuntimeBindings["ensureObsReadyOrThrow"] { return ensureObsReadyOrThrow },
  get extractFailureDiagnostics(): MainRuntimeBindings["extractFailureDiagnostics"] { return extractFailureDiagnostics },
  get extractKillClipsOnly(): MainRuntimeBindings["extractKillClipsOnly"] { return extractKillClipsOnly },
  get extractMatchClips(): MainRuntimeBindings["extractMatchClips"] { return extractMatchClips },
  get ffmpegOk(): MainRuntimeBindings["ffmpegOk"] { return ffmpegOk },
  set ffmpegOk(value) { ffmpegOk = value },
  get fileSizeOrNull(): MainRuntimeBindings["fileSizeOrNull"] { return fileSizeOrNull },
  get finalizeAfterObsProcessDeath(): MainRuntimeBindings["finalizeAfterObsProcessDeath"] { return finalizeAfterObsProcessDeath },
  set finalizeAfterObsProcessDeath(value) { finalizeAfterObsProcessDeath = value },
  get finalizeTimelineOffsetsForClips(): MainRuntimeBindings["finalizeTimelineOffsetsForClips"] { return finalizeTimelineOffsetsForClips },
  get focusMainWindow(): MainRuntimeBindings["focusMainWindow"] { return focusMainWindow },
  get gameDetector(): MainRuntimeBindings["gameDetector"] { return gameDetector },
  get getRecordingBackendForStatus(): MainRuntimeBindings["getRecordingBackendForStatus"] { return getRecordingBackendForStatus },
  get gsiPollTimer(): MainRuntimeBindings["gsiPollTimer"] { return gsiPollTimer },
  set gsiPollTimer(value) { gsiPollTimer = value },
  get guestClaimDeclinedFor(): MainRuntimeBindings["guestClaimDeclinedFor"] { return guestClaimDeclinedFor },
  set guestClaimDeclinedFor(value) { guestClaimDeclinedFor = value },
  get guestClaimInFlight(): MainRuntimeBindings["guestClaimInFlight"] { return guestClaimInFlight },
  set guestClaimInFlight(value) { guestClaimInFlight = value },
  get handleOrphanedJobAtStartup(): MainRuntimeBindings["handleOrphanedJobAtStartup"] { return handleOrphanedJobAtStartup },
  get hotkeyBookmarks(): MainRuntimeBindings["hotkeyBookmarks"] { return hotkeyBookmarks },
  get hotkeyManager(): MainRuntimeBindings["hotkeyManager"] { return hotkeyManager },
  get inGameFeedbackDeps(): MainRuntimeBindings["inGameFeedbackDeps"] { return inGameFeedbackDeps },
  get initPostMatchWorker(): MainRuntimeBindings["initPostMatchWorker"] { return initPostMatchWorker },
  get interruptBackgroundWorkForMatch(): MainRuntimeBindings["interruptBackgroundWorkForMatch"] { return interruptBackgroundWorkForMatch },
  get ipcHandlersReady(): MainRuntimeBindings["ipcHandlersReady"] { return ipcHandlersReady },
  set ipcHandlersReady(value) { ipcHandlersReady = value },
  get isBlockingVodReadiness(): MainRuntimeBindings["isBlockingVodReadiness"] { return isBlockingVodReadiness },
  get isObsUnavailableError(): MainRuntimeBindings["isObsUnavailableError"] { return isObsUnavailableError },
  get isQuitting(): MainRuntimeBindings["isQuitting"] { return isQuitting },
  set isQuitting(value) { isQuitting = value },
  get lastMatchDiagnostic(): MainRuntimeBindings["lastMatchDiagnostic"] { return lastMatchDiagnostic },
  set lastMatchDiagnostic(value) { lastMatchDiagnostic = value },
  get lastReplayRetryContext(): MainRuntimeBindings["lastReplayRetryContext"] { return lastReplayRetryContext },
  set lastReplayRetryContext(value) { lastReplayRetryContext = value },
  get lastShippingProcessCheckAt(): MainRuntimeBindings["lastShippingProcessCheckAt"] { return lastShippingProcessCheckAt },
  set lastShippingProcessCheckAt(value) { lastShippingProcessCheckAt = value },
  get lateClipRetryDeps(): MainRuntimeBindings["lateClipRetryDeps"] { return lateClipRetryDeps },
  get linkAutoDeadlockReviewJob(): MainRuntimeBindings["linkAutoDeadlockReviewJob"] { return linkAutoDeadlockReviewJob },
  get linkedLolAccountsFromAuth(): MainRuntimeBindings["linkedLolAccountsFromAuth"] { return linkedLolAccountsFromAuth },
  get linkedRiotAccountsFromAuth(): MainRuntimeBindings["linkedRiotAccountsFromAuth"] { return linkedRiotAccountsFromAuth },
  get linkedRiotFromAuth(): MainRuntimeBindings["linkedRiotFromAuth"] { return linkedRiotFromAuth },
  get localMediaWork(): MainRuntimeBindings["localMediaWork"] { return localMediaWork },
  set localMediaWork(value) { localMediaWork = value },
  get logActivity(): MainRuntimeBindings["logActivity"] { return logActivity },
  get logAnalysisFailureActivity(): MainRuntimeBindings["logAnalysisFailureActivity"] { return logAnalysisFailureActivity },
  get lolAccountsFetchedAt(): MainRuntimeBindings["lolAccountsFetchedAt"] { return lolAccountsFetchedAt },
  set lolAccountsFetchedAt(value) { lolAccountsFetchedAt = value },
  get lolLiveClientApi(): MainRuntimeBindings["lolLiveClientApi"] { return lolLiveClientApi },
  get lolLocalCollector(): MainRuntimeBindings["lolLocalCollector"] { return lolLocalCollector },
  get mainWindow(): MainRuntimeBindings["mainWindow"] { return mainWindow },
  set mainWindow(value) { mainWindow = value },
  get manualEndMatchRecording(): MainRuntimeBindings["manualEndMatchRecording"] { return manualEndMatchRecording },
  set manualEndMatchRecording(value) { manualEndMatchRecording = value },
  get matchCapturePriority(): MainRuntimeBindings["matchCapturePriority"] { return matchCapturePriority },
  set matchCapturePriority(value) { matchCapturePriority = value },
  get matchDetectInFlightDepth(): MainRuntimeBindings["matchDetectInFlightDepth"] { return matchDetectInFlightDepth },
  set matchDetectInFlightDepth(value) { matchDetectInFlightDepth = value },
  get matchFinalizeInFlight(): MainRuntimeBindings["matchFinalizeInFlight"] { return matchFinalizeInFlight },
  set matchFinalizeInFlight(value) { matchFinalizeInFlight = value },
  get matchFlowGame(): MainRuntimeBindings["matchFlowGame"] { return matchFlowGame },
  set matchFlowGame(value) { matchFlowGame = value },
  get matchFlowGeneration(): MainRuntimeBindings["matchFlowGeneration"] { return matchFlowGeneration },
  set matchFlowGeneration(value) { matchFlowGeneration = value },
  get matchHandled(): MainRuntimeBindings["matchHandled"] { return matchHandled },
  set matchHandled(value) { matchHandled = value },
  get matchPerformanceModeActive(): MainRuntimeBindings["matchPerformanceModeActive"] { return matchPerformanceModeActive },
  set matchPerformanceModeActive(value) { matchPerformanceModeActive = value },
  get matchPriorityDeps(): MainRuntimeBindings["matchPriorityDeps"] { return matchPriorityDeps },
  get maybeAutoEnqueueWhenReady(): MainRuntimeBindings["maybeAutoEnqueueWhenReady"] { return maybeAutoEnqueueWhenReady },
  get maybeCaptureRiotDnsEvidence(): MainRuntimeBindings["maybeCaptureRiotDnsEvidence"] { return maybeCaptureRiotDnsEvidence },
  get maybeDeleteLocalRecordingAfterAnalysis(): MainRuntimeBindings["maybeDeleteLocalRecordingAfterAnalysis"] { return maybeDeleteLocalRecordingAfterAnalysis },
  get maybeResumeDeferredUploads(): MainRuntimeBindings["maybeResumeDeferredUploads"] { return maybeResumeDeferredUploads },
  get mergeSpatialSummary(): MainRuntimeBindings["mergeSpatialSummary"] { return mergeSpatialSummary },
  get notifyCoachingReady(): MainRuntimeBindings["notifyCoachingReady"] { return notifyCoachingReady },
  get notifyDashboardToast(): MainRuntimeBindings["notifyDashboardToast"] { return notifyDashboardToast },
  get notifyObsRecordingUnavailable(): MainRuntimeBindings["notifyObsRecordingUnavailable"] { return notifyObsRecordingUnavailable },
  get notifyRecordingUx(): MainRuntimeBindings["notifyRecordingUx"] { return notifyRecordingUx },
  get notifyRecordingsUpdated(): MainRuntimeBindings["notifyRecordingsUpdated"] { return notifyRecordingsUpdated },
  get notifySilent(): MainRuntimeBindings["notifySilent"] { return notifySilent },
  get obsRecorder(): MainRuntimeBindings["obsRecorder"] { return obsRecorder },
  get obsStartupTask(): MainRuntimeBindings["obsStartupTask"] { return obsStartupTask },
  set obsStartupTask(value) { obsStartupTask = value },
  get obsWatchdogSnapshot(): MainRuntimeBindings["obsWatchdogSnapshot"] { return obsWatchdogSnapshot },
  get offerGuestMediaClaim(): MainRuntimeBindings["offerGuestMediaClaim"] { return offerGuestMediaClaim },
  get onRecordingLost(): MainRuntimeBindings["onRecordingLost"] { return onRecordingLost },
  set onRecordingLost(value) { onRecordingLost = value },
  get onSettingsSaved(): MainRuntimeBindings["onSettingsSaved"] { return onSettingsSaved },
  get orphanRecoveryMessage(): MainRuntimeBindings["orphanRecoveryMessage"] { return orphanRecoveryMessage },
  get orphanedRecordingsScanned(): MainRuntimeBindings["orphanedRecordingsScanned"] { return orphanedRecordingsScanned },
  set orphanedRecordingsScanned(value) { orphanedRecordingsScanned = value },
  get overlayAutoHideTimer(): MainRuntimeBindings["overlayAutoHideTimer"] { return overlayAutoHideTimer },
  set overlayAutoHideTimer(value) { overlayAutoHideTimer = value },
  get overlayPollTimer(): MainRuntimeBindings["overlayPollTimer"] { return overlayPollTimer },
  set overlayPollTimer(value) { overlayPollTimer = value },
  get overstepBridge(): MainRuntimeBindings["overstepBridge"] { return overstepBridge },
  set overstepBridge(value) { overstepBridge = value },
  get pendingDeepLink(): MainRuntimeBindings["pendingDeepLink"] { return pendingDeepLink },
  get pendingRecordingStart(): MainRuntimeBindings["pendingRecordingStart"] { return pendingRecordingStart },
  set pendingRecordingStart(value) { pendingRecordingStart = value },
  get performanceManager(): MainRuntimeBindings["performanceManager"] { return performanceManager },
  get postGameWindow(): MainRuntimeBindings["postGameWindow"] { return postGameWindow },
  set postGameWindow(value) { postGameWindow = value },
  get postMatchJobStore(): MainRuntimeBindings["postMatchJobStore"] { return postMatchJobStore },
  set postMatchJobStore(value) { postMatchJobStore = value },
  get postMatchQueueUserId(): MainRuntimeBindings["postMatchQueueUserId"] { return postMatchQueueUserId },
  set postMatchQueueUserId(value) { postMatchQueueUserId = value },
  get postMatchWorker(): MainRuntimeBindings["postMatchWorker"] { return postMatchWorker },
  set postMatchWorker(value) { postMatchWorker = value },
  get prepareLegacyOrphanRecoveryRows(): MainRuntimeBindings["prepareLegacyOrphanRecoveryRows"] { return prepareLegacyOrphanRecoveryRows },
  get prepareTimelineForCoaching(): MainRuntimeBindings["prepareTimelineForCoaching"] { return prepareTimelineForCoaching },
  get productionVodFixtures(): MainRuntimeBindings["productionVodFixtures"] { return productionVodFixtures },
  get pushPregameContext(): MainRuntimeBindings["pushPregameContext"] { return pushPregameContext },
  get readyAnalysesList(): MainRuntimeBindings["readyAnalysesList"] { return readyAnalysesList },
  get rearmWatchInFlight(): MainRuntimeBindings["rearmWatchInFlight"] { return rearmWatchInFlight },
  set rearmWatchInFlight(value) { rearmWatchInFlight = value },
  get recentFailureNotifications(): MainRuntimeBindings["recentFailureNotifications"] { return recentFailureNotifications },
  get reconcileInterruptedUploads(): MainRuntimeBindings["reconcileInterruptedUploads"] { return reconcileInterruptedUploads },
  get recordingFileFinalizer(): MainRuntimeBindings["recordingFileFinalizer"] { return recordingFileFinalizer },
  get recordingSavePath(): MainRuntimeBindings["recordingSavePath"] { return recordingSavePath },
  get recordingSessionLog(): MainRuntimeBindings["recordingSessionLog"] { return recordingSessionLog },
  get recordingsStore(): MainRuntimeBindings["recordingsStore"] { return recordingsStore },
  set recordingsStore(value) { recordingsStore = value },
  get recoverOrphanedValorantMetadata(): MainRuntimeBindings["recoverOrphanedValorantMetadata"] { return recoverOrphanedValorantMetadata },
  get refreshCoachNotificationPoller(): MainRuntimeBindings["refreshCoachNotificationPoller"] { return refreshCoachNotificationPoller },
  get refreshDeadlockProfile(): MainRuntimeBindings["refreshDeadlockProfile"] { return refreshDeadlockProfile },
  get refreshRecordingVodProbe(): MainRuntimeBindings["refreshRecordingVodProbe"] { return refreshRecordingVodProbe },
  get refreshReplayTimelineForRecording(): MainRuntimeBindings["refreshReplayTimelineForRecording"] { return refreshReplayTimelineForRecording },
  get registerClipOnlySession(): MainRuntimeBindings["registerClipOnlySession"] { return registerClipOnlySession },
  get registerDeferredUploadRetryPersisted(): MainRuntimeBindings["registerDeferredUploadRetryPersisted"] { return registerDeferredUploadRetryPersisted },
  get rememberSkippedMatch(): MainRuntimeBindings["rememberSkippedMatch"] { return rememberSkippedMatch },
  get replayAttempts(): MainRuntimeBindings["replayAttempts"] { return replayAttempts },
  get replayCaptureOwnerId(): MainRuntimeBindings["replayCaptureOwnerId"] { return replayCaptureOwnerId },
  set replayCaptureOwnerId(value) { replayCaptureOwnerId = value },
  get replayScope(): MainRuntimeBindings["replayScope"] { return replayScope },
  set replayScope(value) { replayScope = value },
  get replayWork(): MainRuntimeBindings["replayWork"] { return replayWork },
  set replayWork(value) { replayWork = value },
  get reportMainLag(): MainRuntimeBindings["reportMainLag"] { return reportMainLag },
  set reportMainLag(value) { reportMainLag = value },
  get requestPostGameDebrief(): MainRuntimeBindings["requestPostGameDebrief"] { return requestPostGameDebrief },
  get requestPregameBrief(): MainRuntimeBindings["requestPregameBrief"] { return requestPregameBrief },
  get restoreDeferredUploadsFromDisk(): MainRuntimeBindings["restoreDeferredUploadsFromDisk"] { return restoreDeferredUploadsFromDisk },
  get resumePollForJob(): MainRuntimeBindings["resumePollForJob"] { return resumePollForJob },
  get resumeSavedLocalMedia(): MainRuntimeBindings["resumeSavedLocalMedia"] { return resumeSavedLocalMedia },
  get resumeStuckMatchStatsEnrichment(): MainRuntimeBindings["resumeStuckMatchStatsEnrichment"] { return resumeStuckMatchStatsEnrichment },
  get riotLocalApi(): MainRuntimeBindings["riotLocalApi"] { return riotLocalApi },
  get rowLocalExpiresAt(): MainRuntimeBindings["rowLocalExpiresAt"] { return rowLocalExpiresAt },
  get runStorageMaintenanceIfReady(): MainRuntimeBindings["runStorageMaintenanceIfReady"] { return runStorageMaintenanceIfReady },
  get runStuckAnalysisReconcile(): MainRuntimeBindings["runStuckAnalysisReconcile"] { return runStuckAnalysisReconcile },
  get saveReadyAnalyses(): MainRuntimeBindings["saveReadyAnalyses"] { return saveReadyAnalyses },
  get scanForOrphanedRecordings(): MainRuntimeBindings["scanForOrphanedRecordings"] { return scanForOrphanedRecordings },
  get scheduleAnalysisReadinessRefresh(): MainRuntimeBindings["scheduleAnalysisReadinessRefresh"] { return scheduleAnalysisReadinessRefresh },
  get scheduleFocusSyncAfterMatch(): MainRuntimeBindings["scheduleFocusSyncAfterMatch"] { return scheduleFocusSyncAfterMatch },
  set scheduleFocusSyncAfterMatch(value) { scheduleFocusSyncAfterMatch = value },
  get scheduleObsProbeOnWindowLoad(): MainRuntimeBindings["scheduleObsProbeOnWindowLoad"] { return scheduleObsProbeOnWindowLoad },
  get sendAnalysisReadinessUpdate(): MainRuntimeBindings["sendAnalysisReadinessUpdate"] { return sendAnalysisReadinessUpdate },
  get sendLolLocalReport(): MainRuntimeBindings["sendLolLocalReport"] { return sendLolLocalReport },
  get sendUploadFailure(): MainRuntimeBindings["sendUploadFailure"] { return sendUploadFailure },
  get settingsManager(): MainRuntimeBindings["settingsManager"] { return settingsManager },
  set settingsManager(value) { settingsManager = value },
  get setupGameDetection(): MainRuntimeBindings["setupGameDetection"] { return setupGameDetection },
  get shouldRequestDebrief(): MainRuntimeBindings["shouldRequestDebrief"] { return shouldRequestDebrief },
  get showDevelopmentPostGamePreview(): MainRuntimeBindings["showDevelopmentPostGamePreview"] { return showDevelopmentPostGamePreview },
  get startupFailures(): MainRuntimeBindings["startupFailures"] { return startupFailures },
  get stopActiveObsStatsSampler(): MainRuntimeBindings["stopActiveObsStatsSampler"] { return stopActiveObsStatsSampler },
  set stopActiveObsStatsSampler(value) { stopActiveObsStatsSampler = value },
  get stopInstanceCoordinator(): MainRuntimeBindings["stopInstanceCoordinator"] { return stopInstanceCoordinator },
  set stopInstanceCoordinator(value) { stopInstanceCoordinator = value },
  get stopObsHealthMonitor(): MainRuntimeBindings["stopObsHealthMonitor"] { return stopObsHealthMonitor },
  set stopObsHealthMonitor(value) { stopObsHealthMonitor = value },
  get stopObsStatsSampling(): MainRuntimeBindings["stopObsStatsSampling"] { return stopObsStatsSampling },
  get stuckAnalysisReconcileTimer(): MainRuntimeBindings["stuckAnalysisReconcileTimer"] { return stuckAnalysisReconcileTimer },
  set stuckAnalysisReconcileTimer(value) { stuckAnalysisReconcileTimer = value },
  get supportActivity(): MainRuntimeBindings["supportActivity"] { return supportActivity },
  get syncPrimaryGameFromDetection(): MainRuntimeBindings["syncPrimaryGameFromDetection"] { return syncPrimaryGameFromDetection },
  get syncScoutMomentsForJob(): MainRuntimeBindings["syncScoutMomentsForJob"] { return syncScoutMomentsForJob },
  get syncUserSessionFromAuth(): MainRuntimeBindings["syncUserSessionFromAuth"] { return syncUserSessionFromAuth },
  get trackedPrimaryGame(): MainRuntimeBindings["trackedPrimaryGame"] { return trackedPrimaryGame },
  set trackedPrimaryGame(value) { trackedPrimaryGame = value },
  get trainerBridge(): MainRuntimeBindings["trainerBridge"] { return trainerBridge },
  get tray(): MainRuntimeBindings["tray"] { return tray },
  set tray(value) { tray = value },
  get trayRefreshInterval(): MainRuntimeBindings["trayRefreshInterval"] { return trayRefreshInterval },
  set trayRefreshInterval(value) { trayRefreshInterval = value },
  get updateTrayMenuFn(): MainRuntimeBindings["updateTrayMenuFn"] { return updateTrayMenuFn },
  set updateTrayMenuFn(value) { updateTrayMenuFn = value },
  get uploadManager(): MainRuntimeBindings["uploadManager"] { return uploadManager },
  set uploadManager(value) { uploadManager = value },
  get userSessionDeps(): MainRuntimeBindings["userSessionDeps"] { return userSessionDeps },
  get valorantRankService(): MainRuntimeBindings["valorantRankService"] { return valorantRankService },
  set valorantRankService(value) { valorantRankService = value },
  get waitingForMatch(): MainRuntimeBindings["waitingForMatch"] { return waitingForMatch },
  set waitingForMatch(value) { waitingForMatch = value },
  get warmupPrompt(): MainRuntimeBindings["warmupPrompt"] { return warmupPrompt },
  get watchDeadlockReview(): MainRuntimeBindings["watchDeadlockReview"] { return watchDeadlockReview },
  get wireObsConnectionEvents(): MainRuntimeBindings["wireObsConnectionEvents"] { return wireObsConnectionEvents },
}
const mainLifecycle = createMainLifecycle(mainRuntimeBindings)
const mainDevPreview = createMainDevPreview(mainRuntimeBindings)
const mainMatchDetection = createMainMatchDetection(mainRuntimeBindings)
const mainStartup = createMainStartup(mainRuntimeBindings)
const mainAnalysis = createMainAnalysis(mainRuntimeBindings)
const mainReplay = createMainReplay(mainRuntimeBindings)
const mainReadiness = createMainReadiness(mainRuntimeBindings)
const mainSession = createMainSession(mainRuntimeBindings)
const mainAnalysisNotifications = createMainAnalysisNotifications(mainRuntimeBindings)

function fileSizeOrNull(p: string): number | null {
  try { return fs.statSync(p).size } catch { return null }
}
import { pregameKey, pregameQuery, sanitizePregameContext } from './pregame-view'
import { DEEP_LINK_SCHEME, PendingDeepLink, findDeepLinkInArgv } from './deep-link'
import { downloadDeadlockValveReplay } from './deadlock-valve-replay'
import { removeLegacyCs2DemoConfig } from './cs2-steam-setup'
import { resolveCs2LocalPlayerName } from './cs2-player-identity'
import {
  uploadsSourceReplay,
  usesDemoReplay,
  gameNeedsLiveMatchWindow,
} from './game-capabilities'
import {
  buildMatchEndTimeline,
  fetchLiveClientTimeline,
  type ReplayRetryContext,
  isReplayRetryContextEligible,
} from './match-end-timeline'
import {
  scheduleLateClipRetry,
  type LateClipRetryDeps,
} from './late-clip-retry'
import { downloadCs2ValveDemoForSession, type ValveDemoFailureCode } from './cs2-valve-demo-downloader'
import { clearDemoDownloadProgress, sendDemoDownloadProgress } from './demo-download-notify'
import {
  linkReviewTimeline, parseReviewStatus, pollDeadlockReplayReview, startDeadlockReplayReview,
  type PollReviewDeps, type ReviewDetail,
} from './deadlock-review'
import { isDeadlockReviewJobId } from './recordings-store'
import { SourceReplayUploader } from './source-replay-uploader'
import { cs2MatchExtras, createCs2FocusChecker } from './cs2-focus-check'
import { lastAnalysisJob } from './analysis-trace'
import { findLatestReplay } from './source-replay-finder'
import { isTrustedRendererUrl } from './renderer-trust'
import { initValorantContentFallback } from './valorant-content-fallback'
// Keep sandbox sessions separate from the normal desktop account and recordings.
if (!app.isPackaged && process.env.UPFORGE_SANDBOX_USER_DATA) {
  const api = new URL(getApiBaseUrl())
  if (!['127.0.0.1', 'localhost'].includes(api.hostname)) {
    throw new Error('Sandbox user data requires a localhost API')
  }
  fs.mkdirSync(process.env.UPFORGE_SANDBOX_USER_DATA, { recursive: true })
  app.setPath('userData', process.env.UPFORGE_SANDBOX_USER_DATA)
}

// Keep software rendering as the dev default. Opt in to GPU rendering when
// diagnosing stale software-composited video frames in the macOS preview.
if (!app.isPackaged) {
  if (process.env.UPFORGE_DEV_GPU !== '1') app.disableHardwareAcceleration()
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
/**
 * Every `recordings:updated` makes several renderer views reload the whole recordings list (with
 * timelines). Bursts after a match used to feed a reload storm that froze the app, so sends are
 * coalesced: many calls inside 400 ms become one event.
 */
const notifyRecordingsUpdated = createCoalescedNotifier(() => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('recordings:updated')
}, 400)
let postGameWindow: BrowserWindow | null = null
let isQuitting = false
/** False until setupIpcHandlers runs — windows must not load before IPC is wired. */
let ipcHandlersReady = false
let trayRefreshInterval: ReturnType<typeof setInterval> | null = null
let updateTrayMenuFn: (() => void) | null = null
let ffmpegOk = true // clip extraction preflight only

let overstepBridge: OverstepBridge | null = null
const gameDetector = new GameDetector()
let matchPerformanceModeActive = false
/**
 * True from match confirmed until performance mode ends. Holds the post-match
 * worker so an abort at match detect cannot immediately re-claim before OBS starts.
 * Lobby-only (game open, no match yet) does not set this.
 */
let matchCapturePriority = false
const backgroundMatchState = new BackgroundMatchState()
// Same hold as the background-work gate: skip non-essential polls while a match / recording is on.
matchPollPause.configure(() => matchPriorityDeps().isRecording())
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
      obsPreserveActiveScene: s?.obsPreserveActiveScene ?? false,
      obsRecordVerifyMs: s?.obsRecordVerifyMs,
      obsGameplayScene: s?.obsGameplayScene,
    }
  },
  () => {
    const s = settingsManager?.get()
    return s ? buildRecorderConfig(s, hasProAccess(authManager.getUser()), captureOwnerId()) : undefined
  },
  () => settingsManager?.get()?.primaryGame ?? 'valorant',
  (identity) => { settingsManager?.save({ obsGameplayScene: identity }) },
  (filePath) => {
    const current = settingsManager?.get()
    if (!current) return
    settingsManager.save({
      obsNonMatchRecordingPaths: addExcludedObsRecordingPath(
        current.obsNonMatchRecordingPaths,
        filePath,
      ),
    })
  },
)
setUpdateActivityGuard(() => matchPerformanceModeActive || obsRecorder.isActivelyRecording())

let stopObsHealthMonitor: (() => void) | null = null
let obsWasConnected = false
let lastObsDisconnectNotifyAt = 0
let lastObsPreQueueNotifyAt = 0
const OBS_DISCONNECT_NOTIFY_COOLDOWN_MS = 10 * 60 * 1000
const OBS_PREQUEUE_NOTIFY_COOLDOWN_MS = 20 * 60 * 1000
/** Suppress repeated "recording failed / OBS down" toasts for the same live match. */
let lastObsMatchFailNotifyAt = 0
const OBS_MATCH_FAIL_NOTIFY_COOLDOWN_MS = 30 * 60 * 1000

function isObsUnavailableError(message: string): boolean {
  return /obs is not connected|obs not reachable|obs required|websocket|launch obs|tools → websocket/i.test(message)
}

function maybeNotifyObsNotReadyBeforeQueue(): void {
  if (obsRecorder.isConnected()) return
  const now = Date.now()
  if (now - lastObsPreQueueNotifyAt < OBS_PREQUEUE_NOTIFY_COOLDOWN_MS) return
  lastObsPreQueueNotifyAt = now
  const body = 'Recording isn\'t ready yet — UpForge will keep trying to start OBS. You can also open Settings → Recording.'
  logActivity('OBS not connected — connect before your next match')
  showAppNotification({
    title: 'UpForge — Recording not ready',
    body,
    silent: true,
  })
  mainWindow?.webContents.send('app:warning', {
    message: body,
    actionLabel: 'Launch OBS',
    actionRoute: '/settings?tab=recording',
  })
}

/** One clear toast when a match couldn't start because OBS is down — no mid-match spam. */
function notifyObsRecordingUnavailable(detail?: string): void {
  const now = Date.now()
  if (now - lastObsMatchFailNotifyAt < OBS_MATCH_FAIL_NOTIFY_COOLDOWN_MS) {
    logActivity('OBS still unavailable — skipping repeat notification')
    return
  }
  lastObsMatchFailNotifyAt = now
  lastObsPreQueueNotifyAt = now
  const body = detail?.trim()
    ? `This match wasn't recorded — ${detail.trim()}`
    : 'This match wasn\'t recorded because OBS isn\'t connected. Launch OBS from UpForge Settings → Recording, then play your next match.'
  logActivity(body)
  showAppNotification({
    title: 'UpForge — Match not recorded',
    body,
    silent: true,
  })
  mainWindow?.webContents.send('app:warning', {
    message: body,
    actionLabel: 'Launch OBS',
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
    silent: true,
  })
}

function wireObsConnectionEvents(): void {
  obsRecorder.onConnectionChange = (connected, error) => {
    const newlyConnected = connected && !obsWasConnected
    const lostConnection = obsWasConnected && !connected
    obsWasConnected = connected
    if (newlyConnected) {
      trackObsConnected()
      lastObsMatchFailNotifyAt = 0
      maybeResumeMatchDetectionAfterObsConnect()
    }
    broadcastObsConnection(mainWindow, obsRecorder, error)
    updateTrayMenuFn?.()
    // Only notify when an established OBS session is lost — not on failed connect probes.
    if (lostConnection) {
      maybeNotifyObsDisconnect(error)
    }
  }
}

/** Resolve WebSocket credentials + install UpForge OBS profile if needed. */
function prepareObsCredentials(): { password: string; port: number } {
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
  return { password, port }
}

function obsWatchdogSnapshot(extra?: Partial<ObsWatchdogSnapshot>): ObsWatchdogSnapshot {
  return {
    processRunning: true,
    matchOwned: obsRecorder.isRecording(),
    activelyRecording: obsRecorder.isActivelyRecording(),
    disconnectedDuringRecording: obsRecorder.hadDisconnectedDuringRecording(),
    outputActive: false,
    matchPerformanceModeActive,
    ...extra,
  }
}

/**
 * Launch / reconnect OBS (kills hung process when idle).
 * Used on startup, game detect, and before match recording.
 */
async function ensureObsReady(opts?: {
  allowProcessRestart?: boolean
  notifyOnFailure?: boolean
}): Promise<boolean> {
  if (obsRecorder.isConnected()) return true

  const { password, port } = prepareObsCredentials()
  const allowProcessRestart = opts?.allowProcessRestart !== false
    && canHardRecoverObs(obsWatchdogSnapshot({ processRunning: true }))

  const result = await ensureObsConnected(obsRecorder, {
    password,
    port,
    allowProcessRestart,
    canRestartProcess: () => canHardRecoverObs(obsWatchdogSnapshot({ processRunning: true })),
    getWindow: () => mainWindow,
    onActivity: logActivity,
  })

  if (result.ok) return true

  log.warn('[OBS] ensureObsReady failed:', result.error)
  if (opts?.notifyOnFailure) {
    maybeNotifyObsNotReadyBeforeQueue()
  }
  return false
}

let obsStartupTask: Promise<void> = Promise.resolve()

function scheduleObsProbeOnWindowLoad(win: BrowserWindow, notify: boolean): void {
  // Register the pending work before the renderer can ask for its capture check.
  obsStartupTask = new Promise<void>(resolve => {
    win.once('closed', resolve)
    win.webContents.once('did-finish-load', () => {
      win.removeListener('closed', resolve)
      void (async () => {
        const ok = await ensureObsReady({ notifyOnFailure: notify })
        if (!ok || !settingsManager) return
        const game = normalizePrimaryGame(settingsManager.get().primaryGame)
        await ensureObsCaptureForGame(game)
      })().catch(error => log.warn('[OBS] Startup capture check failed:', error)).finally(() => {
        resolve()
      })
    })
  })
}

const OBS_SETUP_HINT =
  'OBS is not connected. UpForge will keep trying to start it — or click Launch OBS in Settings → Recording.'

async function ensureObsReadyOrThrow(): Promise<void> {
  const ok = await ensureObsReady({ allowProcessRestart: true })
  if (ok) return
  throw new Error(OBS_SETUP_HINT)
}

/** Set by setupGameDetection — handles unexpected mid-match capture loss. */
let onRecordingLost: ((error: string) => void) | null = null
/** Set by setupGameDetection — OBS process exit during match-owned recording. */
let finalizeAfterObsProcessDeath: (() => Promise<void>) | null = null

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
  rec.onStatusChange = (recording, error, phase) => {
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
    if (!recording && error && phase !== 'start') {
      log.warn(`[Main] ${label} recording stopped with error:`, error)
      reportRecordingError(phase === 'stop' ? 'stop' : 'mid-match', error, { label, recording_context: rec.getRecordingDiagnostics() })
      // The stop caller displays the failure. A requested stop is not a mid-match loss.
      if (phase === 'stop') return
      onRecordingLost?.(error)
      const obsLost = /obs disconnected/i.test(error)
      const obsProcessExited = /process exited/i.test(error)
      try {
        if (tray && !tray.isDestroyed()) {
          tray.setToolTip(
            obsLost
              ? 'UpForge — OBS disconnected'
              : obsProcessExited
                ? 'UpForge — OBS closed'
                : 'UpForge — Recording stopped!',
          )
        }
      } catch { /* ignore */ }
      // OBS disconnect is often recoverable (OBS keeps recording locally) — avoid a second
      // scary "Recording Stopped" toast; onRecordingLost already notifies with the right copy.
      if (!obsLost && !obsProcessExited) {
        showAppNotification({
          title: 'UpForge — Recording Stopped',
          body: 'Recording stopped unexpectedly. Open UpForge to see details.',
          silent: notifySilent(),
          allowDuringRecording: true,
        })
      }
      setTimeout(() => {
        try {
          if (!isQuitting && tray && !tray.isDestroyed()) tray.setToolTip(idleTooltip())
        } catch { /* ignore */ }
      }, 10_000)
    }
  }
  rec.onStopGaveUp = (message) => {
    log.warn(`[Main] ${label} recording could not stop after retries:`, message)
    logActivity('Recording couldn\'t stop — restart OBS. UpForge will try again when the next game starts.')
    notifyRecordingUx('Recording couldn\'t stop — restart OBS.', 'UpForge — Recording')
  }
  rec.onRecoveredDuringMatch = () => {
    logActivity('OBS reconnected mid-match — recording continues')
    tray?.setToolTip('UpForge — Recording')
  }
  rec.onObsProcessDiedDuringMatch = () => {
    void finalizeAfterObsProcessDeath?.()
  }
}
const clipExtractor = new ClipExtractor()
const clipStore = new ClipStore()
const captureOwnership = new CaptureOwnership()
let activeCapture: { ownerId: number | null } | null = null
/** Owned OBS sessions by game — orphan labels and game-switch decisions (card 232). */
let recordingSessionLogInstance: RecordingSessionLog | null = null
function recordingSessionLog(): RecordingSessionLog {
  recordingSessionLogInstance ??= new RecordingSessionLog(join(app.getPath('userData'), 'recording-sessions.json'))
  return recordingSessionLogInstance
}
/** Game that owns the current match flow (set on game-started). */
let matchFlowGame: string | null = null
/** Game of the recording UpForge owns right now — detection only, never the selected game tab. */
function currentRecordingOwnerGame(): string | null {
  return recordingOwnerGame({
    sessionGame: recordingSessionLog().activeGame(),
    flowGame: matchFlowGame,
    detectedGame: gameDetector.currentGame(),
  })
}
let replayCaptureOwnerId: number | null = captureOwnership.get()
let localMediaWork = 0
let guestClaimInFlight = false
let guestClaimDeclinedFor: number | null = null
function captureOwnerId(): number | null {
  return activeCapture ? activeCapture.ownerId : captureOwnership.get()
}
const hotkeyManager = new HotkeyManager()
const trainerBridge = new TrainerBridge(() => mainWindow)
let settingsManager: SettingsManager
let warmupStore: ReturnType<typeof fileWarmupStore> | null = null
const warmupState = () => (warmupStore ??= fileWarmupStore(join(app.getPath('userData'), 'warmup-prompt.json')))
/** "Warm up first?" toast when a shooter opens (card 882). Never during a match; once a day per game. */
const warmupPrompt = new WarmupPrompt({
  isEnabled: () => settingsManager?.get()?.warmupPrompt !== false,
  isSignedIn: () => !!authManager?.getToken(),
  currentGame: () => gameDetector.currentGame(),
  isMatchLive: () => matchPriorityDeps().isRecording() || obsRecorder.isRecording(),
  isTrainerRunning: () => trainerBridge.isRunning,
  loadData: (game) => loadWarmupData(game),
  launch: (drill) => launchTrainerDrill({
    scenario: drill.scenario,
    duration_seconds: drill.duration_seconds,
    difficulty: drill.difficulty,
    ...(drill.context ? { context: drill.context } : {}),
    ...(drill.user_drill_id != null ? { user_drill_id: drill.user_drill_id } : {}),
  }),
  // An OS toast: never takes focus from the game, and is dropped while a match records.
  notify: (n) => showAppNotification({ title: n.title, body: n.body, silent: true, actions: n.actions, onAction: n.onAction, onClick: n.onClick }),
  notifyError: (message) => showAppNotification({ title: 'Warm-up', body: message }),
  track: (event, props) => { void trackFunnelEvent(event, props) },
  readState: () => warmupState().read(),
  writeState: (state) => warmupState().write(state),
  log: (msg) => log.info(msg),
})
onTrainerRunFinished(() => warmupPrompt.markRunFinished())
let trackedPrimaryGame: GameId = 'valorant'
const discordRPC = new DiscordRPC(
  () => settingsManager?.get()?.discordRichPresence !== false,
)
const riotLocalApi = new RiotLocalApi()
/** Live Valorant rank from the Riot client (set when IPC handlers are registered). */
let valorantRankService: ValorantRankService | null = null
const lolLiveClientApi = new LoLLiveClientApi()
const authManager = new AuthManager()
/** League local report: Live Client events + 60 s snapshots for the match being tracked. */
const lolLocalCollector = new LolLocalMatchCollector()
lolLiveClientApi.onLiveSnapshot = (data) => lolLocalCollector.ingest(data)
let lolLocalQueue: LolLocalMatchQueue | null = null
function getLolLocalQueue(): LolLocalMatchQueue {
  lolLocalQueue ??= new LolLocalMatchQueue({
    file: join(app.getPath('userData'), 'lol-local-match-pending.json'),
    post: async (payload) => {
      try {
        return await authManager.getApi().post(LOL_LOCAL_MATCH_ENDPOINT, payload)
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status
        throw Object.assign(new Error(`League local match upload failed${status ? ` (HTTP ${status})` : ''}`), { status })
      }
    },
    currentUserId: () => (authManager.isAuthenticated() ? authManager.getUser()?.id ?? null : null),
    log,
  })
  return lolLocalQueue
}
/** After a League match: read the end-of-game stats and send the local report (API flag only). */
function sendLolLocalReport(capture: LolLocalMatchCapture, resolveRecordingId: () => string | null): void {
  void submitLolLocalMatch({
    enabled: () => lolLocalReportsEnabled(authManager.getUser()),
    currentUserId: () => (authManager.isAuthenticated() ? authManager.getUser()?.id ?? null : null),
    readEndOfGame: () => readLolEndOfGame({ findLockfile: () => findLolLockfile(), get: lcuGet }),
    queue: getLolLocalQueue(),
    log,
  }, capture, resolveRecordingId)
    .then(result => log.info('[LolLocalMatch] Report:', result))
    .catch(err => log.warn('[LolLocalMatch] Report failed:', err))
}
// Any sign-out (button or expiry) also ends the embedded website's session and revokes its token.
authManager.onSessionEnded = () => {
  closeWebShell()
  void clearWebShellSession(authManager)
}
/** Set once IPC is ready; queues a focus sync after a match ends. */
let scheduleFocusSyncAfterMatch: (game: string) => void = () => {}

// Set up crash/error reporting now that authManager is available
setupMainProcessErrorHandlers(authManager)
trainerBridge.setAuthManager(authManager)

wireRecorderStatus(obsRecorder, 'OBS')

// When OBS saves a replay buffer clip during a live match, add it to the clip store immediately
obsRecorder.onReplayClipSaved = (clipPath, trigger, meta) => {
  log.info('[Main] OBS replay clip saved during match:', clipPath, trigger)
  const live = riotLocalApi.getLiveMatchContext()
  const momentOffsetMs = meta?.eventTimeSec != null
    ? riotLocalApi.estimateLiveEventVideoOffsetMs(meta.eventTimeSec)
    : null
  const durationSeconds = settingsManager?.get().obsReplayBufferSeconds ?? 30
  const clipStartMs = momentOffsetMs != null
    ? Math.max(0, momentOffsetMs - Math.round(durationSeconds * 1000))
    : null
  const replayGame = currentRecordingOwnerGame()
  const rec = clipStore.forUser(replayCaptureOwnerId).add({
    path: clipPath,
    thumbPath: null,
    trigger: 'kill',
    map: live.map,
    agent: live.agent,
    durationSeconds,
    round: riotLocalApi.getLiveRoundIndex(),
    killCount: 1,
    analysisJobId: null,
    matchId: live.matchId,
    gameMode: live.gameMode,
    weapon: null,
    abilitySlot: null,
    // Replay buffer runs only during a detected match; label by that, never by the game tab.
    game: replayGame ? normalizePrimaryGame(replayGame) : null,
    momentOffsetMs,
    clipStartMs,
  })
  logActivity('OBS kill clip saved')
  mainWindow?.webContents.send('clips:new', [rec.id])
  mainWindow?.webContents.send('obs:replay-saved', { clipId: rec.id, path: clipPath })
}

const performanceManager = new PerformanceManager()
let uploadManager: UploadManager
let recordingsStore: RecordingsStore
const productionVodFixtures = new ProductionVodFixtureLibrary()
let postMatchJobStore: PostMatchJobStore | null = null
let postMatchWorker: PostMatchWorker | null = null
let postMatchQueueUserId: number | null = null

// Set by setupGameDetection — cancel pending match-wait when game quits from lobby
let cancelMatchWait: (() => void) | null = null
let waitingForMatch = false
/** Nested game-started handlers (beginMatchFlow → return). Blocks OBS-connect resume races. */
let matchDetectInFlightDepth = 0

/**
 * When OBS comes back while a game is still tracked as active but we are not
 * recording / waiting, re-emit game-started so match detect runs again.
 */
function maybeResumeMatchDetectionAfterObsConnect(): void {
  const game = gameDetector.currentGame()
  const snapshot = {
    activeGame: game,
    waitingForMatch,
    isActivelyRecording: obsRecorder.isActivelyRecording(),
    matchDetectInFlight: matchDetectInFlightDepth > 0,
    matchOwnedRecording: obsRecorder.isRecording(),
    disconnectedDuringRecording: obsRecorder.hadDisconnectedDuringRecording(),
  }
  if (!shouldResumeMatchDetectionOnObsConnect(snapshot)) return

  log.info(`[OBS] Connected with active ${game} and no recording — scheduling match-detect resume`)
  logActivity('OBS connected — resuming match detection')
  // Defer so callers inside ensureObsReady/connect finish before a nested game-started.
  setImmediate(() => {
    const nextGame = gameDetector.currentGame()
    if (!shouldResumeMatchDetectionOnObsConnect({
      activeGame: nextGame,
      waitingForMatch,
      isActivelyRecording: obsRecorder.isActivelyRecording(),
      matchDetectInFlight: matchDetectInFlightDepth > 0,
      matchOwnedRecording: obsRecorder.isRecording(),
      disconnectedDuringRecording: obsRecorder.hadDisconnectedDuringRecording(),
    })) return
    log.info(`[OBS] Resuming match detection for ${nextGame}`)
    gameDetector.emit('game-started', nextGame as string)
  })
}

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
let pendingRecordingStart: { game: string; controller: AbortController } | null = null
/** Prevents parallel CS2/Deadlock re-watch loops after a process restart. */
let rearmWatchInFlight: string | null = null
/** Serializes handleMatchEnd — prevents double upload/post-game from concurrent end signals. */
let matchFinalizeInFlight: Promise<boolean> | null = null
// Overlay polling timer — cleared when match ends or game stops
let overlayPollTimer: ReturnType<typeof setInterval> | null = null
/** Cached Shipping.exe status — tasklist is expensive; see VALORANT_IN_MATCH_PROCESS_CHECK_MS. */
let cachedShippingProcessUp = true
let lastShippingProcessCheckAt = 0
let gsiPollTimer: ReturnType<typeof setInterval> | null = null

let lastReplayRetryContext: ReplayRetryContext | null = null

/** Recording ids with an active S3 upload in this process — excludes them from stale-upload reset. */
const activeUploadRecordingIds = new Set<string>()
const startupFailuresSeen = () => fileSeenStore(join(app.getPath('userData'), 'startup-failures-notified.json'))
/** One summary toast for failures found right after start (see startup-failure-summary.ts). */
const startupFailures = new StartupFailureSummary({
  notify: ({ title, body }) => showAppNotification({ title, body, silent: notifySilent(), deferWhileRecording: true, onClick: () => focusMainWindow() }),
  logActivity: (msg) => logActivity(msg),
  loadSeen: () => startupFailuresSeen().load(),
  saveSeen: (ids) => startupFailuresSeen().save(ids),
})
const analysisPipelineSingleFlight = new RecordingPipelineSingleFlight<string | null>()

function reconcileInterruptedUploads(): void {
  if (!recordingsStore) return
  const reset = recordingsStore.resetInterruptedUploads(activeUploadRecordingIds,
    (id) => startupFailures.note({ key: `upload:${id}`, kind: 'upload' }))
  if (reset > 0) {
    logActivity(`Upload interrupted — tap Analyse to retry (${reset} recording${reset === 1 ? '' : 's'})`)
    notifyRecordingsUpdated()
  }
}

function matchPriorityDeps() {
  // Hold while a confirmed match needs the GPU (matchCapturePriority), or while OBS
  // is actively recording. Do NOT hold merely because Valorant is open in menus.
  return {
    isRecording: () => backgroundMatchState.active || matchCapturePriority || obsRecorder.isActivelyRecording(),
  }
}

function deferredUploadQueueFile(): string | null {
  const userId = getActiveUserId()
  return userId == null ? null : getDeferredUploadQueuePath(userDataRoot(userId))
}

function persistDeferredUpload(recordingId: string): void {
  const queueFile = deferredUploadQueueFile()
  if (!queueFile) return
  try {
    addDeferredUploadId(queueFile, recordingId)
  } catch (err) {
    log.warn('[DeferredUpload] Failed to persist defer id', recordingId, err)
  }
}

function unpersistDeferredUpload(recordingId: string): void {
  const queueFile = deferredUploadQueueFile()
  if (!queueFile) return
  try {
    removeDeferredUploadId(queueFile, recordingId)
  } catch (err) {
    log.warn('[DeferredUpload] Failed to remove defer id', recordingId, err)
  }
}

function registerDeferredUploadRetryPersisted(
  recordingId: string,
  run: () => Promise<void>,
): void {
  persistDeferredUpload(recordingId)
  registerDeferredUploadRetry(recordingId, run)
}

function clearDeferredUploadRetryPersisted(recordingId: string): void {
  clearDeferredUploadRetry(recordingId)
  unpersistDeferredUpload(recordingId)
}

function restoreDeferredUploadsFromDisk(): void {
  const queueFile = deferredUploadQueueFile()
  if (!queueFile || !postMatchJobStore || !postMatchWorker) return
  const ownerUserId = getActiveUserId()
  if (ownerUserId == null) return
  const ids = readDeferredUploadIds(queueFile)
  for (const recordingId of ids) {
    const existingJob = postMatchJobStore.get(recordingId)
    if (existingJob?.ownerUserId === ownerUserId) {
      unpersistDeferredUpload(recordingId)
      continue
    }
    const rec = recordingsStore.getById(recordingId)
    if (!rec || rec.analysed || rec.pipelineStatus === 'analysing') {
      unpersistDeferredUpload(recordingId)
      continue
    }
    if (!fs.existsSync(rec.path)) {
      unpersistDeferredUpload(recordingId)
      continue
    }
    const now = Date.now()
    postMatchJobStore.upsert({
      id: recordingId,
      ownerUserId,
      requestKind: 'automatic',
      recordingId,
      videoPath: rec.path,
      game: rec.game,
      matchCorrelationId: activeMatchTelemetry?.correlationId ?? null,
      stage: 'queued',
      attempts: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      riotName: rec.riotName,
      riotTag: rec.riotTag,
      map: rec.map,
      agent: rec.agent,
    })
    unpersistDeferredUpload(recordingId)
  }
  if (ids.length) {
    log.info('[DeferredUpload] Migrated', ids.length, 'deferred upload id(s) into post-match job store')
  }
  postMatchWorker.kick()
}

function enqueuePostMatchAnalyse(args: {
  recordingId: string
  videoPath: string
  riotName: string
  riotTag: string
  game: string
  map: string | null
  agent: string | null
  matchCorrelationId?: string | null
  requestKind?: 'automatic' | 'manual'
}): void {
  const ownerUserId = getActiveUserId()
  if (ownerUserId == null || !postMatchWorker) {
    log.warn('[PostMatchWorker] Refused enqueue without an active authenticated user')
    return
  }
  const now = Date.now()
  const job: PostMatchJob = {
    id: args.recordingId,
    ownerUserId,
    requestKind: args.requestKind ?? 'automatic',
    recordingId: args.recordingId,
    videoPath: args.videoPath,
    game: args.game,
    matchCorrelationId: args.matchCorrelationId ?? activeMatchTelemetry?.correlationId ?? null,
    stage: 'queued',
    attempts: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    riotName: args.riotName,
    riotTag: args.riotTag,
    map: args.map,
    agent: args.agent,
  }
  postMatchWorker.enqueue(job)
  logActivity(POST_MATCH_COPY.queuedUntilNotInMatch)
}

/**
 * Deadlock queue per lobby match (owner decision 16 Nov: only Ranked is analysed automatically).
 * The hero/queue lookup after a match is shared with the automatic upload paths below.
 */
const deadlockQueueLookups = new DeadlockQueueLookups()
const deadlockManualOnlyLogged = new Set<string>()

function lookupDeadlockQueue(matchId: number): Promise<string | null> {
  return deadlockQueueLookups.queueFor(matchId, () =>
    resolveDeadlockRecordingMatch(matchId, { fetchMatch: (id) => authManager.fetchDeadlockMatch(id) })
      .then((resolved) => resolved?.mode ?? null))
}

/** Waits for the match queue; false (and one activity line) for Standard / Street Brawl and other non-ranked queues. */
async function deadlockAutoUploadGate(matchId: number | null): Promise<{ allowed: boolean; queue: string | null }> {
  if (!matchId) return { allowed: true, queue: null }
  const mode = await lookupDeadlockQueue(matchId)
  if (deadlockAllowsAutoAnalyse(mode)) return { allowed: true, queue: deadlockApiQueue(mode) }
  if (!deadlockManualOnlyLogged.has(String(matchId))) {
    deadlockManualOnlyLogged.add(String(matchId))
    logActivity(deadlockManualOnlyActivity(mode), 'deadlock')
  }
  return { allowed: false, queue: deadlockApiQueue(mode) }
}

/** A non-ranked Deadlock match keeps its recording for a manual Analyse; its automatic job is dropped. */
function dropAutomaticDeadlockJobs(matchId: string, mode: string | null): void {
  if (!postMatchJobStore) return
  let dropped = 0
  for (const job of postMatchJobStore.list()) {
    if (job.requestKind === 'manual' || job.game !== 'deadlock') continue
    const rec = recordingsStore.getById(job.recordingId)
    if (rec?.matchId !== matchId) continue
    postMatchJobStore.remove(job.id)
    dropped++
  }
  if (dropped && !deadlockManualOnlyLogged.has(matchId)) {
    deadlockManualOnlyLogged.add(matchId)
    logActivity(deadlockManualOnlyActivity(mode), 'deadlock')
  }
  if (dropped) notifyRecordingsUpdated()
}

/** An automatic Deadlock job waits while its match queue is still being looked up. */
function deadlockQueuePending(rec: { game?: string | null; gameMode?: string | null; matchId?: string | null }): boolean {
  return rec.game === 'deadlock'
    && deadlockAutoAnalyseDecision(rec.gameMode) === 'unknown'
    && deadlockQueueLookups.isPending(rec.matchId)
}

/** When auto-analyse is on and Riot stats flip to ready, start the upload job (unless in a match). */
function maybeAutoEnqueueWhenReady(recordingId: string): void {
  if (settingsManager?.get().autoAnalyse === false) return
  if (matchCapturePriority || obsRecorder.isActivelyRecording()) return
  if (!authManager.isAuthenticated()) return
  const rec = recordingsStore.getById(recordingId)
  if (!rec || rec.analysed || rec.clipsOnly) return
  if (!canAutoEnqueueRecording(rec)) return
  if (rec.pipelineStatus === 'uploading' || rec.pipelineStatus === 'analysing') return
  if (!getAnalysisReadiness(rec).ready) return
  const job = postMatchJobStore?.get(recordingId)
  if (
    job
    && (job.stage === 'queued'
      || job.stage === 'upload'
      || job.stage === 'deferred'
      || job.stage === 'remux'
      || job.stage === 'duels'
      || job.stage === 'complete_api'
      || job.stage === 'polling')
  ) {
    postMatchWorker?.kick()
    return
  }
  const user = authManager.getUser()
  logActivity(matchDataReadyStartingUpload(rec.game))
  showAppNotification({
    title: 'Starting analysis',
    body: 'Match stats are ready — uploading your recording now.',
    silent: notifySilent(),
  })
  enqueuePostMatchAnalyse({
    recordingId: rec.id,
    videoPath: rec.path,
    ...resolveUploadPlayerIdentity(rec.game, rec.timeline, user, rec),
    game: rec.game,
    map: rec.map,
    agent: rec.agent,
  })
}

function maybeAutoEnqueueReadyPendings(): void {
  if (!recordingsStore) return
  if (settingsManager?.get().autoAnalyse === false) return
  if (matchCapturePriority || obsRecorder.isActivelyRecording()) return
  for (const rec of recordingsStore.getPending(linkedRiotFromAuth())) {
    if (getAnalysisReadiness(rec).ready) maybeAutoEnqueueWhenReady(rec.id)
  }
}

function initPostMatchWorker(userId: number): void {
  if (postMatchQueueUserId === userId && postMatchJobStore && postMatchWorker) return
  if (postMatchQueueUserId != null && postMatchQueueUserId !== userId) {
    backgroundWork.cancel()
    uploadManager.abort()
    abortVodCompression()
  }
  postMatchQueueUserId = userId
  postMatchJobStore = new PostMatchJobStore(getPostMatchJobStorePath(userDataRoot(userId)))
  postMatchWorker = new PostMatchWorker({
    store: postMatchJobStore,
    isRecording: () => matchPriorityDeps().isRecording(),
    isJobReady: (job) => {
      const rec = recordingsStore.getById(job.recordingId)
      return rec != null && getAnalysisReadiness(rec).ready
    },
    // Missing ownership or request origin is never inferred for legacy jobs.
    // Automatic jobs also require capture-time intent and the current toggle.
    canRunJob: (job) => {
      if (job.ownerUserId !== getActiveUserId()) return false
      const rec = recordingsStore.getById(job.recordingId)
      if (!rec) return false
      if (job.requestKind === 'manual') return rec.manualAnalyseRequested === true
      return settingsManager?.get().autoAnalyse === true && canAutoEnqueueRecording(rec) && !deadlockQueuePending(rec)
    },
    log: (msg) => log.info('[PostMatchWorker]', msg),
    runJob: async (job) => {
      activeMatchTelemetry?.startSector('upload')
      const matchingPostGameWindow = postGameWindow
        && !postGameWindow.isDestroyed()
        && isPostGameSessionForRecording(job.recordingId, job.ownerUserId)
        ? postGameWindow
        : null
      const win = matchingPostGameWindow
        ?? (mainWindow && !mainWindow.isDestroyed() ? mainWindow : createPostGameWindow())
      const rec = recordingsStore.getById(job.recordingId)
      try {
        const result = await doUploadAndAnalyse(
          job.recordingId,
          job.videoPath,
          job.riotName || rec?.riotName || '',
          job.riotTag || rec?.riotTag || '',
          job.game,
          job.map ?? rec?.map ?? null,
          job.agent ?? rec?.agent ?? null,
          rec?.timeline ?? null,
          win,
        )
        if (!result) {
          const current = recordingsStore.getById(job.recordingId)
          if (current?.pipelineDeferReason === 'recording') {
            throw new PostMatchDeferredError('upload aborted: match capture')
          }
          throw new Error(current?.lastAnalysisError || 'post-match pipeline did not complete')
        }
        activeMatchTelemetry?.endSector('upload')
      } catch (err) {
        activeMatchTelemetry?.endSector('upload')
        const msg = err instanceof Error ? err.message : String(err)
        if (/upload aborted/i.test(msg)) {
          activeMatchTelemetry?.setDnf('upload_abort', msg)
        }
        throw err
      }
    },
  })
}

function maybeResumeDeferredUploads(): void {
  void obsRecorder.releaseStaleMatchOwnership().then((released) => {
    if (released) {
      log.info('[MatchPriority] Cleared stale OBS ownership before resume check')
    }
    if (!shouldDeferHeavyBackgroundWork(matchPriorityDeps())) {
      for (const recordingId of activeUploadRecordingIds) recordingsStore.clearPipelineDeferReason(recordingId)
      notifyRecordingsUpdated()
      void flushDeferredUploadRetries()
      maybeAutoEnqueueReadyPendings()
      postMatchWorker?.kick()
    }
  })
}

function interruptBackgroundWorkForMatch(): void {
  // Interrupt the actual operations, keeping their promises alive for automatic resume.
  backgroundWork.pause()
  const interruptedCount = activeUploadRecordingIds.size
  for (const recordingId of activeUploadRecordingIds) {
    recordingsStore.setPipelineDeferReason(recordingId, 'recording')
  }
  notifyRecordingsUpdated()
  const workerBusy = postMatchWorker?.isBusy() === true
  const queuedJobs = postMatchJobStore?.list().some(
    (j) => j.stage === 'queued' || j.stage === 'upload' || j.stage === 'deferred' || j.stage === 'remux',
  ) ?? false
  if (interruptedCount > 0 || workerBusy || queuedJobs) {
    logActivity(POST_MATCH_COPY.pausedUntilGameEnds)
    const pg = postGameWindow
    const modalSession = getPostGameSessionSnapshot()
    const modalRecordingId = modalSession?.recordingId
    if (
      pg
      && !pg.isDestroyed()
      && modalRecordingId
      && (modalSession.phase === 'uploading' || modalSession.phase === 'analysing')
    ) {
      sendPostGameEventForRecording(
        pg,
        modalRecordingId,
        'post-game:upload-deferred',
        { reason: 'recording' },
        getActiveUserId(),
      )
    }
  }
  // The reason reaches the player ("Closed the trainer because your match started").
  trainerBridge.kill('match_started')
}

function abortBackgroundWorkOnGameStart(game: string): void {
  backgroundWork.pause()
  // A drill started while this game was already open (e.g. from the warm-up offer) stays open when the
  // match watch re-arms; a match starting still closes it (interruptBackgroundWorkForMatch).
  if (shouldCloseTrainerOnGameStart({ trainerRunning: trainerBridge.isRunning, launchedWhileGameOpen: trainerLaunchedWhileGameOpen(), game })) {
    trainerBridge.kill('game_started')
  }
}

function beginMatchPerformanceMode(opts?: { holdPostMatch?: boolean }): void {
  if (!matchPerformanceModeActive) {
    matchPerformanceModeActive = true
  }
  if (opts?.holdPostMatch) {
    backgroundMatchState.observe(true)
    matchCapturePriority = true
    interruptBackgroundWorkForMatch()
  }
  stopCoachNotificationPoller()
}

function endMatchPerformanceMode(): void {
  const wasHolding = matchCapturePriority
  matchCapturePriority = false
  matchPerformanceModeActive = false
  if (wasHolding) {
    const hasDeferredJobs = postMatchJobStore?.list().some(
      (j) => j.stage === 'queued' || j.stage === 'deferred' || j.stage === 'failed',
    ) ?? false
    const hasDeferredUploads = activeUploadRecordingIds.size > 0
      || (recordingsStore?.getPending(linkedRiotFromAuth()).some((r) => r.pipelineDeferReason === 'recording') ?? false)
    if (hasDeferredJobs || hasDeferredUploads) {
      logActivity(POST_MATCH_COPY.readyToResume)
    }
  }
  maybeResumeDeferredUploads()
  resumeDeferredUpdateWork()
  refreshCoachNotificationPoller()
}



// Activity log — recent events shown on dashboard for user visibility
const MAX_LOG_ENTRIES = 30
const activityLog: { time: number; message: string; game?: string }[] = []
/** Persisted support history — in memory, flushed async on a 5 s throttle + sync on quit. */
const supportActivity = createSupportActivityStore()

// Hotkey bookmarks — timestamps (ms) relative to recording start pressed during a match
const hotkeyBookmarks: number[] = []
// Recording start time — set when recorder.start() succeeds
let currentRecordingStartTime: number | null = null
/** GSI match-live timestamp (CS2 / Deadlock) — when map_phase went live */
let currentMatchStartTime: number | null = null
let currentGsiMapName: string | null = null
/** Mode seen when the current capture started (CS2 GSI map.mode, Valorant presence…). Kept for match end. */
let currentMatchGameMode: string | null = null
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
  game: string
  matchId: string | null
  map: string | null
  agent: string | null
  gameMode: string
  recordingDuration: number
  fileSizeMb: number
  killsInTimeline: number
  clipsExtracted: number
  matchDetailsStatus: 'fetched' | 'no_match_id' | 'no_region' | 'no_auth' | 'fetch_failed' | 'pending'
  lolEnrichStatus?: 'fetched' | 'fetch_failed' | 'no_match_id' | 'no_auth' | null
  queueId?: string | null
  correlationId: string | null
  sectorsMs: Partial<Record<SectorName, number>>
  dnf: string | null
  endReason: string | null
  pathFallback: boolean
  machineBucket: string | null
  obsSkippedFrames: number | null
  audioTracks: number | null
  outputMode: string | null
  checksumPrefix: string | null
}
let lastMatchDiagnostic: LastMatchDiagnostic | null = null
let activeMatchTelemetry: MatchTelemetrySession | null = null
let stopActiveObsStatsSampler: (() => void) | null = null

function stopObsStatsSampling(): void {
  stopActiveObsStatsSampler?.()
  stopActiveObsStatsSampler = null
}

function emitActiveOpsLap(): void {
  const session = activeMatchTelemetry
  if (!session || session.hasEmittedLap()) return
  session.markLapEmitted()
  stopObsStatsSampling()
  try {
    trackOpsRecordingLap(session.snapshot() as unknown as Record<string, unknown>)
  } catch (err) {
    log.warn('[OpsTelemetry] Failed to emit lap', err)
  }
}

function beginMatchTelemetry(game: string): MatchTelemetrySession {
  stopObsStatsSampling()
  const settings = settingsManager?.get()
  const profile = collectMachineProfile({
    appVersion: APP_VERSION,
    obsVersion: obsRecorder.getObsStudioVersion(),
    encoder: settings?.cachedEncoder ?? null,
  })
  const session = new MatchTelemetrySession(game, {
    bucket: profile.bucket,
    encoder: profile.encoder,
    obsVersion: profile.obsVersion,
    appVersion: profile.appVersion,
  })
  activeMatchTelemetry = session
  return session
}

const FAILURE_NOTIFY_COOLDOWN_MS = 5 * 60 * 1000
const recentFailureNotifications = new Map<string, number>()

let lastActivityToast = { message: '', at: 0 }

function abortInFlightAnalysisForRecording(recordingId: string): { ok: boolean; error?: string } {
  const result = abortInFlightAnalysis(
    { recordingsStore, uploadManager, activeUploadRecordingIds },
    recordingId,
  )
  if (result.ok) {
    notifyRecordingsUpdated()
    sendPostGameEventForRecording(
      postGameWindow,
      recordingId,
      'post-game:analysis-deferred',
      { reason: 'server' },
      getActiveUserId(),
    )
    const rec = recordingsStore.getById(recordingId)
    tray?.setToolTip(idleTooltip(rec?.game ?? 'valorant'))
    logActivity('Stopped waiting on upload/analysis — you can record again')
  }
  return result
}

function logActivity(message: string, explicitGame?: string): void {
  const entry = {
    time: Date.now(),
    message,
    game: explicitGame ?? gameDetector.currentGame() ?? undefined,
  }
  log.info('[Activity]', entry.game ?? 'app', message)
  activityLog.push(entry)
  supportActivity.append(localMediaRoot(getActiveUserId()), entry)
  recordErrorActivity(message, entry.time)
  if (activityLog.length > MAX_LOG_ENTRIES) activityLog.shift()
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Only the new entry — the renderer appends (full list via app:get-activity-log on load).
    mainWindow.webContents.send('app:activity-entry', entry)
  }
  const lower = message.toLowerCase()
  if (
    lower.includes('analysis ready')
    || lower.includes('analysis failed')
    || lower.includes('upload paused')
    || lower.includes('upload continues')
    || lower.includes('saved to cloud')
    || lower.includes('coaching ready')
    || lower.includes('gotv demos come from steam')
    || lower.includes('replay data syncs separately')
    || lower.includes('paused until you finish')
    || lower.includes('ready to resume any paused')
    || lower.includes('resuming paused')
    || lower.includes('waiting for') && lower.includes('match stats')
    || lower.includes('match stats ready')
    || lower.includes('demo / match stats')
    || lower.includes('auto-analyse is off')
  ) {
    const now = Date.now()
    if (message !== lastActivityToast.message || now - lastActivityToast.at > FAILURE_NOTIFY_COOLDOWN_MS) {
      lastActivityToast = { message, at: now }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app:activity-toast', { message })
      }
    }
  }
}

/** Auto-capture Node DNS evidence when Riot/upload networking fails (cooldown). */
let lastNetworkEvidenceAt = 0
const NETWORK_EVIDENCE_COOLDOWN_MS = 3 * 60_000

async function captureNetworkEvidence(trigger: string, force = false): Promise<void> {
  const now = Date.now()
  if (!force && now - lastNetworkEvidenceAt < NETWORK_EVIDENCE_COOLDOWN_MS) return
  lastNetworkEvidenceAt = now
  try {
    const riotDiag = riotLocalApi.getDiagnostics()
    const snapshot = await runNetworkDiagnostics({
      trigger,
      region: riotDiag.region,
      apiBase: getApiBaseUrl(),
      lastRiotMatchDetails: riotLocalApi.getLastMatchDetailsFetch(),
      lastUploadError: getLastUploadNetworkError(),
    })
    logActivity(`Network check: ${formatNetworkProbeSummary(snapshot)}`)
  } catch (err) {
    logActivity(`Network check failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function maybeCaptureRiotDnsEvidence(): void {
  const last = riotLocalApi.getLastMatchDetailsFetch()
  if (!last?.error || !isLikelyNetworkFailure(last.error)) return
  void captureNetworkEvidence('riot-match-details')
}

/** In-app dashboard toast only — no OS notification. */
function notifyDashboardToast(message: string): void {
  logActivity(message)
}

/** Dashboard banner + optional OS notification for recording outcomes. */
/** Keep why a match was not recorded until the player dismisses it on Home — the toast is easy to miss in-game. */
function rememberSkippedMatch(game: string, message: string): void {
  const lastSkippedMatch = { game, message, at: Date.now() }
  try { settingsManager?.save({ lastSkippedMatch }) } catch (err) { log.warn('[Recorder] could not save skipped-match notice:', err) }
  mainWindow?.webContents.send('recording:match-skipped', lastSkippedMatch)
}

function notifyRecordingUx(message: string, notificationTitle = 'UpForge — Recording'): void {
  mainWindow?.webContents.send('app:warning', { message })
  showAppNotification({
    title: notificationTitle,
    body: message,
    silent: true,
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
      clearErrorActivity()
      mainWindow?.webContents.send('app:activity-log', [])
      notifyRecordingsUpdated()
      mainWindow?.webContents.send('clips:updated')
      mainWindow?.webContents.send('dashboard:refresh')
      const config = settingsManager?.get()
      if (config) {
        void obsRecorder.applyRecordingSettings(
          buildRecorderConfig(config, hasProAccess(authManager.getUser()), captureOwnerId()),
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
    const moments = duelMomentsForUpload(timeline)
    if (moments.length) timeline.duelMoments = moments
  }
}

function schedulePopulationRefresh(timeline: MatchData): void {
  if (!timeline.spatialSummary?.events?.length) return
  const token = authManager.getToken()
  void refreshMatchPopulationBenchmarks(
    timeline,
    token ? authManager.getApi() : null,
    (summary) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('spatial:population-updated', summary)
      }
      if (postGameWindow && !postGameWindow.isDestroyed()) {
        postGameWindow.webContents.send('spatial:population-updated', summary)
      }
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

function syncPrimaryGameFromUser(): void {
  return mainSession.syncPrimaryGameFromUser()
}

function syncPrimaryGameFromDetection(game: string): void {
  return mainSession.syncPrimaryGameFromDetection(game)
}

function handlePrimaryGameSwitch(
  game: GameId,
  previousGame?: GameId,
): void {
  return mainSession.handlePrimaryGameSwitch(game, previousGame)
}

/**
 * Startup and game detection both ask for capture setup; two overlapping retry loops retargeted OBS
 * twice every 3 s ("Capture retargeted" pairs in the log). Share one run per game.
 */
const obsCaptureSetupInFlight = new Map<string, Promise<void>>()
function ensureObsCaptureForGame(game: string): Promise<void> {
  const running = obsCaptureSetupInFlight.get(game)
  if (running) return running
  const run = ensureObsCaptureForGameOnce(game).finally(() => {
    if (obsCaptureSetupInFlight.get(game) === run) obsCaptureSetupInFlight.delete(game)
  })
  obsCaptureSetupInFlight.set(game, run)
  return run
}

async function ensureObsCaptureForGameOnce(game: string): Promise<void> {
  if (obsRecorder.isRecording()) return

  if (!obsRecorder.isConnected()) {
    await ensureObsReady({ allowProcessRestart: true })
  }
  if (!obsRecorder.isConnected()) return

  const needsLiveWindow = gameNeedsLiveMatchWindow(game)
  const processRunning =
    gameDetector.currentGame() === game || await gameDetector.isGameProcessRunning(game)

  const result = await obsRecorder.retargetCaptureWithRetry(game, {
    maxAttempts: processRunning ? 12 : needsLiveWindow ? 6 : 1,
    intervalMs: 2000,
  })

  if (result.ok) {
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
    logActivity(`${gameLabel(game)} detected — OBS window capture setup failed. Borderless windowed mode usually fixes this.`)
    mainWindow?.webContents.send('app:warning', {
      message: `${gameLabel(game)} is running but OBS could not lock onto the game window. Use borderless windowed mode, then reconnect OBS in Settings → Recording if capture stays black.`,
      actionLabel: 'Recording settings',
      actionRoute: '/settings?tab=recording',
    })
  }
}

function onSettingsSaved(settings: ReturnType<SettingsManager['get']>): void {
  return mainSession.onSettingsSaved(settings)
}

function syncUserSessionFromAuth(): void {
  return mainSession.syncUserSessionFromAuth()
}

const recordingFileFinalizer = createRecordingFileFinalizer({
  owner: () => getActiveUserId(),
  rows: () => recordingsStore?.getPending() ?? [],
  canWork: () => Boolean(recordingsStore) && localMediaWork === 0 && !obsRecorder.isRecording() && !backgroundWork.blocked,
  stat: (filePath) => fs.promises.stat(filePath),
  probe: (filePath) => clipExtractor.probe(filePath),
  complete: async (id, owner) => {
    const store = recordingsStore.forUser(owner)
    store.markFileFinalized(id)
    await store.flush()
    if (getActiveUserId() !== owner) return
    const recording = store.getById(id)
    if (recording) await refreshRecordingVodProbe(recording)
    if (getActiveUserId() !== owner) return
    notifyRecordingsUpdated()
    resumeSavedLocalMedia()
  },
})

function resumeSavedLocalMedia(): void {
  return mainSession.resumeSavedLocalMedia()
}

async function offerGuestMediaClaim(): Promise<void> {
  return mainSession.offerGuestMediaClaim()
}

function clearPostMatchQueueScope(): void {
  return mainSession.clearPostMatchQueueScope()
}

function clearAccountScopedRuntimeState(): void {
  return mainSession.clearAccountScopedRuntimeState()
}

function rowLocalExpiresAt(rec: PendingRecording): number | null {
  return mainSession.rowLocalExpiresAt(rec)
}

function runStorageMaintenanceIfReady(notify = false): void {
  return mainSession.runStorageMaintenanceIfReady(notify)
}

function enforceRecordingPresetAccess(): void {
  return mainSession.enforceRecordingPresetAccess()
}

function recordingSavePath(): string {
  return mainSession.recordingSavePath()
}

function linkedRiotAccountsFromAuth(): Array<{ name: string; tag: string; isMain: boolean }> {
  return mainSession.linkedRiotAccountsFromAuth()
}

let lolAccountsFetchedAt = 0

function linkedLolAccountsFromAuth(): Array<{ name: string; tag: string; isMain: boolean }> {
  return mainSession.linkedLolAccountsFromAuth()
}

function linkedRiotFromAuth() {
  return mainSession.linkedRiotFromAuth()
}

function scanForOrphanedRecordings(force = false, opts: { fromMatchEnd?: boolean } = {}): number {
  return mainSession.scanForOrphanedRecordings(force, opts)
}

function isLegacyBareValorantOrphan(rec: PendingRecording): boolean {
  return mainSession.isLegacyBareValorantOrphan(rec)
}

function prepareLegacyOrphanRecoveryRows(): void {
  return mainSession.prepareLegacyOrphanRecoveryRows()
}

/** Set by setupGameDetection — ends the active match (upload/post-game) when user clicks Stop. */
let manualEndMatchRecording: ((game: string) => Promise<{ ok: boolean; reason?: string }>) | null = null

function notifySilent(): boolean {
  // Automated notifications are always silent. The notificationSound setting
  // applies only to deliberate F8/F9 feedback beeps.
  return true
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
  return mainAnalysisNotifications.dispatchReconciledAnalysisReady(ctx)
}

function logAnalysisFailureActivity(rawError: string, diagnostics: DuelFailureDiagnostics | null): void {
  return mainAnalysisNotifications.logAnalysisFailureActivity(rawError, diagnostics)
}

function extractFailureDiagnostics(status?: AnalysisPollStatus | null): DuelFailureDiagnostics | null {
  return mainAnalysisNotifications.extractFailureDiagnostics(status)
}

function titleForActivationCode(code: string, fallback: string): string {
  return mainAnalysisNotifications.titleForActivationCode(code, fallback)
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
    preparationDiagnostics?: RecordingPreparationError['diagnostics']
  } = {},
): AnalysisErrorPayload {
  return mainAnalysisNotifications.dispatchAnalysisFailure(rawError, opts)
}

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
    game?: string
    preparationDiagnostics?: RecordingPreparationError['diagnostics']
  } = {},
): AnalysisErrorPayload {
  return mainAnalysisNotifications.sendUploadFailure(rawError, opts)
}

function readyAnalysesFile(): string | null {
  return mainAnalysisNotifications.readyAnalysesFile()
}

function readyAnalysesList(): ReadyAnalysis[] {
  return mainAnalysisNotifications.readyAnalysesList()
}

function saveReadyAnalyses(list: ReadyAnalysis[]): void {
  return mainAnalysisNotifications.saveReadyAnalyses(list)
}

function notifyCoachingReady(
  body: string,
  analysisId?: number | null,
  ready?: { game: string; label: string; map?: string | null },
): void {
  return mainAnalysisNotifications.notifyCoachingReady(body, analysisId, ready)
}

function runStuckAnalysisReconcile(): Promise<number> {
  return mainAnalysisNotifications.runStuckAnalysisReconcile()
}

function startStuckAnalysisReconciler(): void {
  return mainAnalysisNotifications.startStuckAnalysisReconciler()
}

function stopStuckAnalysisReconciler(): void {
  return mainAnalysisNotifications.stopStuckAnalysisReconciler()
}

interface LocalClipContext {
  recordingStartTime: number | null
  bookmarks: number[]
}

function clipPipelineForOwner(ownerId: number | null, context: LocalClipContext): ClipPipeline {
  return new ClipPipeline({
    clipStore: clipStore.forUser(ownerId),
    clipExtractor,
    hotkeyBookmarks: context.bookmarks,
    getRecordingStartTime: () => context.recordingStartTime,
    getClipCapture: () => settingsManager?.get().clipCapture ?? DEFAULT_CLIP_CAPTURE,
    logActivity: (msg) => logActivity(msg),
    notifySilent: () => notifySilent(),
    notifyMainWindow: (channel, data) => mainWindow?.webContents.send(channel, data),
    onClipsExtracted: (count) => {
      if (lastMatchDiagnostic) lastMatchDiagnostic.clipsExtracted = (lastMatchDiagnostic.clipsExtracted ?? 0) + count
    },
  })
}

async function extractKillClipsOnly(
  videoPath: string,
  timeline: MatchData,
  analysisJobId: string | null,
  game: string = trackedPrimaryGame,
): Promise<void> {
  return clipPipelineForOwner(getActiveUserId(), { recordingStartTime: null, bookmarks: [] }).extractKillClipsOnly(videoPath, timeline, analysisJobId, normalizePrimaryGame(game))
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
  ownerId: number | null = getActiveUserId(),
  context?: LocalClipContext,
): Promise<void> {
  localMediaWork++
  const captureStore = recordingsStore.forUser(ownerId)
  const recording = captureStore.getAll().find(item => item.path === videoPath)
  if (!context) {
    context = recording
      ? { recordingStartTime: recording.captureRecordingStartTime ?? null, bookmarks: recording.pendingClipBookmarks?.slice() ?? [] }
      : { recordingStartTime: currentRecordingStartTime, bookmarks: hotkeyBookmarks.splice(0) }
  }
  const pipeline = clipPipelineForOwner(ownerId, context)
  try {
    await waitUntilBackgroundWorkAllowed(matchPriorityDeps(), { logActivity })
    const complete = await pipeline.extractMatchClips(videoPath, timeline, analysisJobId, normalizePrimaryGame(game))
    if (complete && recording) captureStore.clearPendingClipBookmarks(recording.id)
  } finally {
    localMediaWork--
    void offerGuestMediaClaim()
  }
}

// Serialize replay work: Steam permits one coordinator lookup at a time.
let replayScope = 0
let replayWork: Promise<unknown> = Promise.resolve()
const replayAttempts = new Map<string, Promise<boolean>>()
const cs2DemoRetrieval = new Cs2DemoRetrieval({
  getRecording: (id) => {
    const rec = recordingsStore.getById(id)
    return rec?.game === 'cs2'
      ? { recordedAt: rec.recordedAt, complete: !!rec.analysed || hasDemoKillRows(rec.timeline) }
      : null
  },
  retrieve: (id) => refreshReplayTimelineForRecording(id, { notifyActivity: true }),
  deferred: () => shouldDeferHeavyBackgroundWork(matchPriorityDeps()),
  changed: (id) => {
    const rec = recordingsStore.getById(id)
    if (rec) sendAnalysisReadinessUpdate(id, postGameWindow, getAnalysisReadiness(rec))
  },
  ready: (id) => {
    const rec = recordingsStore.getById(id)
    const scope = replayScope
    if (rec) void refreshRecordingVodProbe(rec).then(() => {
      if (scope !== replayScope || recordingsStore.getById(id) !== rec) return
      sendAnalysisReadinessUpdate(id, postGameWindow, getAnalysisReadiness(rec))
      maybeAutoEnqueueWhenReady(id)
    }).catch(err => log.warn('[Replay] VOD readiness:', err))
  },
})

async function fetchDeadlockReviewStatus(jobId: string) {
  return mainReplay.fetchDeadlockReviewStatus(jobId)
}

async function fetchDeadlockReviewDetail(jobId: string): Promise<ReviewDetail | null> {
  return mainReplay.fetchDeadlockReviewDetail(jobId)
}
const deadlockReviewPolls = new Set<string>()

function deadlockReviewDeps(): PollReviewDeps {
  return mainReplay.deadlockReviewDeps()
}

function watchDeadlockReview(recordingId: string): void {
  return mainReplay.watchDeadlockReview(recordingId)
}

function refreshReplayTimelineForRecording(
  recordingId: string,
  options?: { notifyActivity?: boolean },
): Promise<boolean> {
  return mainReplay.refreshReplayTimelineForRecording(recordingId, options)
}

/** Deadlock replay download failures already shown in the activity feed (recordingId:message). */
const deadlockReplayFailureNotices = new Set<string>()

async function retrieveReplayTimelineForRecording(
  recordingId: string,
  options: { notifyActivity?: boolean } | undefined,
  scope: number,
): Promise<boolean> {
  return mainReplay.retrieveReplayTimelineForRecording(recordingId, options, scope)
}

async function retryDemoClips(opts: {
  game: 'cs2' | 'deadlock'
  readyPath: string
  savedRecordingId: string
  timeline: MatchData | null
  matchSessionStart: number
  analysisJobId: string | null
}): Promise<void> {
  return mainReplay.retryDemoClips(opts)
}

async function retryCs2DemoClips(opts: {
  readyPath: string
  savedRecordingId: string
  timeline: MatchData | null
  matchSessionStart: number
  analysisJobId: string | null
}): Promise<void> {
  return mainReplay.retryCs2DemoClips(opts)
}

function countSessionClips(
  timeline: MatchData | null,
  agent: string | null,
  sessionStart: number,
  ownerId: number | null,
): number {
  return mainReplay.countSessionClips(timeline, agent, sessionStart, ownerId)
}

function registerClipOnlySession(opts: {
  game: string
  map: string | null
  agent: string | null
  gameMode: string
  timeline: MatchData | null
  sessionStart: number
  reason: ClipOnlyReason
  requireClips?: boolean
  ownerId?: number | null
}): void {
  return mainReplay.registerClipOnlySession(opts)
}

async function syncScoutMomentsForJob(
  jobId: string | null,
  videoPath: string,
  timeline: MatchData | null,
): Promise<void> {
  return mainReplay.syncScoutMomentsForJob(jobId, videoPath, timeline)
}

function finalizeTimelineOffsetsForClips(timeline: MatchData | null): void {
  return mainReplay.finalizeTimelineOffsetsForClips(timeline)
}

function lateClipRetryDeps(): LateClipRetryDeps {
  return mainReplay.lateClipRetryDeps()
}

async function prepareTimelineForCoaching(
  timeline: MatchData | null,
  game: string,
  recordingId?: string | null,
  ownerId: number | null = getActiveUserId(),
): Promise<{ extras: CoachingSubmissionExtras | undefined }> {
  return mainReplay.prepareTimelineForCoaching(timeline, game, recordingId, ownerId)
}

/** Max wait for ffprobe before post-game upload proceeds (OBS already muxed the file). */
const POST_GAME_VOD_PROBE_MAX_MS = 3_000

function isBlockingVodReadiness(state: AnalysisReadiness['state']): boolean {
  return mainReadiness.isBlockingVodReadiness(state)
}

function sendAnalysisReadinessUpdate(
  recordingId: string,
  targetWindow: BrowserWindow | null | undefined,
  readiness: AnalysisReadiness,
): void {
  return mainReadiness.sendAnalysisReadinessUpdate(recordingId, targetWindow, readiness)
}

async function refreshRecordingVodProbe(
  rec: NonNullable<ReturnType<RecordingsStore['getById']>>,
): Promise<void> {
  return mainReadiness.refreshRecordingVodProbe(rec)
}

/** Poll Riot + VOD probe until analyse is unblocked — Valorant only; CS2/Deadlock are VOD-ready without demo. */
const analysisReadinessRefreshGeneration = new Map<string, number>()

function cancelAnalysisReadinessRefresh(recordingId: string): void {
  return mainReadiness.cancelAnalysisReadinessRefresh(recordingId)
}

async function recoverOrphanedValorantMetadata(rec: PendingRecording): Promise<boolean> {
  return mainReadiness.recoverOrphanedValorantMetadata(rec)
}

function orphanRecoveryMessage(reason: string | null | undefined): string | null {
  return mainReadiness.orphanRecoveryMessage(reason)
}

function scheduleAnalysisReadinessRefresh(
  recordingId: string,
  game: string,
  opts?: { force?: boolean },
): void {
  return mainReadiness.scheduleAnalysisReadinessRefresh(recordingId, game, opts)
}

function resumeStuckMatchStatsEnrichment(): void {
  return mainReadiness.resumeStuckMatchStatsEnrichment()
}

async function ensureAnalysisReadinessForAnalyse(
  recordingId: string,
): Promise<
  | { ok: true; recording: NonNullable<ReturnType<RecordingsStore['getById']>> }
  | { ok: false; error: string; state: string }
> {
  return mainReadiness.ensureAnalysisReadinessForAnalyse(recordingId)
}

async function waitUntilAnalysisReady(
  recordingId: string,
  targetWindow: BrowserWindow | null | undefined,
  maxWaitMs = MATCH_DETAILS_ENRICH_MAX_MS,
): Promise<{ ready: boolean; readiness: AnalysisReadiness }> {
  return mainReadiness.waitUntilAnalysisReady(recordingId, targetWindow, maxWaitMs)
}

const DEBRIEF_SKIP_MODES = new Set(['DEATHMATCH', 'TEAMDEATHMATCH'])

function shouldRequestDebrief(timeline: MatchData | null, mode: string | null | undefined): boolean {
  if (!timeline) return false
  if (DEBRIEF_SKIP_MODES.has((mode ?? '').toUpperCase())) return false
  return (timeline.playerKills?.length ?? 0) > 0
    || (timeline.roundSummaries?.length ?? 0) > 0
    || timeline.finalStats != null
}

// Board 12 · Between games: tell Home when agent select is open so it can show the read-only brief.
let lastPregameKey = ''
function pushPregameContext(raw: unknown): void {
  const ctx = raw ? sanitizePregameContext(raw) : null
  const key = pregameKey(ctx)
  if (key === lastPregameKey) return
  lastPregameKey = key
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('pregame:context', ctx)
}

function requestPregameBrief(context?: {
  matchId?: string
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
        // Live Riot rank first; RR history is oldest-first, so its newest entry is the last one.
        rank: valorantRankService?.current()?.tierName ?? history[history.length - 1]?.rank ?? null,
        skillFocus: skillFocus ?? null,
      },
      getApiBaseUrl(),
    )
  }).catch(() => {
    _requestPregameBrief(() => authManager.getToken(), logActivity, context, getApiBaseUrl())
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
    apiUrl: getApiBaseUrl(),
  })
}

function createMainWindow(startAuthenticated: boolean = false): BrowserWindow {
  return _createMainWindow(startAuthenticated, () => isQuitting)
}

function createPostGameWindow(): BrowserWindow {
  return _createPostGameWindow()
}

function bindPostGameSessionToRecording(recording: {
  id: string
  game: string
  map: string | null
  agent: string | null
}): void {
  resetPostGameSession(
    recording.game,
    recording.map,
    recording.agent,
    getActiveUserId(),
    recording.id,
  )
  trackPostgameOpened(recording.game)
  sendPostGameEvent(null, 'post-game:prep-step', {
    recordingId: recording.id,
    game: recording.game,
    map: recording.map,
    agent: recording.agent,
  })
}

function createTray(): void {
  const result = _createTray({
    getMainWindow: () => mainWindow,
    setMainWindow: (win) => { mainWindow = win },
    isRecording: () => obsRecorder.isActivelyRecording(),
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
  return mainMatchDetection.setupGameDetection()
}

/**
 * Match-end auto-uploads of a Deadlock replay already spend a credit. Link that job to the
 * match's recording(s) so "Review replay" is not offered (and charged) a second time.
 */
function linkAutoDeadlockReviewJob(jobId: string, match: { matchId?: number | null; sessionStart?: number | null }, recordingId?: string): void {
  const store = recordingsStore.forUser(getActiveUserId())
  const ids: string[] = []
  const setJob = (id: string, job: string) => { const ok = store.setDeadlockReviewJob(id, job); if (ok) ids.push(id); return ok }
  if (!(recordingId && setJob(recordingId, jobId))) {
    linkDeadlockAutoReview({ list: () => store.getAll(null), setJob }, jobId, match)
  }
  if (!ids.length) { log.info('[Replay] Deadlock auto-review not linked to a recording yet', { jobId }); return }
  notifyRecordingsUpdated()
  // Same poller as Review replay: links the replay timeline when the review finishes.
  for (const id of ids) watchDeadlockReview(id)
}

async function handleOrphanedJobAtStartup(
  orphanedJob: { job_id: string; savedAt: number; agent?: string; map?: string; game?: string }
): Promise<void> {
  return mainAnalysis.handleOrphanedJobAtStartup(orphanedJob)
}

async function resumePollForJob(
  jobId: string,
  context: { agent?: string; map?: string; game?: string }
): Promise<void> {
  return mainAnalysis.resumePollForJob(jobId, context)
}

async function doUploadArchiveOnly(...args: Parameters<typeof uploadArchiveOnlyImpl>): Promise<{ archiveId: string | null; lastError: AnalysisErrorPayload | null }> {
  return mainAnalysis.doUploadArchiveOnly(...args)
}

async function uploadArchiveOnlyImpl(
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
): Promise<{ archiveId: string | null; lastError: AnalysisErrorPayload | null }> {
  return mainAnalysis.uploadArchiveOnlyImpl(recordingId, videoPath, riotName, riotTag, game, map, agent, timeline, targetWindow, deleteLocalAfterUpload)
}

function doUploadAndAnalyse(
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
  deleteLocalAfterUpload = false,
  enrichPromise?: Promise<{ extras: CoachingSubmissionExtras | undefined }>,
): Promise<string | null> {
  return mainAnalysis.doUploadAndAnalyse(recordingId, videoPath, riotName, riotTag, game, map, agent, timeline, targetWindow, sessionStart, skipAutoDelete, deleteLocalAfterUpload, enrichPromise)
}

async function performUploadAndAnalyse(
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
): Promise<string | null> {
  return mainAnalysis.performUploadAndAnalyse(recordingId, videoPath, riotName, riotTag, game, map, agent, timeline, targetWindow, sessionStart, skipAutoDelete, deleteLocalAfterUpload, enrichPromise)
}

/** `[MainLag]` → rate-limited diagnostic report (packaged builds only; see diagnostic-reporter.ts). */
let reportMainLag: (event: DiagnosticEvent) => boolean = () => false

function createMainLagReporter(): (event: DiagnosticEvent) => boolean {
  const statePath = join(app.getPath('userData'), 'diagnostic-reports.json')
  return createDiagnosticReporter({
    enabled: app.isPackaged && process.env.UPFORGE_SELFTEST !== '1',
    send: reportDiagnostic,
    context: () => ({
      game: gameDetector.currentGame() ?? (settingsManager ? normalizePrimaryGame(settingsManager.get().primaryGame) : null),
      recordingCount: recordingsStore ? recordingsStore.getAll().length : null,
      activity: recentErrorActivity(),
    }),
    loadState: () => JSON.parse(fs.readFileSync(statePath, 'utf8')) as DiagnosticRateState,
    saveState: (state) => fs.writeFileSync(statePath, JSON.stringify(state)),
  })
}

function createSplashWindow(): BrowserWindow {
  return _createSplashWindow()
}

function showDevelopmentPostGamePreview(): void {
  return mainDevPreview.showDevelopmentPostGamePreview()
}

async function startApp(): Promise<void> {
  return mainStartup.startApp()
}

function registerMainLifecycle(): void {
  return mainLifecycle.registerMainLifecycle()
}
registerMainLifecycle()

// ── Deep links (upforge://) ─────────────────────────────────────────────────────────────────────────
// Allow-listed actions only (see deep-link.ts). The action is held here until a signed-in renderer takes it.
const pendingDeepLink = new PendingDeepLink()
function acceptDeepLink(raw: string | null): void {
  if (!raw) return
  const discordCallback = parseDiscordLinkCallback(raw)
  if (discordCallback) {
    // A pending flow can only exist after IPC starts. Cold launches and duplicate
    // bootstrap processes must not display a false result for another instance.
    if (!ipcHandlersReady) return
    // Codes and state stay in main, outside the generic renderer navigation queue.
    const ownerToken = authManager.getToken()
    void authManager.discordLink.complete(discordCallback).then(async result => {
      if (!result || authManager.getToken() !== ownerToken) return
      if (result.ok) await authManager.fetchUser()
      if (authManager.getToken() !== ownerToken) return
      showAppNotification({
        title: result.ok ? 'Discord linked' : 'Discord linking',
        body: result.ok ? 'Your Discord account is connected.' : result.error,
        silent: true,
        onClick: () => focusMainWindow(),
      })
      focusMainWindow()
    }).catch(() => log.warn('[Discord] Could not complete account linking'))
    return
  }
  const action = pendingDeepLink.offer(raw)
  if (!action) {
    log.warn('[DeepLink] Ignored a link that is not on the allow-list')
    return
  }
  log.info('[DeepLink] Received', action.kind)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('deep-link:available')
    focusMainWindow()
  }
}
// macOS delivers links through open-url, possibly before the app is ready.
app.on('open-url', (event, url) => {
  event.preventDefault()
  acceptDeepLink(url)
})
// Windows/Linux cold start: the link is in our own argv.
acceptDeepLink(findDeepLinkInArgv(process.argv))
// Register the handler only for installed builds, so a dev checkout never claims upforge:// on the machine.
if (!selftestRequest && app.isPackaged && !app.isDefaultProtocolClient(DEEP_LINK_SCHEME)) {
  try { app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME) } catch (err) { log.warn('[DeepLink] Could not register protocol:', err) }
}

void (async () => {
  if (selftestRequest) {
    // Hard stop in case the worker neither answers nor times out.
    setTimeout(() => app.exit(2), 150_000)
    const code = await runSelftest(
      selftestRequest,
      { appVersion: APP_VERSION, platform: process.platform, arch: process.arch, packaged: app.isPackaged },
      { write: (line) => process.stdout.write(line), file: process.env.UPFORGE_SELFTEST_OUT },
    )
    app.exit(code)
    return
  }
  const role = await resolveInstanceLock()
  if (role === 'duplicate') {
    app.quit()
    return
  }
  await startApp()
})()
