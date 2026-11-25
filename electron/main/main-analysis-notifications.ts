import { matchPollPause } from './poll-pause'
import { BrowserWindow } from 'electron'
import { join } from 'path'
import { showAppNotification } from './app-notifications'
import { addReady, readReadyFile, writeReadyFile, type ReadyAnalysis } from './ready-analyses'
import { RecordingPreparationError } from './vod-compressor'
import { gameLabel, idleTooltip } from './game-config'
import { clearPendingJob } from './upload-manager'
import { getActiveUserId } from './user-session'
import { userDataRoot } from './user-data-paths'
import { extractAnalysisIdFromPollStatus } from './analysis-completion'
import { type AnalysisPollStatus } from './analysis-poll'
import { reconcileStuckAnalysisJobs, type ReconciledAnalysisContext } from './stuck-analysis-reconciler'
import { buildAnalysisErrorPayload, classifyAnalysisFailure, formatAnalysisFailureMessage, isDegradedTelemetryResult, type AnalysisErrorPayload } from './analysis-failure-messages'
import { parseDuelFailureDiagnostics, diagnosticsSummary, type DuelFailureDiagnostics } from '../../src/lib/duel-diagnostics'
import { trackUploadFailed, trackAnalysisDegraded } from './funnel-events'
import { classifyActivationError } from './activation-error-codes'
import { parseMatchHighlightsFromApi } from '../../src/lib/match-highlights'
import { extractSpatialFromAnalysisPayload } from '../../src/lib/analysis-enrichment'
import { analysisScoreText, coachingReadyBody } from '../../src/lib/analysis-ready-copy'
import { reportPipelineError, shouldReportAnalysisPipelineError } from './pipeline-errors'
import { isLikelyNetworkFailure, noteUploadNetworkFailure } from './network-diagnostics'
import { isPostGameSessionForRecording, sendPostGameEvent, sendPostGameEventForRecording } from './post-game-session'
import type { MainRuntimeBindings } from './main-runtime-context'

export type MainAnalysisNotificationsContext = Pick<MainRuntimeBindings,
  | 'FAILURE_NOTIFY_COOLDOWN_MS'
  | 'authManager'
  | 'captureNetworkEvidence'
  | 'focusMainWindow'
  | 'logActivity'
  | 'mainWindow'
  | 'matchPerformanceModeActive'
  | 'mergeSpatialSummary'
  | 'notifyRecordingsUpdated'
  | 'notifySilent'
  | 'obsRecorder'
  | 'postGameWindow'
  | 'recentFailureNotifications'
  | 'recordingsStore'
  | 'resumePollForJob'
  | 'startupFailures'
  | 'stuckAnalysisReconcileTimer'
  | 'tray'
  | 'uploadManager'
>

