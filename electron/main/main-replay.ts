import { buildTimelineFromDemo, cs2DemoReadError, CS2_DEMO_UNREADABLE_MESSAGE } from './demo-timeline'
import { cs2DemoRetrievalStatus } from './cs2-demo-retrieval'
import fs from 'fs'
import { showAppNotification } from './app-notifications'
import { waitUntilBackgroundWorkAllowed, shouldDeferHeavyBackgroundWork } from './match-priority-guard'
import { recomputeTimelineVideoOffsets } from './riot-local-api'
import { applyLiveKillStampsToTimeline } from './live-kill-stamps'
import { resolveMatchSessionStartMs } from './recording-sync'
import { resolveUploadPlayerIdentity } from './upload-player-identity'
import { getActiveUserId } from './user-session'
import { type ClipOnlyReason } from './recordings-store'
import { ffmpegPath } from './clip-extractor'
import { alignValorantTimelineByRoundTimer, ffmpegFrameReader } from './valorant-timer-sync'
import type { MatchData } from './riot-types'
import log from 'electron-log'
import { buildTimelineFromReplay } from './post-match-replay'
import { buildAndUploadScoutMoments } from './scout-moments'
import { enrichTimelineForCoaching } from './match-coaching-enrich'
import { enrichLolTimelineForCoaching } from './lol-match-v5-enrich'
import { formatLolLinkActivity } from './lol-enrich-activity'
import { getAnalysisReadiness } from './analysis-readiness'
import { hasDemoKillRows, MATCH_DETAILS_ENRICH_MAX_MS } from './match-data-quality'
import { buildCoachingSubmissionExtras, type CoachingSubmissionExtras } from './match-coaching-context'
import { getLatestGsiMap } from './steam-gsi-server'
import { getDeadlockMap, getDeadlockMatchSalts } from './deadlock-match-watcher'
import { getGameDataCapture } from './game-data-capture'
import { downloadDeadlockValveReplay } from './deadlock-valve-replay'
import { resolveCs2LocalPlayerName } from './cs2-player-identity'
import { type LateClipRetryDeps } from './late-clip-retry'
import { downloadCs2ValveDemoForSession, type ValveDemoFailureCode } from './cs2-valve-demo-downloader'
import { clearDemoDownloadProgress, sendDemoDownloadProgress } from './demo-download-notify'
import { linkReviewTimeline, parseReviewStatus, pollDeadlockReplayReview, type PollReviewDeps, type ReviewDetail } from './deadlock-review'
import { isDeadlockReviewJobId } from './recordings-store'
import type { MainRuntimeBindings } from './main-runtime-context'

export type MainReplayContext = Pick<MainRuntimeBindings,
  | 'authManager'
  | 'captureOwnerId'
  | 'clipExtractor'
  | 'clipStore'
  | 'deadlockReplayFailureNotices'
  | 'deadlockReviewPolls'
  | 'enrichTimelineSpatial'
  | 'extractKillClipsOnly'
  | 'fileSizeOrNull'
  | 'lastMatchDiagnostic'
  | 'logActivity'
  | 'mainWindow'
  | 'matchPriorityDeps'
  | 'notifyRecordingsUpdated'
  | 'notifySilent'
  | 'obsRecorder'
  | 'postGameWindow'
  | 'recordingsStore'
  | 'replayAttempts'
  | 'replayScope'
  | 'replayWork'
  | 'riotLocalApi'
  | 'sendAnalysisReadinessUpdate'
  | 'settingsManager'
  | 'uploadManager'
>

