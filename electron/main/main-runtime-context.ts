/** Type-only contract for the live main-process state shared by orchestration modules. */
import type { Cs2DemoRetrieval } from './cs2-demo-retrieval'
import type { OverstepBridge } from './overstep-bridge'
import type { CaptureOwnership } from './capture-ownership'
import type { BackgroundMatchState } from './background-match-state'
import type { RecordingSessionLog } from './recording-session-log'
import type { StartupFailureSummary } from './startup-failure-summary'
import type { BrowserWindow, Tray } from 'electron'
import type { ReadyAnalysis } from './ready-analyses'
import type { GameDetector } from './game-detector'
import type { Recorder } from './recorder'
import type { OBSRecorder } from './obs-recorder'
import type { RecordingPreparationError } from './vod-compressor'
import type { RecordingPipelineSingleFlight } from './recording-pipeline-single-flight'
import type { PostMatchJobStore } from './post-match-job-store'
import type { PostMatchWorker } from './post-match-worker'
import type { ObsWatchdogSnapshot } from './obs-watchdog-policy'
import type { RiotLocalApi } from './riot-local-api'
import type { LoLLiveClientApi } from './lol-live-client-api'
import type { GameId } from './game-config'
import type { UploadManager } from './upload-manager'
import type { AnalysisPollStatus } from './analysis-poll'
import type { ReconciledAnalysisContext } from './stuck-analysis-reconciler'
import type { AnalysisErrorPayload } from './analysis-failure-messages'
import type { DuelFailureDiagnostics } from '../../src/lib/duel-diagnostics'
import type { AuthManager } from './auth-manager'
import type { SettingsManager } from './settings-manager'
import type { WarmupPrompt } from './warmup-prompt'
import type { MatchTelemetrySession, SectorName } from './match-telemetry'
import type { RecordingBackend } from './capture-backend'
import type { RecordingsStore, ClipOnlyReason, PendingRecording } from './recordings-store'
import type { ProductionVodFixtureLibrary } from './production-vod-fixture'
import type { ClipExtractor } from './clip-extractor'
import type { ClipStore } from './clip-store'
import type { HotkeyManager } from './hotkey-manager'
import type { PerformanceManager } from './performance-manager'
import type { TrainerBridge } from './trainer-bridge'
import type { MatchData } from './riot-types'
import type { DiagnosticEvent } from './diagnostic-reporter'
import type { ValorantRankService } from './valorant-rank'
import type { DiscordRPC } from './discord-rpc'
import type { LolLocalMatchCollector, LolLocalMatchCapture } from './lol-local-match'
import type { AnalysisReadiness } from './analysis-readiness'
import type { CoachingSubmissionExtras } from './match-coaching-context'
import type { DeadlockQueueLookups } from './deadlock-auto-analyse'

