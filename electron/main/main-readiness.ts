import { cs2DemoRetrievalStatus } from './cs2-demo-retrieval'
import { BrowserWindow } from 'electron'
import fs from 'fs'
import { shouldDeferHeavyBackgroundWork } from './match-priority-guard'
import { recomputeTimelineVideoOffsets } from './riot-local-api'
import { getActiveUserId } from './user-session'
import { RecordingsStore, type PendingRecording } from './recordings-store'
import log from 'electron-log'
import { enrichTimelineForCoaching } from './match-coaching-enrich'
import { enrichLolTimelineForCoaching } from './lol-match-v5-enrich'
import { getAnalysisReadiness, isTerminalAnalysisReadinessState, refreshVodProbe, type AnalysisReadiness } from './analysis-readiness'
import { sendPostGameEventForRecording } from './post-game-session'
import { hasRichMatchData, MATCH_DETAILS_ENRICH_MAX_MS, valorantMatchStatsPollIntervalMs } from './match-data-quality'
import type { MainRuntimeBindings } from './main-runtime-context'

export type MainReadinessContext = Pick<MainRuntimeBindings,
  | 'analysisReadinessRefreshGeneration'
  | 'authManager'
  | 'clipExtractor'
  | 'cs2DemoRetrieval'
  | 'linkedRiotFromAuth'
  | 'logActivity'
  | 'matchPriorityDeps'
  | 'maybeAutoEnqueueWhenReady'
  | 'maybeCaptureRiotDnsEvidence'
  | 'notifyRecordingsUpdated'
  | 'postGameWindow'
  | 'prepareTimelineForCoaching'
  | 'recordingsStore'
  | 'riotLocalApi'
>