/** Keeps callbacks bound to the live application state rather than a startup snapshot. */
export function createMainReplay(mainProcess: MainReplayContext) {
  /** Deadlock cloud review: status / detail reads (GET only) and the deps the review flow needs. */
  async function fetchDeadlockReviewStatus(jobId: string) {
    if (!isDeadlockReviewJobId(jobId)) return 'unknown' as const
    try {
      const res = await mainProcess.authManager.getApi().get(`/api/deadlock/demo/${encodeURIComponent(jobId)}/status`)
      return parseReviewStatus(res.data?.status)
    } catch { return 'unknown' as const }
  }

  async function fetchDeadlockReviewDetail(jobId: string): Promise<ReviewDetail | null> {
    if (!isDeadlockReviewJobId(jobId)) return null
    try {
      const res = await mainProcess.authManager.getApi().get(`/api/deadlock/demo/${encodeURIComponent(jobId)}`)
      return res.status === 200 ? (res.data as ReviewDetail) : null
    } catch { return null }
  }

  function deadlockReviewDeps(): PollReviewDeps {
    return {
      getRecording: id => mainProcess.recordingsStore.getById(id),
      getStatus: fetchDeadlockReviewStatus,
      getDetail: fetchDeadlockReviewDetail,
      updateTimeline: (id, timeline) => mainProcess.recordingsStore.updateTimeline(id, timeline),
      notify: () => mainProcess.notifyRecordingsUpdated(),
      sleep: ms => new Promise(r => setTimeout(r, ms)),
      cancelled: () => !mainProcess.authManager.getToken(),
    }
  }

  /** Polls one review in the background (at most one poller per recording). */
  function watchDeadlockReview(recordingId: string): void {
    if (mainProcess.deadlockReviewPolls.has(recordingId)) return
    mainProcess.deadlockReviewPolls.add(recordingId)
    void pollDeadlockReplayReview(deadlockReviewDeps(), recordingId)
      .then(result => log.info('[DeadlockReview]', recordingId, result))
      .catch(err => log.warn('[DeadlockReview] poll failed:', err instanceof Error ? err.message : err))
      .finally(() => mainProcess.deadlockReviewPolls.delete(recordingId))
  }

  function refreshReplayTimelineForRecording(
    recordingId: string,
    options?: { notifyActivity?: boolean },
  ): Promise<boolean> {
    const existing = mainProcess.replayAttempts.get(recordingId)
    if (existing) return existing
    const scope = mainProcess.replayScope
    const attempt = mainProcess.replayWork.then(async () => {
      if (scope !== mainProcess.replayScope) return false
      try {
        return await retrieveReplayTimelineForRecording(recordingId, options, scope)
      } catch (error) {
        log.warn('[Replay] Demo retrieval failed:', error)
        if (scope === mainProcess.replayScope && mainProcess.recordingsStore.getById(recordingId)?.game === 'cs2') {
          cs2DemoRetrievalStatus.set(recordingId, {
            state: 'waiting_match_data',
            message: error instanceof Error ? error.message : 'Demo retrieval failed.',
            code: 'gc_failed',
          })
          mainProcess.notifyRecordingsUpdated()
        }
        return false
      }
    }).finally(() => {
      if (mainProcess.replayAttempts.get(recordingId) === attempt) mainProcess.replayAttempts.delete(recordingId)
    })
    mainProcess.replayAttempts.set(recordingId, attempt)
    mainProcess.replayWork = attempt
    return attempt
  }

  /** Re-poll CS2 / Deadlock demo and merge stats into the dashboard recording. */
  async function retrieveReplayTimelineForRecording(
    recordingId: string,
    options: { notifyActivity?: boolean } | undefined,
    scope: number,
  ): Promise<boolean> {
    if (!mainProcess.settingsManager) return false
    const rec = mainProcess.recordingsStore.getById(recordingId)
    if (!rec || (rec.game !== 'cs2' && rec.game !== 'deadlock')) return false

    const valid = () => scope === mainProcess.replayScope && mainProcess.recordingsStore.getById(recordingId) != null
    if (hasDemoKillRows(rec.timeline)) return true
    if (rec.game === 'deadlock' && rec.deadlockReviewJobId) {
      // Deadlock replays are Source 2: the only real kill timeline is the user's cloud review.
      if (await fetchDeadlockReviewStatus(rec.deadlockReviewJobId) === 'completed') {
        return await linkReviewTimeline(deadlockReviewDeps(), rec, rec.deadlockReviewJobId) === 'linked'
      }
      watchDeadlockReview(recordingId)
      return false
    }
    const setStatus = (state: 'syncing' | 'waiting_match_data', message: string, code?: ValveDemoFailureCode) => {
      if (rec.game !== 'cs2' || !valid()) return
      const previous = cs2DemoRetrievalStatus.get(recordingId)
      cs2DemoRetrievalStatus.set(recordingId, { state, message, ...(code ? { code } : {}) })
      // Each `recordings:updated` reloads the whole list in several views. Only push a change the
      // user can see; transient "checking…" steps ride on the demo-download progress channel.
      if (state === 'syncing' || (previous?.state === state && previous.message === message)) return
      mainProcess.sendAnalysisReadinessUpdate(recordingId, mainProcess.postGameWindow, getAnalysisReadiness(rec))
    }
    if (shouldDeferHeavyBackgroundWork(mainProcess.matchPriorityDeps())) {
      setStatus('waiting_match_data', 'Demo checks paused during gameplay or recording. They resume automatically afterwards.')
      return false
    }
    setStatus('syncing', 'Checking local demo files.')
    const notifyWindows = () => valid() ? [mainProcess.mainWindow, mainProcess.postGameWindow] : []
    const onDownloadProgress = (progress: Parameters<typeof sendDemoDownloadProgress>[1]) => {
      const message = progress.phase === 'gc_lookup' ? 'Checking Steam for the matching demo.'
        : progress.phase === 'decompressing' ? 'Unpacking the demo.'
          : `Downloading the demo${progress.pct == null ? '.' : ` (${progress.pct}%).`}`
      if (cs2DemoRetrievalStatus.get(recordingId)?.message !== message) setStatus('syncing', message)
      sendDemoDownloadProgress(notifyWindows(), progress)
    }

    const matchStartMs = resolveMatchSessionStartMs(rec.timeline, rec.recordedAt)
    const recordingStartMs = rec.timeline?.recordingStartTime
      ?? rec.timeline?.gameplayStartTime
      ?? matchStartMs

    const replayCtx = {
      game: rec.game as 'cs2' | 'deadlock',
      matchSessionStart: matchStartMs,
      matchStartTime: rec.timeline?.matchStartTime ?? null,
      recordingStartTime: recordingStartMs,
      gsiMap: rec.map ?? rec.timeline?.map ?? null,
      customReplayDir: rec.game === 'cs2' ? mainProcess.settingsManager.get().cs2DemoDir : undefined,
      localPlayerName: rec.game === 'cs2'
        ? await resolveCs2LocalPlayerName(mainProcess.settingsManager, mainProcess.authManager)
        : null,
    }

    let parsed = await buildTimelineFromReplay(replayCtx, { pollOnce: true })
    if (!valid()) return false

    if (
      rec.game === 'cs2'
      && (!parsed.timeline || !hasDemoKillRows(parsed.timeline))
      && !shouldDeferHeavyBackgroundWork(mainProcess.matchPriorityDeps())
    ) {
      try {
        const valveLookupStartedAt = Date.now()
        const valve = await downloadCs2ValveDemoForSession({
          matchSessionStartMs: matchStartMs,
          gsiMap: replayCtx.gsiMap,
          customReplayDir: replayCtx.customReplayDir,
          onProgress: onDownloadProgress,
        })
        // Diagnostics capture (no-op unless a CS2 capture just ended): when did the demo become available?
        getGameDataCapture()?.noteAfterMatch('cs2', 'cs2-valve-demo', valve.ok
          ? { ok: true, durationMs: Date.now() - valveLookupStartedAt, matchTimeSec: valve.match.matchTimeSec, demoBytes: mainProcess.fileSizeOrNull(valve.demoPath) }
          : { ok: false, code: valve.code ?? null, durationMs: Date.now() - valveLookupStartedAt })
        if (valve.ok) {
          if (!valid()) return false
          setStatus('syncing', 'Reading demo match stats.')
          log.info('[Replay] CS2 Valve demo downloaded:', valve.demoPath)
          parsed = {
            demoPath: valve.demoPath,
            // Keep the mode GSI saw at match start (the demo header does not say Wingman vs Competitive).
            timeline: await buildTimelineFromDemo({ ...replayCtx, demoPath: valve.demoPath, map: replayCtx.gsiMap, gameMode: rec.gameMode || null, cs2Live: rec.timeline?.cs2Live ?? null }),
          }
        } else {
          setStatus('waiting_match_data', valve.error, valve.code ?? 'gc_failed')
          log.info('[CS2ValveDemo]', valve.code ?? 'gc_failed', valve.error)
        }
      } finally {
        clearDemoDownloadProgress(notifyWindows())
      }
    }

    if (
      rec.game === 'deadlock'
      && (!parsed.timeline || !hasDemoKillRows(parsed.timeline))
      && !shouldDeferHeavyBackgroundWork(mainProcess.matchPriorityDeps())
    ) {
      const salts = getDeadlockMatchSalts()
      if (salts?.replaySalt != null) {
        try {
          const valve = await downloadDeadlockValveReplay(salts, replayCtx.customReplayDir, onDownloadProgress)
          getGameDataCapture()?.noteAfterMatch('deadlock', 'deadlock-replay-download', valve.ok
            ? { ok: true, demoBytes: mainProcess.fileSizeOrNull(valve.demoPath) }
            : { ok: false, code: valve.code ?? null })
          if (valve.ok) {
            log.info('[Replay] Deadlock Valve replay downloaded:', valve.demoPath)
            parsed = await buildTimelineFromReplay(replayCtx, { pollOnce: true })
          } else if (valve.code !== 'no_salt') {
            log.info('[DeadlockValve]', valve.error)
            // Show the failure once per recording + message (this path re-polls).
            const noticeKey = `${recordingId}:${valve.error}`
            if (!mainProcess.deadlockReplayFailureNotices.has(noticeKey)) {
              mainProcess.deadlockReplayFailureNotices.add(noticeKey)
              mainProcess.logActivity(`Deadlock replay download failed: ${valve.error}`, 'deadlock')
            }
          }
        } finally {
          clearDemoDownloadProgress(notifyWindows())
        }
      }
    }

    if (!valid()) return false
    if (!parsed.timeline || !hasDemoKillRows(parsed.timeline)) {
      if (cs2DemoRetrievalStatus.get(recordingId)?.state === 'syncing') {
        // Back off (not the 5 s default) so a bad local demo is not re-parsed every few seconds.
        if (parsed.demoPath && cs2DemoReadError(parsed.demoPath)) setStatus('waiting_match_data', CS2_DEMO_UNREADABLE_MESSAGE, 'demo_unreadable')
        else if (parsed.demoPath) setStatus('waiting_match_data', 'No usable match stats found in the demo. Check that it belongs to this recording.', 'download_failed')
        else setStatus('waiting_match_data', 'Waiting for the CS2 demo.', 'gc_failed')
      }
      return false
    }
    cs2DemoRetrievalStatus.delete(recordingId)

    mainProcess.recordingsStore.updateTimeline(recordingId, parsed.timeline)
    mainProcess.notifyRecordingsUpdated()
    if (options?.notifyActivity) {
      const mapLabel = rec.map ?? parsed.timeline.map ?? 'Your match'
      if (rec.game === 'cs2') {
        mainProcess.logActivity('CS2 demo synced — match stats ready for analysis')
        showAppNotification({
          title: 'CS2 demo ready',
          body: `${mapLabel} — timeline linked. Review kills or run AI coaching from the dashboard.`,
          silent: mainProcess.notifySilent(),
          onClick: () => {
            mainProcess.mainWindow?.show()
            mainProcess.mainWindow?.focus()
          },
        })
      } else {
        mainProcess.logActivity('Deadlock replay synced — match stats ready')
        showAppNotification({
          title: 'Deadlock replay ready',
          body: `${mapLabel} — timeline linked. Review from the dashboard when ready.`,
          silent: mainProcess.notifySilent(),
          onClick: () => {
            mainProcess.mainWindow?.show()
            mainProcess.mainWindow?.focus()
          },
        })
      }
    }

    // Demo sync often lands after the first clip extract (empty timeline) — cut clips now.
    const videoPath = rec.path
    if (
      videoPath
      && fs.existsSync(videoPath)
      && (parsed.timeline.playerKills?.length ?? 0) > 0
    ) {
      const existing = mainProcess.clipStore.getAll().filter((c) =>
        (parsed.timeline!.matchId && c.matchId === parsed.timeline!.matchId)
        || (rec.jobId && c.analysisJobId === rec.jobId),
      )
      if (existing.length === 0) {
        log.info(`[Replay] Extracting highlight clips after ${rec.game} demo sync`)
        void mainProcess.extractKillClipsOnly(videoPath, parsed.timeline, rec.jobId ?? null, rec.game)
          .catch((err) => log.warn('[Replay] Post-sync clip extraction failed:', err))
      }
    }

    return true
  }

  /** Re-poll CS2 / Deadlock demo after match end when the first parse had no kill data for clips. */
  async function retryDemoClips(opts: {
    game: 'cs2' | 'deadlock'
    readyPath: string
    savedRecordingId: string
    timeline: MatchData | null
    matchSessionStart: number
    analysisJobId: string | null
  }): Promise<void> {
    if (!mainProcess.settingsManager) return
    await waitUntilBackgroundWorkAllowed(mainProcess.matchPriorityDeps(), { logActivity: mainProcess.logActivity })
    const game = opts.game
    const replayCtx = {
      game,
      matchSessionStart: opts.matchSessionStart,
      matchStartTime: opts.timeline?.matchStartTime ?? opts.matchSessionStart,
      recordingStartTime: opts.timeline?.gameplayStartTime ?? opts.matchSessionStart,
      gsiMap: opts.timeline?.map ?? (game === 'cs2' ? getLatestGsiMap() : getDeadlockMap()),
      customReplayDir: game === 'cs2' ? mainProcess.settingsManager.get().cs2DemoDir : undefined,
      localPlayerName: game === 'cs2'
        ? await resolveCs2LocalPlayerName(mainProcess.settingsManager, mainProcess.authManager)
        : null,
    }
    const parsed = await buildTimelineFromReplay(replayCtx, { pollOnce: true })
    if (!parsed.timeline?.playerKills?.length) {
      log.warn(`[LateClipExtract] ${game} demo still has no kills for clip extraction`)
      mainProcess.logActivity(
        game === 'cs2'
          ? 'CS2 highlight clips skipped — demo missing or player not matched (check Settings → Recording → CS2 name)'
          : 'Deadlock highlight clips skipped — replay missing or still downloading',
      )
      return
    }
    mainProcess.recordingsStore.updateTimeline(opts.savedRecordingId, parsed.timeline)
    mainProcess.notifyRecordingsUpdated()
    log.info(`[LateClipExtract] ${game} demo retry — ${parsed.timeline.playerKills.length} kills, extracting clips`)
    mainProcess.logActivity(`${game === 'cs2' ? 'CS2' : 'Deadlock'} demo loaded — extracting ${parsed.timeline.playerKills.length} kill(s) for highlight clips`)
    await mainProcess.extractKillClipsOnly(opts.readyPath, parsed.timeline, opts.analysisJobId, game)
  }

  /** @deprecated Use retryDemoClips */
  async function retryCs2DemoClips(opts: {
    readyPath: string
    savedRecordingId: string
    timeline: MatchData | null
    matchSessionStart: number
    analysisJobId: string | null
  }): Promise<void> {
    return retryDemoClips({ ...opts, game: 'cs2' })
  }

  function countSessionClips(
    timeline: MatchData | null,
    agent: string | null,
    sessionStart: number,
    ownerId: number | null,
  ): number {
    const matchId = timeline?.matchId ?? null
    const windowStart = sessionStart > 0 ? sessionStart - 60_000 : Date.now() - 4 * 60 * 60 * 1000
    return mainProcess.clipStore.forUser(ownerId).getAll().filter(c => {
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
    ownerId?: number | null
  }): void {
    if (!mainProcess.recordingsStore) return
    const ownerId = opts.ownerId === undefined ? mainProcess.captureOwnerId() : opts.ownerId
    const clipCount = countSessionClips(opts.timeline, opts.agent, opts.sessionStart, ownerId)
    if (opts.requireClips && clipCount === 0) return

    const captureStore = mainProcess.recordingsStore.forUser(ownerId)
    const user = mainProcess.authManager.getUser()
    const matchId = opts.timeline?.matchId ?? null
    const existing = captureStore.findRecentClipOnly({
      matchId,
      agent: opts.agent,
      withinMs: 2 * 60 * 60 * 1000,
    })
    if (existing) {
      captureStore.updateClipOnlyMeta(existing.id, { clipCount, timeline: opts.timeline })
      mainProcess.notifyRecordingsUpdated()
      return
    }

    captureStore.add({
      path: '',
      clipsOnly: true,
      clipOnlyReason: opts.reason,
      clipCount,
      matchId,
      pipelineStatus: 'pending',
      ...resolveUploadPlayerIdentity(opts.game, opts.timeline, user),
      game: opts.game,
      map: opts.map,
      agent: opts.agent,
      gameMode: opts.gameMode,
      timeline: opts.timeline,
    })
    const clipLabel = clipCount === 1 ? '1 highlight clip' : `${clipCount} highlight clips`
    mainProcess.logActivity(
      opts.reason === 'clips_only_mode'
        ? `Match on dashboard — ${clipLabel} (clips-only mode)`
        : `Match on dashboard — ${clipLabel} (no full recording)`,
    )
    mainProcess.notifyRecordingsUpdated()
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
      clipStore: mainProcess.clipStore,
      clipExtractor: mainProcess.clipExtractor,
      upload: (id, moments) => mainProcess.uploadManager.uploadScoutMoments(id, moments),
    })
  }

  /** Heuristic VOD offsets, then overwrite with live recorder stamps when available. */
  function finalizeTimelineOffsetsForClips(timeline: MatchData | null): void {
    if (!timeline) return
    recomputeTimelineVideoOffsets(timeline)
    const stamps = mainProcess.obsRecorder.getLiveKillStamps()
    if (stamps.length === 0) return
    const applied = applyLiveKillStampsToTimeline(timeline, stamps)
    if (applied > 0) {
      log.info(`[LiveKillStamps] Applied ${applied}/${stamps.length} live recording stamp(s)`)
    }
  }

  function lateClipRetryDeps(): LateClipRetryDeps {
    return {
      alignByRoundTimer: (timeline, videoPath) =>
        alignValorantTimelineByRoundTimer(timeline, videoPath, ffmpegFrameReader(ffmpegPath()), log),
      waitUntilAllowed: async () => {
        await mainProcess.obsRecorder.releaseStaleMatchOwnership()
        await waitUntilBackgroundWorkAllowed(mainProcess.matchPriorityDeps(), { logActivity: mainProcess.logActivity })
      },
      retryCs2DemoClips,
      retryDemoClips,
      riotLocalApi: mainProcess.riotLocalApi,
      recordingsStore: mainProcess.recordingsStore,
      mainWindow: mainProcess.mainWindow,
      extractKillClipsOnly: mainProcess.extractKillClipsOnly,
      syncScoutMomentsForJob,
      enrichTimelineSpatial: mainProcess.enrichTimelineSpatial,
      finalizeTimelineOffsetsForClips,
      authManager: mainProcess.authManager,
      settingsManager: mainProcess.settingsManager,
      uploadManager: mainProcess.uploadManager,
      buildCoachingSubmissionExtras,
    }
  }

  async function prepareTimelineForCoaching(
    timeline: MatchData | null,
    game: string,
    recordingId?: string | null,
    ownerId: number | null = getActiveUserId(),
  ): Promise<{ extras: CoachingSubmissionExtras | undefined }> {
    const captureStore = mainProcess.recordingsStore.forUser(ownerId)
    const ownsSession = () => ownerId !== null && getActiveUserId() === ownerId
    if (!timeline) return { extras: undefined }

    if (game === 'lol') {
      await enrichLolTimelineForCoaching(timeline, {
        maxWaitMs: MATCH_DETAILS_ENRICH_MAX_MS,
        onStatus: (msg) => mainProcess.logActivity(msg),
        api: ownsSession() && mainProcess.authManager.getToken() ? mainProcess.authManager.getApi() : null,
        authUser: ownsSession() ? mainProcess.authManager.getUser() : null,
      })

      const status = timeline.lolEnrichStatus
      if (status === 'fetched' || status === 'fetch_failed' || status === 'no_match_id' || status === 'no_auth') {
        mainProcess.logActivity(formatLolLinkActivity({
          status,
          hasGameId: Boolean(timeline.matchId),
          queueId: timeline.queueId,
        }), 'lol')
        if (mainProcess.lastMatchDiagnostic && mainProcess.lastMatchDiagnostic.game === 'lol') {
          mainProcess.lastMatchDiagnostic.lolEnrichStatus = status
          mainProcess.lastMatchDiagnostic.matchDetailsStatus = status
          mainProcess.lastMatchDiagnostic.matchId = timeline.matchId ?? mainProcess.lastMatchDiagnostic.matchId
          mainProcess.lastMatchDiagnostic.queueId = timeline.queueId != null
            ? String(timeline.queueId)
            : mainProcess.lastMatchDiagnostic.queueId
        }
      }

      if (recordingId) {
        captureStore.updateTimeline(recordingId, timeline)
        mainProcess.notifyRecordingsUpdated()
      }

      return { extras: undefined }
    }

    if (game !== 'valorant') return { extras: undefined }

    await enrichTimelineForCoaching(mainProcess.riotLocalApi, timeline, {
      maxWaitMs: MATCH_DETAILS_ENRICH_MAX_MS,
      onStatus: (msg) => mainProcess.logActivity(msg),
      api: ownsSession() && mainProcess.authManager.getToken() ? mainProcess.authManager.getApi() : null,
    })

    const rrHistory = ownsSession() ? await mainProcess.authManager.fetchRRHistory().catch(() => []) : []
    const extras = buildCoachingSubmissionExtras(
      timeline,
      mainProcess.settingsManager.get(),
      rrHistory,
      mainProcess.riotLocalApi.getDiagnostics().clientVersion,
    )

    if (recordingId) {
      captureStore.updateTimeline(recordingId, timeline)
      mainProcess.notifyRecordingsUpdated()
    }

    return { extras }
  }

  return { fetchDeadlockReviewStatus, fetchDeadlockReviewDetail, deadlockReviewDeps, watchDeadlockReview, refreshReplayTimelineForRecording, retrieveReplayTimelineForRecording, retryDemoClips, retryCs2DemoClips, countSessionClips, registerClipOnlySession, syncScoutMomentsForJob, finalizeTimelineOffsetsForClips, lateClipRetryDeps, prepareTimelineForCoaching }
}