/** Read and write the live state through the accessors owned by index.ts. */
export interface MainRuntimeBindings {
    FAILURE_NOTIFY_COOLDOWN_MS: number;
    POST_GAME_VOD_PROBE_MAX_MS: 3000;
    abortBackgroundWorkOnGameStart: (game: string) => void;
    abortInFlightAnalysisForRecording: (recordingId: string) => {
        ok: boolean;
        error?: string;
    };
    acceptDeepLink: (raw: string | null) => void;
    activeCapture: {
        ownerId: number | null;
    } | null;
    activeMatchTelemetry: MatchTelemetrySession | null;
    activeUploadRecordingIds: Set<string>;
    activityLog: {
        time: number;
        message: string;
        game?: string;
    }[];
    analysisPipelineSingleFlight: RecordingPipelineSingleFlight<string | null>;
    analysisReadinessRefreshGeneration: Map<string, number>;
    authManager: AuthManager;
    backgroundMatchState: BackgroundMatchState;
    beginMatchPerformanceMode: (opts?: {
        holdPostMatch?: boolean;
    }) => void;
    beginMatchTelemetry: (game: string) => MatchTelemetrySession;
    bindPostGameSessionToRecording: (recording: {
        id: string;
        game: string;
        map: string | null;
        agent: string | null;
    }) => void;
    cachedShippingProcessUp: boolean;
    cancelAnalysisReadinessRefresh: (recordingId: string) => void;
    cancelMatchWait: (() => void) | null;
    captureNetworkEvidence: (trigger: string, force?: boolean) => Promise<void>;
    captureOwnerId: () => number | null;
    captureOwnership: CaptureOwnership;
    clearAccountScopedRuntimeState: () => void;
    clearDeferredUploadRetryPersisted: (recordingId: string) => void;
    clipExtractor: ClipExtractor;
    clipFfmpegProbe: Recorder;
    clipStore: ClipStore;
    createMainLagReporter: () => (event: DiagnosticEvent) => boolean;
    createMainWindow: (startAuthenticated?: boolean) => BrowserWindow;
    createPostGameWindow: () => BrowserWindow;
    createSplashWindow: () => BrowserWindow;
    createTray: () => void;
    cs2DemoRetrieval: Cs2DemoRetrieval;
    currentGsiMapName: string | null;
    currentMatchGameMode: string | null;
    currentMatchStartTime: number | null;
    currentRecordingOwnerGame: () => string | null;
    currentRecordingStartTime: number | null;
    deadlockAutoUploadGate: (matchId: number | null) => Promise<{
        allowed: boolean;
        queue: string | null;
    }>;
    deadlockQueueLookups: DeadlockQueueLookups;
    deadlockReplayFailureNotices: Set<string>;
    deadlockReviewPolls: Set<string>;
    deadlockSessionStartAt: number | null;
    discordMatchContext: () => {
        map: string | null;
        agent: string | null;
    };
    discordRPC: DiscordRPC;
    dismissMatchWaitUi: () => void;
    dispatchAnalysisFailure: (rawError: string, opts?: {
        recordingId?: string | null;
        targetWindow?: BrowserWindow | null;
        notify?: boolean;
        needsUpgrade?: boolean;
        upgradeUrl?: string;
        ppaUrl?: string;
        clipsOnly?: boolean;
        failureDiagnostics?: DuelFailureDiagnostics | null;
        preparationDiagnostics?: RecordingPreparationError['diagnostics'];
    }) => AnalysisErrorPayload;
    dispatchReconciledAnalysisReady: (ctx: ReconciledAnalysisContext) => void;
    doUploadArchiveOnly: (...args: Parameters<(recordingId: string | null, videoPath: string, riotName: string, riotTag: string, game: string, map: string | null, agent: string | null, timeline: MatchData | null, targetWindow: BrowserWindow, deleteLocalAfterUpload?: boolean) => Promise<{
        archiveId: string | null;
        lastError: AnalysisErrorPayload | null;
    }>>) => Promise<{
        archiveId: string | null;
        lastError: AnalysisErrorPayload | null;
    }>;
    dropAutomaticDeadlockJobs: (matchId: string, mode: string | null) => void;
    emitActiveOpsLap: () => void;
    endMatchPerformanceMode: () => void;
    enforceRecordingPresetAccess: () => void;
    enqueuePostMatchAnalyse: (args: {
        recordingId: string;
        videoPath: string;
        riotName: string;
        riotTag: string;
        game: string;
        map: string | null;
        agent: string | null;
        matchCorrelationId?: string | null;
        requestKind?: 'automatic' | 'manual';
    }) => void;
    enrichTimelineSpatial: (timeline: MatchData) => void;
    ensureAnalysisReadinessForAnalyse: (recordingId: string) => Promise<{
        ok: true;
        recording: NonNullable<ReturnType<RecordingsStore['getById']>>;
    } | {
        ok: false;
        error: string;
        state: string;
    }>;
    ensureObsCaptureForGame: (game: string) => Promise<void>;
    ensureObsReady: (opts?: {
        allowProcessRestart?: boolean;
        notifyOnFailure?: boolean;
    }) => Promise<boolean>;
    ensureObsReadyOrThrow: () => Promise<void>;
    extractFailureDiagnostics: (status?: AnalysisPollStatus | null) => DuelFailureDiagnostics | null;
    extractKillClipsOnly: (videoPath: string, timeline: MatchData, analysisJobId: string | null, game?: string) => Promise<void>;
    extractMatchClips: (videoPath: string, timeline: MatchData | null, analysisJobId: string | null, game?: string, ownerId?: number | null, context?: LocalClipContext) => Promise<void>;
    ffmpegOk: boolean;
    fileSizeOrNull: (p: string) => number | null;
    finalizeAfterObsProcessDeath: (() => Promise<void>) | null;
    finalizeTimelineOffsetsForClips: (timeline: MatchData | null) => void;
    focusMainWindow: () => void;
    gameDetector: GameDetector;
    getRecordingBackendForStatus: () => RecordingBackend;
    gsiPollTimer: ReturnType<typeof setInterval> | null;
    guestClaimDeclinedFor: number | null;
    guestClaimInFlight: boolean;
    handleOrphanedJobAtStartup: (orphanedJob: {
        job_id: string;
        savedAt: number;
        agent?: string;
        map?: string;
        game?: string;
    }) => Promise<void>;
    hotkeyBookmarks: number[];
    hotkeyManager: HotkeyManager;
    inGameFeedbackDeps: () => {
        getSettings: () => import("./settings-manager").AppSettings;
        sendOverlayEvent: (channel: string, data?: unknown) => void;
        flashOverlay: (durationMs: number) => void;
    };
    initPostMatchWorker: (userId: number) => void;
    interruptBackgroundWorkForMatch: () => void;
    ipcHandlersReady: boolean;
    isBlockingVodReadiness: (state: AnalysisReadiness['state']) => boolean;
    isObsUnavailableError: (message: string) => boolean;
    isQuitting: boolean;
    lastMatchDiagnostic: LastMatchDiagnostic | null;
    lastReplayRetryContext: ReplayRetryContext | null;
    lastShippingProcessCheckAt: number;
    lateClipRetryDeps: () => LateClipRetryDeps;
    linkAutoDeadlockReviewJob: (jobId: string, match: {
        matchId?: number | null;
        sessionStart?: number | null;
    }, recordingId?: string) => void;
    linkedLolAccountsFromAuth: () => Array<{
        name: string;
        tag: string;
        isMain: boolean;
    }>;
    linkedRiotAccountsFromAuth: () => Array<{
        name: string;
        tag: string;
        isMain: boolean;
    }>;
    linkedRiotFromAuth: () => {
        name: string;
        tag: string;
    } | null;
    localMediaWork: number;
    logActivity: (message: string, explicitGame?: string) => void;
    logAnalysisFailureActivity: (rawError: string, diagnostics: DuelFailureDiagnostics | null) => void;
    lolAccountsFetchedAt: number;
    lolLiveClientApi: LoLLiveClientApi;
    lolLocalCollector: LolLocalMatchCollector;
    mainWindow: BrowserWindow | null;
    manualEndMatchRecording: ((game: string) => Promise<{
        ok: boolean;
        reason?: string;
    }>) | null;
    matchCapturePriority: boolean;
    matchDetectInFlightDepth: number;
    matchFinalizeInFlight: Promise<boolean> | null;
    matchFlowGame: string | null;
    matchFlowGeneration: number;
    matchHandled: boolean;
    matchPerformanceModeActive: boolean;
    matchPriorityDeps: () => {
        isRecording: () => boolean;
    };
    maybeAutoEnqueueWhenReady: (recordingId: string) => void;
    maybeCaptureRiotDnsEvidence: () => void;
    maybeDeleteLocalRecordingAfterAnalysis: (recordingPath: string, opts: {
        deleteLocalAfterUpload?: boolean;
        skipAutoDelete?: boolean;
    }) => void;
    maybeResumeDeferredUploads: () => void;
    mergeSpatialSummary: (apiSpatial: unknown, localSpatial: import('./spatial/types').MatchSpatialSummary | null | undefined) => import('./spatial/types').MatchSpatialSummary | null;
    notifyCoachingReady: (body: string, analysisId?: number | null, ready?: {
        game: string;
        label: string;
        map?: string | null;
    }) => void;
    notifyDashboardToast: (message: string) => void;
    notifyObsRecordingUnavailable: (detail?: string) => void;
    notifyRecordingUx: (message: string, notificationTitle?: string) => void;
    notifyRecordingsUpdated: () => void;
    notifySilent: () => boolean;
    obsRecorder: OBSRecorder;
    obsStartupTask: Promise<void>;
    obsWatchdogSnapshot: (extra?: Partial<ObsWatchdogSnapshot>) => ObsWatchdogSnapshot;
    offerGuestMediaClaim: () => Promise<void>;
    onRecordingLost: ((error: string) => void) | null;
    onSettingsSaved: (settings: ReturnType<SettingsManager['get']>) => void;
    orphanRecoveryMessage: (reason: string | null | undefined) => string | null;
    orphanedRecordingsScanned: boolean;
    overlayAutoHideTimer: ReturnType<typeof setTimeout> | null;
    overlayPollTimer: ReturnType<typeof setInterval> | null;
    overstepBridge: OverstepBridge | null;
    pendingDeepLink: PendingDeepLink;
    pendingRecordingStart: {
        game: string;
        controller: AbortController;
    } | null;
    performanceManager: PerformanceManager;
    postGameWindow: BrowserWindow | null;
    postMatchJobStore: PostMatchJobStore | null;
    postMatchQueueUserId: number | null;
    postMatchWorker: PostMatchWorker | null;
    prepareLegacyOrphanRecoveryRows: () => void;
    prepareTimelineForCoaching: (timeline: MatchData | null, game: string, recordingId?: string | null, ownerId?: number | null) => Promise<{
        extras: CoachingSubmissionExtras | undefined;
    }>;
    productionVodFixtures: ProductionVodFixtureLibrary;
    pushPregameContext: (raw: unknown) => void;
    readyAnalysesList: () => ReadyAnalysis[];
    rearmWatchInFlight: string | null;
    recentFailureNotifications: Map<string, number>;
    reconcileInterruptedUploads: () => void;
    recordingFileFinalizer: {
        tick(): Promise<void>;
    };
    recordingSavePath: () => string;
    recordingSessionLog: () => RecordingSessionLog;
    recordingsStore: RecordingsStore;
    recoverOrphanedValorantMetadata: (rec: PendingRecording) => Promise<boolean>;
    refreshCoachNotificationPoller: () => void;
    refreshDeadlockProfile: (fresh?: boolean) => Promise<void>;
    refreshRecordingVodProbe: (rec: NonNullable<ReturnType<RecordingsStore['getById']>>) => Promise<void>;
    refreshReplayTimelineForRecording: (recordingId: string, options?: {
        notifyActivity?: boolean;
    }) => Promise<boolean>;
    registerClipOnlySession: (opts: {
        game: string;
        map: string | null;
        agent: string | null;
        gameMode: string;
        timeline: MatchData | null;
        sessionStart: number;
        reason: ClipOnlyReason;
        requireClips?: boolean;
        ownerId?: number | null;
    }) => void;
    registerDeferredUploadRetryPersisted: (recordingId: string, run: () => Promise<void>) => void;
    rememberSkippedMatch: (game: string, message: string) => void;
    replayAttempts: Map<string, Promise<boolean>>;
    replayCaptureOwnerId: number | null;
    replayScope: number;
    replayWork: Promise<unknown>;
    reportMainLag: (event: DiagnosticEvent) => boolean;
    requestPostGameDebrief: (opts: {
        riotName: string;
        riotTag: string;
        agent: string | null;
        map: string | null;
        timeline: MatchData;
        sendToWindow: (channel: string, payload?: unknown) => void;
        coachingExtras?: CoachingSubmissionExtras;
    }) => Promise<void>;
    requestPregameBrief: (context?: {
        matchId?: string;
        agent?: string | null;
        map?: string | null;
        mode?: string | null;
        allyAgents?: string[];
        enemyAgents?: string[];
    }) => void;
    restoreDeferredUploadsFromDisk: () => void;
    resumePollForJob: (jobId: string, context: {
        agent?: string;
        map?: string;
        game?: string;
    }) => Promise<void>;
    resumeSavedLocalMedia: () => void;
    resumeStuckMatchStatsEnrichment: () => void;
    riotLocalApi: RiotLocalApi;
    rowLocalExpiresAt: (rec: PendingRecording) => number | null;
    runStorageMaintenanceIfReady: (notify?: boolean) => void;
    runStuckAnalysisReconcile: () => Promise<number>;
    saveReadyAnalyses: (list: ReadyAnalysis[]) => void;
    scanForOrphanedRecordings: (force?: boolean, opts?: {
        fromMatchEnd?: boolean;
    }) => number;
    scheduleAnalysisReadinessRefresh: (recordingId: string, game: string, opts?: {
        force?: boolean;
    }) => void;
    scheduleFocusSyncAfterMatch: (game: string) => void;
    scheduleObsProbeOnWindowLoad: (win: BrowserWindow, notify: boolean) => void;
    sendAnalysisReadinessUpdate: (recordingId: string, targetWindow: BrowserWindow | null | undefined, readiness: AnalysisReadiness) => void;
    sendLolLocalReport: (capture: LolLocalMatchCapture, resolveRecordingId: () => string | null) => void;
    sendUploadFailure: (rawError: string, opts?: {
        recordingId?: string | null;
        targetWindow?: BrowserWindow | null;
        needsUpgrade?: boolean;
        upgradeUrl?: string;
        ppaUrl?: string;
        clipsOnly?: boolean;
        notify?: boolean;
        game?: string;
        preparationDiagnostics?: RecordingPreparationError['diagnostics'];
    }) => AnalysisErrorPayload;
    settingsManager: SettingsManager;
    setupGameDetection: () => void;
    shouldRequestDebrief: (timeline: MatchData | null, mode: string | null | undefined) => boolean;
    showDevelopmentPostGamePreview: () => void;
    startupFailures: StartupFailureSummary;
    stopActiveObsStatsSampler: (() => void) | null;
    stopInstanceCoordinator: (() => void) | null;
    stopObsHealthMonitor: (() => void) | null;
    stopObsStatsSampling: () => void;
    stuckAnalysisReconcileTimer: ReturnType<typeof setInterval> | null;
    supportActivity: import("./support-activity-history").SupportActivityStore;
    syncPrimaryGameFromDetection: (game: string) => void;
    syncScoutMomentsForJob: (jobId: string | null, videoPath: string, timeline: MatchData | null) => Promise<void>;
    syncUserSessionFromAuth: () => void;
    trackedPrimaryGame: GameId;
    trainerBridge: TrainerBridge;
    tray: Tray | null;
    trayRefreshInterval: ReturnType<typeof setInterval> | null;
    updateTrayMenuFn: (() => void) | null;
    uploadManager: UploadManager;
    userSessionDeps: () => {
        clipStore: ClipStore;
        recordingsStore: RecordingsStore;
        settingsManager: SettingsManager;
        getMainWindow: () => BrowserWindow | null;
        onScopeChanged: () => void;
    };
    valorantRankService: ValorantRankService | null;
    waitingForMatch: boolean;
    warmupPrompt: WarmupPrompt;
    watchDeadlockReview: (recordingId: string) => void;
    wireObsConnectionEvents: () => void;
}
import type { PendingDeepLink } from './deep-link'
import type { ReplayRetryContext } from './match-end-timeline'
import type { LateClipRetryDeps } from './late-clip-retry'

interface LastMatchDiagnostic {
    timestamp: number;
    game: string;
    matchId: string | null;
    map: string | null;
    agent: string | null;
    gameMode: string;
    recordingDuration: number;
    fileSizeMb: number;
    killsInTimeline: number;
    clipsExtracted: number;
    matchDetailsStatus: 'fetched' | 'no_match_id' | 'no_region' | 'no_auth' | 'fetch_failed' | 'pending';
    lolEnrichStatus?: 'fetched' | 'fetch_failed' | 'no_match_id' | 'no_auth' | null;
    queueId?: string | null;
    correlationId: string | null;
    sectorsMs: Partial<Record<SectorName, number>>;
    dnf: string | null;
    endReason: string | null;
    pathFallback: boolean;
    machineBucket: string | null;
    obsSkippedFrames: number | null;
    audioTracks: number | null;
    outputMode: string | null;
    checksumPrefix: string | null;
}

interface LocalClipContext {
    recordingStartTime: number | null;
    bookmarks: number[];
}