/** Keeps callbacks bound to the live application state rather than a startup snapshot. */
export function createMainReadiness(mainProcess: MainReadinessContext) {
  function isBlockingVodReadiness(state: AnalysisReadiness['state']): boolean {
    return state === 'file_missing' || state === 'file_unreadable' || state === 'unavailable'
  }

  function sendAnalysisReadinessUpdate(
    recordingId: string,
    targetWindow: BrowserWindow | null | undefined,
    readiness: AnalysisReadiness,
  ): void {
    mainProcess.notifyRecordingsUpdated()
    sendPostGameEventForRecording(
      targetWindow,
      recordingId,
      'post-game:analysis-readiness',
      readiness,
      getActiveUserId(),
    )
  }

  async function refreshRecordingVodProbe(
    rec: NonNullable<ReturnType<RecordingsStore['getById']>>,
  ): Promise<void> {
    if (!rec.path || rec.clipsOnly || rec.fileFinalizing) return
    if (!fs.existsSync(rec.path)) return
    await refreshVodProbe(rec.path, (p) => mainProcess.clipExtractor.probe(p))
  }

  function cancelAnalysisReadinessRefresh(recordingId: string): void {
    mainProcess.analysisReadinessRefreshGeneration.delete(recordingId)
    mainProcess.cs2DemoRetrieval.stop(recordingId)
  }

  async function recoverOrphanedValorantMetadata(rec: PendingRecording): Promise<boolean> {
    if (rec.game !== 'valorant' || !rec.orphanedImport || !rec.timeline) return false
    if (hasRichMatchData(rec.timeline)) return true

    const result = await mainProcess.riotLocalApi.recoverOrphanedTimelineMatchDetails(rec.timeline)
    if (result.status !== 'recovered') {
      mainProcess.recordingsStore.setOrphanRecoveryError(rec.id, result.reason)
      log.info(`[Recordings] Orphan metadata recovery ${result.status}: ${result.reason}`)
      return false
    }

    recomputeTimelineVideoOffsets(rec.timeline)
    mainProcess.recordingsStore.updateTimeline(rec.id, rec.timeline)
    mainProcess.recordingsStore.setOrphanRecoveryError(rec.id, null)
    mainProcess.recordingsStore.clearAnalysisFailure(rec.id)
    mainProcess.logActivity(
      `Recovered recording details${rec.timeline.map ? ` — ${rec.timeline.map}` : ''}`
      + `${rec.timeline.agent ? ` · ${rec.timeline.agent}` : ''}`,
      'valorant',
    )
    mainProcess.notifyRecordingsUpdated()
    return true
  }

  function orphanRecoveryMessage(reason: string | null | undefined): string | null {
    switch (reason) {
      case 'riot_auth_missing':
        return 'Open Riot Client, then tap Retry sync so UpForge can read your recent match history.'
      case 'history_timing_missing':
        return 'Riot match history did not include the timing needed to safely link this recording.'
      case 'no_aligned_match':
        return 'No recent Riot match safely matched this recording’s time and duration.'
      case 'match_details_unavailable':
        return 'Riot match details are not available yet. Keep Riot Client open and retry shortly.'
      case 'file_stat_failed':
      case 'invalid_file_times':
      case 'invalid_recording_duration':
      case 'recording_timing_missing':
        return 'The recording file does not contain reliable timing for safe Riot match recovery.'
      default:
        return null
    }
  }

  function scheduleAnalysisReadinessRefresh(
    recordingId: string,
    game: string,
    opts?: { force?: boolean },
  ): void {
    if (game === 'cs2') {
      mainProcess.cs2DemoRetrieval.start(recordingId)
      return
    }
    if (mainProcess.analysisReadinessRefreshGeneration.has(recordingId) && !opts?.force) return
    const generation = (mainProcess.analysisReadinessRefreshGeneration.get(recordingId) ?? 0) + 1
    mainProcess.analysisReadinessRefreshGeneration.set(recordingId, generation)

    const release = () => {
      if (mainProcess.analysisReadinessRefreshGeneration.get(recordingId) === generation) {
        mainProcess.analysisReadinessRefreshGeneration.delete(recordingId)
      }
    }

    const finish = (readiness: AnalysisReadiness) => {
      mainProcess.notifyRecordingsUpdated()
      const pg = mainProcess.postGameWindow
      if (pg && !pg.isDestroyed()) {
        sendPostGameEventForRecording(
          pg,
          recordingId,
          'post-game:analysis-readiness',
          readiness,
          getActiveUserId(),
        )
      }
    }

    if (game !== 'valorant' && game !== 'lol') {
      setTimeout(() => {
        void (async () => {
          try {
            if (mainProcess.analysisReadinessRefreshGeneration.get(recordingId) !== generation) return
            const rec = mainProcess.recordingsStore.getById(recordingId)
            if (!rec || rec.analysed) return
            await refreshRecordingVodProbe(rec)
            finish(getAnalysisReadiness(rec))
          } finally {
            release()
          }
        })()
      }, 3_000)
      return
    }

    let lastMilestoneLogAt = 0

    const tick = async (): Promise<void> => {
      if (mainProcess.analysisReadinessRefreshGeneration.get(recordingId) !== generation) return

      let rec = mainProcess.recordingsStore.getById(recordingId)
      if (!rec || rec.matchStatsSyncPaused || rec.analysed || rec.pipelineStatus === 'uploading' || rec.pipelineStatus === 'analysing') {
        release()
        return
      }

      const deferring = shouldDeferHeavyBackgroundWork(mainProcess.matchPriorityDeps())

      if (!deferring) {
        await refreshRecordingVodProbe(rec)
      }

      if (mainProcess.analysisReadinessRefreshGeneration.get(recordingId) !== generation) return
      const refreshedAfterProbe = mainProcess.recordingsStore.getById(recordingId)
      if (!refreshedAfterProbe || refreshedAfterProbe.matchStatsSyncPaused) {
        release()
        return
      }
      rec = refreshedAfterProbe

      if (rec.orphanedImport && rec.timeline && !hasRichMatchData(rec.timeline)) {
        await recoverOrphanedValorantMetadata(rec)
        if (mainProcess.analysisReadinessRefreshGeneration.get(recordingId) !== generation) return
        const refreshedAfterRecovery = mainProcess.recordingsStore.getById(recordingId)
        if (!refreshedAfterRecovery || refreshedAfterRecovery.matchStatsSyncPaused) {
          release()
          return
        }
        rec = refreshedAfterRecovery
      }

      let readiness = getAnalysisReadiness(rec)
      if (isTerminalAnalysisReadinessState(readiness.state)) {
        finish(readiness)
        if (readiness.ready) mainProcess.maybeAutoEnqueueWhenReady(recordingId)
        release()
        return
      }

      if ((readiness.state === 'syncing' || readiness.state === 'waiting_match_data') && rec.timeline) {
        try {
          if (game === 'lol') {
            await enrichLolTimelineForCoaching(rec.timeline, {
              maxWaitMs: 20_000,
              api: mainProcess.authManager.getToken() ? mainProcess.authManager.getApi() : null,
              authUser: mainProcess.authManager.getUser(),
              onStatus: (msg) => mainProcess.logActivity(msg),
            })
          } else {
            await enrichTimelineForCoaching(mainProcess.riotLocalApi, rec.timeline, {
              maxWaitMs: 20_000,
              api: mainProcess.authManager.getToken() ? mainProcess.authManager.getApi() : null,
            })
          }
          if (mainProcess.analysisReadinessRefreshGeneration.get(recordingId) !== generation) return
          const current = mainProcess.recordingsStore.getById(recordingId)
          if (!current || current.matchStatsSyncPaused) {
            release()
            return
          }
          mainProcess.recordingsStore.updateTimeline(recordingId, rec.timeline)
          mainProcess.maybeCaptureRiotDnsEvidence()
        } catch { /* retry on next tick */ }
        readiness = getAnalysisReadiness(rec)
      }

      finish(readiness)
      if (readiness.ready) {
        mainProcess.maybeAutoEnqueueWhenReady(recordingId)
      }
      if (isTerminalAnalysisReadinessState(readiness.state)) {
        release()
        return
      }

      // Soft-poll for the life of the session — no hard stop. Back off as the
      // recording ages so sitting in MENUS does not hammer Riot.
      const ageMs = Math.max(0, Date.now() - rec.recordedAt)
      const pollMs = valorantMatchStatsPollIntervalMs(ageMs, deferring)

      if (
        (readiness.state === 'syncing' || readiness.state === 'waiting_match_data')
        && ageMs >= MATCH_DETAILS_ENRICH_MAX_MS
        && Date.now() - lastMilestoneLogAt >= 5 * 60_000
      ) {
        lastMilestoneLogAt = Date.now()
        mainProcess.logActivity(
          `Still fetching Riot match stats (${Math.round(ageMs / 60_000)}m) — keep Valorant open, or tap Retry sync`,
        )
      }

      setTimeout(() => { void tick() }, pollMs)
    }

    setTimeout(() => { void tick() }, opts?.force ? 0 : 3_000)
  }

  /** Re-open path: resume Riot MatchDetails polling for pending VODs still missing stats. */
  function resumeStuckMatchStatsEnrichment(): void {
    if (!mainProcess.recordingsStore) return
    const pending = mainProcess.recordingsStore.getPending(mainProcess.linkedRiotFromAuth())
    let resumed = 0
    for (const rec of pending) {
      if (rec.analysed) continue
      if (rec.matchStatsSyncPaused) continue
      if (rec.game === 'cs2') {
        // Already gave up this session (Steam will not list it): wait for a manual attach / Scan.
        if (!cs2DemoRetrievalStatus.get(rec.id)?.needsManual) mainProcess.cs2DemoRetrieval.start(rec.id)
        continue
      }
      if (rec.game !== 'valorant' && rec.game !== 'lol') continue
      if (rec.pipelineStatus === 'uploading' || rec.pipelineStatus === 'analysing') continue
      const readiness = getAnalysisReadiness(rec)
      if (readiness.state !== 'waiting_match_data' && readiness.state !== 'syncing') continue
      const before = mainProcess.analysisReadinessRefreshGeneration.has(rec.id)
      scheduleAnalysisReadinessRefresh(rec.id, rec.game)
      if (!before && mainProcess.analysisReadinessRefreshGeneration.has(rec.id)) resumed += 1
    }
    if (resumed > 0) {
      mainProcess.logActivity(
        resumed === 1
          ? 'Retrying Riot match stats for 1 pending recording…'
          : `Retrying Riot match stats for ${resumed} pending recordings…`,
      )
    }
  }

  async function ensureAnalysisReadinessForAnalyse(
    recordingId: string,
  ): Promise<
    | { ok: true; recording: NonNullable<ReturnType<RecordingsStore['getById']>> }
    | { ok: false; error: string; state: string }
  > {
    let rec = mainProcess.recordingsStore.getById(recordingId)
    if (!rec) return { ok: false, error: 'Recording not found', state: 'unavailable' }

    await refreshRecordingVodProbe(rec)

    let readiness = getAnalysisReadiness(rec)
    if (readiness.ready) return { ok: true, recording: rec }

    if (readiness.state === 'finalizing' && rec.path && fs.existsSync(rec.path)) {
      for (let attempt = 0; attempt < 6 && readiness.state === 'finalizing'; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2_000))
        await refreshRecordingVodProbe(rec)
        rec = mainProcess.recordingsStore.getById(recordingId)
        if (!rec) return { ok: false, error: 'Recording not found', state: 'unavailable' }
        readiness = getAnalysisReadiness(rec)
      }
    }

    if (readiness.ready) return { ok: true, recording: rec }

    const shouldRetryRiotEnrich =
      (rec.game === 'valorant' || rec.game === 'lol')
      && rec.timeline
      && (
        readiness.state === 'syncing'
        || readiness.state === 'waiting_match_data'
        || readiness.state === 'unavailable'
      )

    if (shouldRetryRiotEnrich) {
      mainProcess.logActivity(
        readiness.state === 'syncing' || readiness.state === 'waiting_match_data'
          ? readiness.message
          : 'Fetching match stats from Riot…',
      )
      await mainProcess.prepareTimelineForCoaching(rec.timeline!, rec.game, recordingId)
      rec = mainProcess.recordingsStore.getById(recordingId)
      if (!rec) return { ok: false, error: 'Recording not found', state: 'unavailable' }
      await refreshRecordingVodProbe(rec)
      readiness = getAnalysisReadiness(rec)
      mainProcess.notifyRecordingsUpdated()
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
      let rec = mainProcess.recordingsStore.getById(recordingId)
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
      sendAnalysisReadinessUpdate(recordingId, targetWindow, readiness)

      if (readiness.ready) return { ready: true, readiness }
      if (isTerminalAnalysisReadinessState(readiness.state) && !readiness.ready) {
        return { ready: false, readiness }
      }

      if (
        (readiness.state === 'syncing' || readiness.state === 'waiting_match_data')
        && (rec.game === 'valorant' || rec.game === 'lol')
        && rec.timeline
      ) {
        await mainProcess.prepareTimelineForCoaching(rec.timeline, rec.game, recordingId)
        rec = mainProcess.recordingsStore.getById(recordingId)
        if (rec) {
          await refreshRecordingVodProbe(rec)
          readiness = getAnalysisReadiness(rec)
          sendAnalysisReadinessUpdate(recordingId, targetWindow, readiness)
          if (readiness.ready) return { ready: true, readiness }
          if (isTerminalAnalysisReadinessState(readiness.state) && !readiness.ready) {
            return { ready: false, readiness }
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 5_000))
    }

    const rec = mainProcess.recordingsStore.getById(recordingId)
    const readiness = rec ? getAnalysisReadiness(rec) : {
      ready: false,
      state: 'unavailable' as const,
      message: 'Timed out waiting for match data',
      duelMomentCount: 0,
    }
    sendAnalysisReadinessUpdate(recordingId, targetWindow, readiness)
    return { ready: readiness.ready, readiness }
  }

  return { isBlockingVodReadiness, sendAnalysisReadinessUpdate, refreshRecordingVodProbe, cancelAnalysisReadinessRefresh, recoverOrphanedValorantMetadata, orphanRecoveryMessage, scheduleAnalysisReadinessRefresh, resumeStuckMatchStatsEnrichment, ensureAnalysisReadinessForAnalyse, waitUntilAnalysisReady }
}
