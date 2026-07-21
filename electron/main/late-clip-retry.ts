/**
 * Late match-details / demo retry — scheduled ~90s after match end when the
 * initial timeline had no kill data. Consolidates three duplicate blocks from index.ts.
 */

import log from 'electron-log'
import type { BrowserWindow } from 'electron'
import type { AuthManager } from './auth-manager'
import type { RecordingsStore } from './recordings-store'
import type { UploadManager } from './upload-manager'
import type { RiotLocalApi } from './riot-local-api'
import type { MatchData } from './riot-types'
import type { SettingsManager } from './settings-manager'
import type { CoachingSubmissionExtras } from './match-coaching-context'
import { normalizeGameId } from './game-capabilities'

export interface LateClipRetryContext {
  game: string
  readyPath: string
  savedRecordingId: string
  timeline: MatchData | null
  matchSessionStart: number
  matchId: string | null
}

export interface LateClipRetryOptions {
  analysisJobId: string | null
  /** Patch uploaded job match_data when Riot details arrive (auto-analyse path). */
  patchJobWhenReady?: boolean
  onAfterCs2Retry?: () => void
  onFinally?: () => void
}

export interface LateClipRetryDeps {
  waitUntilAllowed: () => Promise<void>
  retryCs2DemoClips: (opts: {
    readyPath: string
    savedRecordingId: string
    timeline: MatchData | null
    matchSessionStart: number
    analysisJobId: string | null
  }) => Promise<void>
  riotLocalApi: Pick<
    RiotLocalApi,
    'fetchMatchDetailsLate' | 'populateMatchDataFromDetails' | 'getDiagnostics' | 'enrichTimelineMatchDetails'
  >
  recordingsStore: Pick<RecordingsStore, 'updateTimeline'>
  mainWindow: BrowserWindow | null
  extractKillClipsOnly: (
    videoPath: string,
    timeline: MatchData,
    analysisJobId: string | null,
    game: string,
  ) => Promise<void>
  syncScoutMomentsForJob: (
    jobId: string | null,
    videoPath: string,
    timeline: MatchData | null,
  ) => Promise<void>
  enrichTimelineSpatial: (timeline: MatchData) => void
  /** Recompute heuristic offsets then apply live kill stamps. */
  finalizeTimelineOffsetsForClips: (timeline: MatchData | null) => void
  authManager: Pick<AuthManager, 'fetchRRHistory'>
  settingsManager: SettingsManager
  uploadManager: Pick<UploadManager, 'patchMatchData'>
  buildCoachingSubmissionExtras: (
    timeline: MatchData,
    settings: ReturnType<SettingsManager['get']>,
    rrHistory: Awaited<ReturnType<AuthManager['fetchRRHistory']>>,
    clientVersion: string | null | undefined,
  ) => CoachingSubmissionExtras
}

export async function runLateClipRetry(
  ctx: LateClipRetryContext,
  deps: LateClipRetryDeps,
  opts: LateClipRetryOptions,
): Promise<void> {
  await deps.waitUntilAllowed()
  const game = normalizeGameId(ctx.game)

  if (game === 'cs2') {
    await deps.retryCs2DemoClips({
      readyPath: ctx.readyPath,
      savedRecordingId: ctx.savedRecordingId,
      timeline: ctx.timeline,
      matchSessionStart: ctx.matchSessionStart,
      analysisJobId: opts.analysisJobId,
    })
    opts.onAfterCs2Retry?.()
    return
  }

  const timeline = ctx.timeline
  if (!timeline) {
    log.warn('[LateClipExtract] No timeline — cannot fetch details')
    return
  }

  // Recover matchId via Riot match history when the WS capture missed it.
  if (!timeline.matchId) {
    log.info('[LateClipExtract] No match id — trying Riot history fallback via enrich')
    const recovered = await deps.riotLocalApi.enrichTimelineMatchDetails(timeline, {
      forceRefresh: true,
      maxWaitMs: 90_000,
    })
    if (timeline.matchId) {
      deps.recordingsStore.updateTimeline(ctx.savedRecordingId, timeline)
      deps.mainWindow?.webContents.send('recordings:updated')
      log.info('[LateClipExtract] Recovered match id from history:', timeline.matchId)
    } else if (!recovered) {
      log.warn('[LateClipExtract] Still no match id after history fallback')
      return
    }
  }

  if (!timeline.matchId) {
    log.warn('[LateClipExtract] No match id — cannot fetch details')
    return
  }

  log.info('[LateClipExtract] Fetching match details for', timeline.matchId)
  const details = await deps.riotLocalApi.fetchMatchDetailsLate(timeline.matchId)
  if (!details) {
    log.warn('[LateClipExtract] Match details still unavailable after delay')
    return
  }

  timeline.matchDetails = details
  deps.riotLocalApi.populateMatchDataFromDetails(timeline, details)
  deps.finalizeTimelineOffsetsForClips(timeline)
  deps.recordingsStore.updateTimeline(ctx.savedRecordingId, timeline)
  deps.mainWindow?.webContents.send('recordings:updated')

  if (opts.patchJobWhenReady) {
    const gotData = (timeline.roundSummaries?.length ?? 0) > 0
      || (timeline.playerKills?.length ?? 0) > 0
    if (!gotData) {
      log.warn('[LateClipExtract] Match details fetched but no round/kill data for this player')
      return
    }
  }

  if ((timeline.playerKills?.length ?? 0) === 0) {
    log.warn('[LateClipExtract] No kills after retry')
    return
  }

  if (opts.patchJobWhenReady && opts.analysisJobId) {
    deps.enrichTimelineSpatial(timeline)
    const rrHistory = await deps.authManager.fetchRRHistory().catch(() => [])
    const lateExtras = deps.buildCoachingSubmissionExtras(
      timeline,
      deps.settingsManager.get(),
      rrHistory,
      deps.riotLocalApi.getDiagnostics().clientVersion,
    )
    await deps.uploadManager.patchMatchData(opts.analysisJobId, timeline, lateExtras).catch((err) => {
      log.warn('[LateClipExtract] Failed to patch job match_data:', err)
    })
  }

  log.info(`[LateClipExtract] Got ${timeline.playerKills.length} kills — extracting clips`)
  await deps.extractKillClipsOnly(ctx.readyPath, timeline, opts.analysisJobId, ctx.game)

  if (opts.patchJobWhenReady) {
    await deps.syncScoutMomentsForJob(opts.analysisJobId, ctx.readyPath, timeline)
  }
}

export function scheduleLateClipRetry(
  ctx: LateClipRetryContext,
  deps: LateClipRetryDeps,
  opts: LateClipRetryOptions,
  delayMs = 90_000,
): void {
  setTimeout(() => {
    void runLateClipRetry(ctx, deps, opts)
      .catch((err) => log.warn('[LateClipExtract] Error:', err))
      .finally(() => { opts.onFinally?.() })
  }, delayMs)
}