/** Keeps callbacks bound to the live application state rather than a startup snapshot. */
export function createMainAnalysisNotifications(mainProcess: MainAnalysisNotificationsContext) {
  function dispatchReconciledAnalysisReady(ctx: ReconciledAnalysisContext): void {
    const result = ctx.status.result as Record<string, unknown> | undefined
    const analysisId = extractAnalysisIdFromPollStatus(ctx.status)
    const score = typeof result?.overall_score === 'number' ? result.overall_score : undefined

    if (ctx.recordingId) {
      if (analysisId != null) {
        mainProcess.recordingsStore.markAnalysed(ctx.recordingId, ctx.jobId, analysisId)
        mainProcess.recordingsStore.setAnalysisId(ctx.recordingId, analysisId)
      } else {
        mainProcess.recordingsStore.clearAnalysisPipeline(ctx.recordingId)
      }
      mainProcess.notifyRecordingsUpdated()
    }

    clearPendingJob(ctx.jobId)
    const scoreText = analysisScoreText(result)
    mainProcess.logActivity(`Analysis ready${scoreText ? ` — ${scoreText}` : ''}`)

    const rec = ctx.recordingId
      ? mainProcess.recordingsStore.getById(ctx.recordingId)
      : mainProcess.recordingsStore.getByJobId(ctx.jobId)
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
      spatial_summary: mainProcess.mergeSpatialSummary(
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
      report_type: result?.report_type ?? null,
      coaching_source: result?.coaching_source ?? null,
      limitations: result?.limitations ?? [],
      is_degraded: result?.is_degraded ?? false,
      telemetry_fallback_used: result?.telemetry_fallback_used ?? false,
    }

    if (isDegradedTelemetryResult(payload)) {
      trackAnalysisDegraded({
        job_id: ctx.jobId,
        recording_id: ctx.recordingId ?? undefined,
        report_type: payload.report_type ?? 'degraded_telemetry',
      })
    }

    if (ctx.recordingId && mainProcess.postGameWindow && !mainProcess.postGameWindow.isDestroyed()) {
      sendPostGameEventForRecording(
        mainProcess.postGameWindow,
        ctx.recordingId,
        'post-game:analysis-ready',
        payload,
        getActiveUserId(),
      )
    }
    mainProcess.mainWindow?.webContents.send('dashboard:refresh')

    notifyCoachingReady(coachingReadyBody(ctx.agent ?? gameLabel(ctx.game), ctx.map, result), analysisId ?? undefined, { game: ctx.game, label: ctx.agent ?? gameLabel(ctx.game), map: ctx.map })
    mainProcess.tray?.setToolTip(idleTooltip(ctx.game))
  }

  function logAnalysisFailureActivity(rawError: string, diagnostics: DuelFailureDiagnostics | null): void {
    if (diagnostics) {
      mainProcess.logActivity(`Analysis failed: ${diagnosticsSummary(diagnostics)}`)
      return
    }
    mainProcess.logActivity(`Analysis failed: ${formatAnalysisFailureMessage(rawError)}`)
  }

  function extractFailureDiagnostics(status?: AnalysisPollStatus | null): DuelFailureDiagnostics | null {
    if (!status) return null
    const fromTop = status.failure_diagnostics
    const fromResult = status.result?.failure_diagnostics
    return parseDuelFailureDiagnostics(fromTop ?? fromResult)
  }

  function titleForActivationCode(code: string, fallback: string): string {
    if (code.startsWith('upload_')) return 'Upload failed'
    if (code.startsWith('preparation_') || code.startsWith('recording_')) return 'Recording not ready'
    if (code.startsWith('obs_')) return 'OBS needs attention'
    return fallback
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
    const classified = classifyActivationError(rawError)
    const presentation = classifyAnalysisFailure(rawError)
    const payload = buildAnalysisErrorPayload(rawError, {
      recordingId: opts.recordingId ?? undefined,
      needsUpgrade: opts.needsUpgrade,
      upgradeUrl: opts.upgradeUrl,
      ppaUrl: opts.ppaUrl,
      clipsOnly: opts.clipsOnly,
      failureDiagnostics: opts.failureDiagnostics ?? null,
      failureCode: classified.code,
      recoveryAction: classified.definition.recoveryAction,
      ...(classified.code !== 'unknown'
        ? {
            message: opts.preparationDiagnostics ? rawError : classified.definition.userMessage,
            title: presentation.title === 'Analysis could not complete'
              ? titleForActivationCode(classified.code, presentation.title)
              : presentation.title,
          }
        : {}),
    })

    // A duplicate caller does not own the active pipeline or its progress UI.
    if (classified.code === 'upload_already_in_progress') return payload

    if (opts.recordingId) {
      const existing = mainProcess.recordingsStore.getById(opts.recordingId)
      // Skip duplicate dispatches when this recording already failed (reconciler / poll retries).
      if (existing?.lastAnalysisError && !existing.pipelineStatus) {
        return payload
      }
    }

    if (opts.recordingId) {
      mainProcess.recordingsStore.setAnalysisFailure(opts.recordingId, payload.message, {
        hint: payload.hint,
        creditRefunded: payload.creditRefunded,
        failureCode: payload.failureCode,
        failureDiagnostics: (opts.failureDiagnostics ?? payload.failureDiagnostics ?? null) as
          | Record<string, unknown>
          | null
          | undefined,
      })
    }

    if (opts.recordingId) {
      const modal = mainProcess.postGameWindow
        && !mainProcess.postGameWindow.isDestroyed()
        && isPostGameSessionForRecording(opts.recordingId, getActiveUserId())
        ? mainProcess.postGameWindow
        : null
      sendPostGameEventForRecording(
        modal,
        opts.recordingId,
        'post-game:upload-error',
        payload,
        getActiveUserId(),
      )
    } else if (opts.targetWindow && !opts.targetWindow.isDestroyed()) {
      sendPostGameEvent(opts.targetWindow, 'post-game:upload-error', payload)
    }

    mainProcess.mainWindow?.webContents.send('dashboard:analysis-failed', payload)
    mainProcess.notifyRecordingsUpdated()

    const failureRecording = opts.recordingId ? mainProcess.recordingsStore.getById(opts.recordingId) : null
    if (shouldReportAnalysisPipelineError(payload.kind, rawError)) {
      reportPipelineError('analysis', rawError.slice(0, 500) || payload.title, {
        kind: payload.kind,
        title: payload.title,
        message: payload.message,
        recordingId: opts.recordingId ?? null,
        jobId: failureRecording?.jobId ?? null,
        map: failureRecording?.map ?? null,
        agent: failureRecording?.agent ?? null,
        integrityReason: opts.failureDiagnostics?.integrity_reason ?? null,
        clipsUploaded: opts.failureDiagnostics?.clips_uploaded ?? null,
        clipsRequested: opts.failureDiagnostics?.clips_requested ?? null,
        preparation: opts.preparationDiagnostics,
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
      const lastNotified = mainProcess.recentFailureNotifications.get(notifyKey)
      const cooldownOk = !lastNotified || now - lastNotified >= mainProcess.FAILURE_NOTIFY_COOLDOWN_MS
      if (!alreadyNotifiedThisRecording && cooldownOk) {
        mainProcess.recentFailureNotifications.set(notifyKey, now)
        const notifBody = payload.hint
          ? `${payload.message} ${payload.hint}`
          : payload.message
        showAppNotification({
          title: payload.creditRefunded ? `${payload.title} — credit refunded` : payload.title,
          body: notifBody.length > 220 ? `${notifBody.slice(0, 217)}…` : notifBody,
          silent: mainProcess.notifySilent(),
        })
        if (opts.recordingId) mainProcess.recordingsStore.markAnalysisFailureNotified(opts.recordingId)
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
      game?: string
      preparationDiagnostics?: RecordingPreparationError['diagnostics']
    } = {},
  ): AnalysisErrorPayload {
    if (classifyActivationError(rawError).code === 'upload_already_in_progress') {
      return dispatchAnalysisFailure(rawError, opts)
    }
    if (opts.game === 'valorant') {
      trackUploadFailed(rawError, 'valorant')
    }
    // Ensure quota walls always carry needsUpgrade for UI + phase mapping
    const classifiedKind = classifyAnalysisFailure(rawError).kind
    const needsUpgrade = opts.needsUpgrade ?? (classifiedKind === 'quota' || classifiedKind === 'quota_required')
    if (isLikelyNetworkFailure(rawError)) {
      noteUploadNetworkFailure(rawError)
      void mainProcess.captureNetworkEvidence('upload-failure')
    }
    return dispatchAnalysisFailure(rawError, {
      ...opts,
      needsUpgrade,
      notify: opts.notify ?? false,
    })
  }

  /** Per-account file (not settings): other screens save settings objects that don't carry this list. */
  function readyAnalysesFile(): string | null {
    const userId = getActiveUserId()
    return userId == null ? null : join(userDataRoot(userId), 'ready-analyses.json')
  }

  function readyAnalysesList(): ReadyAnalysis[] {
    const file = readyAnalysesFile()
    return file ? readReadyFile(file) : []
  }

  function saveReadyAnalyses(list: ReadyAnalysis[]): void {
    const file = readyAnalysesFile()
    if (!file) return
    writeReadyFile(file, list)
    mainProcess.mainWindow?.webContents.send('analyses:ready-changed', list)
  }

  function notifyCoachingReady(
    body: string,
    analysisId?: number | null,
    ready?: { game: string; label: string; map?: string | null },
  ): void {
    if (analysisId != null && ready) {
      saveReadyAnalyses(addReady(readyAnalysesList(), {
        analysisId,
        game: ready.game,
        label: ready.label,
        map: ready.map ?? null,
        readyAt: new Date().toISOString(),
      }))
    }
    showAppNotification({
      title: 'Coaching ready',
      body,
      silent: mainProcess.notifySilent(),
      // Players often queue straight into the next match: show it when that recording ends.
      deferWhileRecording: true,
      onClick: () => {
        mainProcess.focusMainWindow()
        if (analysisId != null) {
          mainProcess.mainWindow?.webContents.send('dashboard:open-latest-analysis', { analysisId })
        }
      },
    })
  }

  function runStuckAnalysisReconcile(): Promise<number> {
    if (!mainProcess.authManager.isAuthenticated()) return Promise.resolve(0)
    if (mainProcess.matchPerformanceModeActive || mainProcess.obsRecorder.isActivelyRecording()) return Promise.resolve(0)
    return reconcileStuckAnalysisJobs({
      uploadManager: mainProcess.uploadManager,
      recordingsStore: mainProcess.recordingsStore,
      isAuthenticated: () => mainProcess.authManager.isAuthenticated(),
      reconcileOrphanedAnalyses: async () => {
        await mainProcess.authManager.getApi().post('/api/analysis/reconcile').catch(() => {})
      },
      fetchRecentAnalyses: async () => {
        const rows = await mainProcess.authManager.fetchAnalyses(30)
        return rows.map((a) => ({ id: a.id, job_id: a.job_id, overall_score: a.overall_score }))
      },
      onCompleted: dispatchReconciledAnalysisReady,
      onFailed: ({ jobId, error, recordingId, status }) => {
        mainProcess.startupFailures.note({ key: `analysis:${jobId}`, kind: 'analysis' })
        dispatchAnalysisFailure(error, {
          recordingId,
          notify: false,
          failureDiagnostics: extractFailureDiagnostics(status),
        })
        logAnalysisFailureActivity(error, extractFailureDiagnostics(status))
        mainProcess.mainWindow?.webContents.send('dashboard:refresh')
      },
      resumePoll: (jobId, context) => {
        void mainProcess.resumePollForJob(jobId, context)
      },
    })
  }

  function startStuckAnalysisReconciler(): void {
    if (mainProcess.stuckAnalysisReconcileTimer) return
    void runStuckAnalysisReconcile()
    mainProcess.stuckAnalysisReconcileTimer = setInterval(matchPollPause.guard('stuck-analysis-reconcile', () => { void runStuckAnalysisReconcile() }), 2 * 60 * 1000)
  }

  function stopStuckAnalysisReconciler(): void {
    if (mainProcess.stuckAnalysisReconcileTimer) {
      clearInterval(mainProcess.stuckAnalysisReconcileTimer)
      mainProcess.stuckAnalysisReconcileTimer = null
    }
  }

  return { dispatchReconciledAnalysisReady, logAnalysisFailureActivity, extractFailureDiagnostics, titleForActivationCode, dispatchAnalysisFailure, sendUploadFailure, readyAnalysesFile, readyAnalysesList, saveReadyAnalyses, notifyCoachingReady, runStuckAnalysisReconcile, startStuckAnalysisReconciler, stopStuckAnalysisReconciler }
}
