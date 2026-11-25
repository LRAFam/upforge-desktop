import { openExternalSafe } from './shell-open'
import { insightText as insightTextFrom } from '../../src/lib/last-insight'
import { BrowserWindow } from 'electron'
import fs from 'fs'
import { showAppNotification } from './app-notifications'
import { MAX_RECORDING_FILE_BYTES, formatRecordingTooLargeMessage } from './recording-limits'
import { RecordingPreparationError, resolveUploadVideoPath, deleteCompressedSibling } from './vod-compressor'
import { waitUntilBackgroundWorkAllowed, shouldDeferHeavyBackgroundWork } from './match-priority-guard'
import { AccountChangedError, snapshotAccountOwner } from './account-scope'
import { POST_MATCH_COPY } from '../../src/lib/post-match-copy'
import { recomputeTimelineVideoOffsets } from './riot-local-api'
import { gameLabel, idleTooltip, resolveGameMode } from './game-config'
import { clearPendingJob } from './upload-manager'
import { UploadRequestError } from './upload-request-errors'
import { resolveUploadPlayerIdentity } from './upload-player-identity'
import { getActiveUserId } from './user-session'
import { extractAnalysisIdFromPollStatus } from './analysis-completion'
import { wasBackgroundWorkInterrupted } from './background-interrupt'
import { startAnalysisPoll, stopActiveAnalysisPoll, reconcileOrphanedJob } from './analysis-poll'
import { buildAnalysisErrorPayload, isDegradedTelemetryResult, type AnalysisErrorPayload } from './analysis-failure-messages'
import { trackUploadStarted, trackQuotaReached, trackUpgradePromptShown, trackFirstAnalysis, trackSecondAnalysis, trackAnalysisDegraded } from './funnel-events'
import { UpgradeRequiredError } from './errors'
import { mergeSkillProfileFromAnalysis } from '../../src/lib/skill-profile'
import { parseMatchHighlightsFromApi } from '../../src/lib/match-highlights'
import { extractSpatialFromAnalysisPayload } from '../../src/lib/analysis-enrichment'
import { desktopVodResultsUrl, isPrimaryGame } from '../../src/lib/games'
import { analysisScoreText, coachingReadyBody } from '../../src/lib/analysis-ready-copy'
import type { MatchData } from './riot-types'
import log from 'electron-log'
import { reportPipelineError } from './pipeline-errors'
import { extractAndUploadDuelClips, countMomentsWithClipKeys, selectRecordedDuelMoments } from './duel-clip-uploader'
import { enrichTimelineForCoaching } from './match-coaching-enrich'
import { sendPostGameEvent, sendPostGameEventForRecording } from './post-game-session'
import { hasRichMatchData, MATCH_DETAILS_ENRICH_MAX_MS } from './match-data-quality'
import { buildCoachingSubmissionExtras, type CoachingSubmissionExtras } from './match-coaching-context'
import type { MainRuntimeBindings } from './main-runtime-context'

export type MainAnalysisContext = Pick<MainRuntimeBindings,
  | 'activeMatchTelemetry'
  | 'activeUploadRecordingIds'
  | 'analysisPipelineSingleFlight'
  | 'authManager'
  | 'clearDeferredUploadRetryPersisted'
  | 'clipExtractor'
  | 'dispatchAnalysisFailure'
  | 'dispatchReconciledAnalysisReady'
  | 'enrichTimelineSpatial'
  | 'extractFailureDiagnostics'
  | 'extractMatchClips'
  | 'finalizeTimelineOffsetsForClips'
  | 'lastMatchDiagnostic'
  | 'logActivity'
  | 'logAnalysisFailureActivity'
  | 'mainWindow'
  | 'matchPriorityDeps'
  | 'maybeDeleteLocalRecordingAfterAnalysis'
  | 'mergeSpatialSummary'
  | 'notifyCoachingReady'
  | 'notifyRecordingsUpdated'
  | 'notifySilent'
  | 'obsRecorder'
  | 'prepareTimelineForCoaching'
  | 'reconcileInterruptedUploads'
  | 'recordingsStore'
  | 'registerDeferredUploadRetryPersisted'
  | 'riotLocalApi'
  | 'runStuckAnalysisReconcile'
  | 'sendUploadFailure'
  | 'settingsManager'
  | 'startupFailures'
  | 'tray'
  | 'uploadManager'
>

/** Keeps callbacks bound to the live application state rather than a startup snapshot. */
export function createMainAnalysis(mainProcess: MainAnalysisContext) {
  async function handleOrphanedJobAtStartup(
    orphanedJob: { job_id: string; savedAt: number; agent?: string; map?: string; game?: string }
  ): Promise<void> {
    const ownerUserId = getActiveUserId()
    const context = {
      agent: orphanedJob.agent,
      map: orphanedJob.map,
      game: orphanedJob.game ?? 'valorant',
    }

    const decision = await reconcileOrphanedJob(mainProcess.uploadManager, orphanedJob)
    if (getActiveUserId() !== ownerUserId) return

    if (decision.action === 'discard') {
      clearPendingJob(orphanedJob.job_id, ownerUserId)
      mainProcess.reconcileInterruptedUploads()
      mainProcess.logActivity(`Cleared stale analysis job (${decision.reason})`)
      return
    }

    if (decision.action === 'failed') {
      clearPendingJob(orphanedJob.job_id, ownerUserId)
      const rec = mainProcess.recordingsStore.getByJobId(orphanedJob.job_id)
      mainProcess.startupFailures.note({ key: `analysis:${orphanedJob.job_id}`, kind: 'analysis' })
      mainProcess.dispatchAnalysisFailure(decision.error, { recordingId: rec?.id ?? null, notify: false })
      mainProcess.logActivity(`Previous analysis failed: ${decision.error}`)
      mainProcess.tray?.setToolTip(idleTooltip(context.game))
      return
    }

    if (decision.action === 'completed') {
      mainProcess.dispatchReconciledAnalysisReady({
        jobId: orphanedJob.job_id,
        status: decision.status,
        recordingId: mainProcess.recordingsStore.getByJobId(orphanedJob.job_id)?.id ?? null,
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
    mainProcess.logActivity(`Resuming analysis poll for job ${jobId}`)
    mainProcess.tray?.setToolTip('UpForge — Analysing (resumed)…')

    startAnalysisPoll({
      uploadManager: mainProcess.uploadManager,
      jobId,
      mainWindow: mainProcess.mainWindow,
      onProgress: (status) => {
        const rec = mainProcess.recordingsStore.getByJobId(jobId)
        if (!rec) return
        const raw = status.progress
        const progress = typeof raw === 'number' && !Number.isNaN(raw)
          ? Math.min(100, Math.max(0, Math.round(raw)))
          : status.status === 'queued' ? 0 : 5
        mainProcess.recordingsStore.setAnalysisProgress(rec.id, progress, status.current_step ?? null)
        mainProcess.notifyRecordingsUpdated()
      },
      onCompleted: (status) => {
        const score = (status.result as Record<string, unknown> | undefined)?.overall_score as number | undefined
        const analysisId = extractAnalysisIdFromPollStatus(status)
        const rec = mainProcess.recordingsStore.getByJobId(jobId)
        if (rec) {
          if (analysisId != null) {
            mainProcess.recordingsStore.markAnalysed(rec.id, jobId, analysisId)
            mainProcess.recordingsStore.setAnalysisId(rec.id, analysisId)
          } else {
            mainProcess.recordingsStore.clearAnalysisPipeline(rec.id)
          }
          mainProcess.notifyRecordingsUpdated()
        }
        const resumedResult = status.result as Record<string, unknown> | undefined
        const scoreText = analysisScoreText(resumedResult)
        mainProcess.logActivity(`Resumed analysis ready${scoreText ? ` — ${scoreText}` : ''}`)
        mainProcess.mainWindow?.webContents.send('dashboard:refresh')
        mainProcess.tray?.setToolTip(idleTooltip(game))
        // Same notification as a live analysis: clicking it opens the result in the app.
        mainProcess.notifyCoachingReady(coachingReadyBody(agent ?? gameLabel(game), map, resumedResult), analysisId ?? undefined, { game, label: agent ?? gameLabel(game), map })
      },
      onFailed: (userMessage, rawError, status) => {
        const rec = mainProcess.recordingsStore.getByJobId(jobId)
        mainProcess.dispatchAnalysisFailure(rawError || userMessage, {
          recordingId: rec?.id ?? null,
          notify: false,
          failureDiagnostics: mainProcess.extractFailureDiagnostics(status),
        })
        mainProcess.logActivity(`Resumed analysis failed: ${rawError || userMessage}`)
        mainProcess.tray?.setToolTip(idleTooltip(game))
        mainProcess.mainWindow?.webContents.send('dashboard:refresh')
      },
      onConnectionLost: () => {
        mainProcess.logActivity('Resumed poll — lost connection to server (will retry when you reopen UpForge)')
        mainProcess.tray?.setToolTip(idleTooltip(game))
      },
      onPollEnded: (reason) => {
        if (reason === 'max_duration') {
          const rec = mainProcess.recordingsStore.getByJobId(jobId)
          if (rec?.id) {
            mainProcess.recordingsStore.clearAnalysisPipeline(rec.id)
            mainProcess.notifyRecordingsUpdated()
          }
          mainProcess.logActivity('Resumed analysis poll stopped after 90 minutes — job may still be processing')
          mainProcess.tray?.setToolTip('UpForge — Analysis still running…')
          void mainProcess.runStuckAnalysisReconcile()
          showAppNotification({
            title: 'UpForge — Still analysing',
            body: 'Your match is still processing on our servers. We\'ll notify you when it\'s ready.',
            silent: mainProcess.notifySilent(),
          })
        }
      },
    })
  }

  /** Save a recording to cloud only (archive quota — no analysis). */
  async function doUploadArchiveOnly(...args: Parameters<typeof uploadArchiveOnlyImpl>): Promise<{ archiveId: string | null; lastError: AnalysisErrorPayload | null }> {
    const recordingId = args[0]
    if (recordingId && mainProcess.recordingsStore.getById(recordingId)?.fileFinalizing) {
      return { archiveId: null, lastError: buildAnalysisErrorPayload('Recording is still finalizing. Try again when it is ready.') }
    }
    if (recordingId) mainProcess.activeUploadRecordingIds.add(recordingId)
    try { return await uploadArchiveOnlyImpl(...args) }
    finally {
      if (recordingId) {
        mainProcess.activeUploadRecordingIds.delete(recordingId)
        mainProcess.recordingsStore.clearPipelineDeferReason(recordingId)
      }
    }
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
    const send = (channel: string, payload?: unknown) => {
      if (recordingId) {
        sendPostGameEventForRecording(
          targetWindow,
          recordingId,
          channel,
          payload,
          getActiveUserId(),
        )
      } else {
        sendPostGameEvent(targetWindow, channel, payload)
      }
    }

    // Owned by the account that asked for it — never continue under a different login.
    const owner = snapshotAccountOwner(getActiveUserId)
    const accountChanged = (): { archiveId: null; lastError: AnalysisErrorPayload } => {
      log.info('[CloudSave] Account changed — dropping cloud save started by the previous account')
      return { archiveId: null, lastError: buildAnalysisErrorPayload(new AccountChangedError().message) }
    }
    if (!owner.stillOwned()) return accountChanged()

    await waitUntilBackgroundWorkAllowed(mainProcess.matchPriorityDeps(), { logActivity: mainProcess.logActivity, shouldStop: () => !owner.stillOwned() })
    if (!owner.stillOwned()) return accountChanged()

    let effectivePath = videoPath
    try {
      const resolved = await resolveUploadVideoPath(videoPath, (sizeGB) => {
        mainProcess.logActivity(`Recording is ${sizeGB} GB — compressing for cloud upload…`)
        send('post-game:compress-start', { sizeGB })
      }, { onProgress: (pct) => send('post-game:compress-progress', pct) })
      if (!owner.stillOwned()) return accountChanged()
      effectivePath = resolved.path
      if (resolved.compressed && recordingId && effectivePath !== videoPath) {
        mainProcess.recordingsStore.updatePath(recordingId, effectivePath)
        mainProcess.notifyRecordingsUpdated()
      }
      if (resolved.sizeBytes > MAX_RECORDING_FILE_BYTES) {
        const errorMsg = formatRecordingTooLargeMessage(resolved.sizeBytes, false)
        const lastError = mainProcess.sendUploadFailure(errorMsg, { targetWindow, recordingId, notify: false, game })
        return { archiveId: null, lastError }
      }
    } catch (prepErr) {
      const lastError = mainProcess.sendUploadFailure(
        prepErr instanceof Error ? prepErr.message : 'Could not prepare recording for upload',
        { targetWindow, recordingId, notify: false, game,
          preparationDiagnostics: prepErr instanceof RecordingPreparationError ? prepErr.diagnostics : undefined },
      )
      return { archiveId: null, lastError }
    }

    if (recordingId) {
      mainProcess.recordingsStore.setPipelineArchiveOnly(recordingId, true)
      mainProcess.notifyRecordingsUpdated()
    }

    send('post-game:upload-start', { game, map, agent, archiveOnly: true })
    if (game === 'valorant') trackUploadStarted('valorant')
    send('post-game:upload-progress', 3)

    let coachingExtras: CoachingSubmissionExtras | undefined
    if (timeline && game === 'valorant') {
      const prepared = await mainProcess.prepareTimelineForCoaching(timeline, game, recordingId)
      coachingExtras = prepared.extras
    }

    try {
      if (!owner.stillOwned()) return accountChanged()
      mainProcess.logActivity(`Saving recording to cloud${map ? ` (${map})` : ''}`)
      const result = await mainProcess.uploadManager.archiveUpload({
        videoPath: effectivePath,
        riotName,
        riotTag,
        game,
        map,
        agent,
        timeline,
        coachingExtras,
        onProgress: (pct) => send('post-game:upload-progress', pct),
      })

      if (!owner.stillOwned()) {
        // Uploaded under the original account's token, but that account is gone: leave the local
        // file and catalogue alone so nothing from A's task touches B's scope.
        return accountChanged()
      }

      if (recordingId) {
        mainProcess.recordingsStore.markArchived(recordingId, result.archive_id)
        mainProcess.notifyRecordingsUpdated()
        mainProcess.mainWindow?.webContents.send('dashboard:refresh')
      }

      send('post-game:upload-complete', { archiveId: result.archive_id, archiveOnly: true })
      mainProcess.logActivity('VOD saved to cloud — analyse later from your dashboard')

      if (deleteLocalAfterUpload) {
        mainProcess.obsRecorder.deleteRecording(videoPath)
        deleteCompressedSibling(videoPath)
        mainProcess.logActivity('Local recording removed — VOD available in cloud')
      }

      return { archiveId: result.archive_id, lastError: null }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cloud save failed'
      mainProcess.logActivity(`Cloud save failed: ${msg}`)
      const isUpgradeError = err instanceof UpgradeRequiredError
        || (err instanceof Error && /archive.limit.reached|archive_limit_reached/i.test(err.message))
      const lastError = mainProcess.sendUploadFailure(msg, {
        targetWindow,
        recordingId,
        needsUpgrade: isUpgradeError,
        upgradeUrl: err instanceof UpgradeRequiredError ? err.upgradeUrl : 'https://upforge.gg/pricing',
        notify: false,
        game,
      })
      return { archiveId: null, lastError }
    } finally {
      if (recordingId) {
        mainProcess.recordingsStore.setPipelineArchiveOnly(recordingId, false)
        mainProcess.notifyRecordingsUpdated()
      }
    }
  }

  /** Upload a recording and poll for the analysis result, sending IPC events to `targetWindow`. */
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
    const start = () => performUploadAndAnalyse(
      recordingId,
      videoPath,
      riotName,
      riotTag,
      game,
      map,
      agent,
      timeline,
      targetWindow,
      sessionStart,
      skipAutoDelete,
      deleteLocalAfterUpload,
      enrichPromise,
    ).finally(() => {
      if (!recordingId) return
      mainProcess.activeUploadRecordingIds.delete(recordingId)
      // Preparation can return before the upload catch/finally. Only capture pauses
      // retain a retry; permanent preparation failures must not restart on match end.
      if (mainProcess.recordingsStore.getById(recordingId)?.pipelineDeferReason !== 'recording') {
        mainProcess.clearDeferredUploadRetryPersisted(recordingId)
      }
    })
    if (!recordingId) return start()
    return mainProcess.analysisPipelineSingleFlight.run(recordingId, start, () => {
      log.warn(`[Upload] Ignoring duplicate pipeline start for recording ${recordingId}`)
    })
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
    const send = (channel: string, payload?: unknown) => {
      if (recordingId) {
        sendPostGameEventForRecording(
          targetWindow,
          recordingId,
          channel,
          payload,
          getActiveUserId(),
        )
      } else {
        sendPostGameEvent(targetWindow, channel, payload)
      }
    }
    stopActiveAnalysisPoll()

    const user = mainProcess.authManager.getUser()
    const storedRecording = recordingId ? mainProcess.recordingsStore.getById(recordingId) : null
    const identity = resolveUploadPlayerIdentity(game, timeline, user, {
      riotName: storedRecording?.riotName ?? riotName,
      riotTag: storedRecording?.riotTag ?? riotTag,
    }, mainProcess.settingsManager?.get()?.cs2SteamName)
    riotName = identity.riotName
    riotTag = identity.riotTag

    if (recordingId && shouldDeferHeavyBackgroundWork(mainProcess.matchPriorityDeps())) {
      mainProcess.recordingsStore.setPipelineDeferReason(recordingId, 'recording')
      mainProcess.notifyRecordingsUpdated()
      send('post-game:upload-deferred', { reason: 'recording' })
    }

    await waitUntilBackgroundWorkAllowed(mainProcess.matchPriorityDeps(), { logActivity: mainProcess.logActivity })

    if (recordingId) {
      mainProcess.recordingsStore.clearPipelineDeferReason(recordingId)
      mainProcess.notifyRecordingsUpdated()
    }

    if (recordingId) {
      mainProcess.registerDeferredUploadRetryPersisted(recordingId, async () => {
        await doUploadAndAnalyse(
          recordingId, videoPath, riotName, riotTag, game, map, agent, timeline,
          targetWindow, sessionStart, skipAutoDelete, deleteLocalAfterUpload, enrichPromise,
        )
      })
    }

    if (recordingId) {
      mainProcess.recordingsStore.setPipelineStatus(recordingId, 'uploading')
      mainProcess.activeUploadRecordingIds.add(recordingId)
      mainProcess.notifyRecordingsUpdated()
    }

    let effectivePath = videoPath
    try {
      const readable = await mainProcess.clipExtractor.probeWithRetry(videoPath)
      if (!readable.ok) {
        throw new Error(readable.reason ?? 'Recording file is incomplete')
      }

      mainProcess.activeMatchTelemetry?.startSector('remux_compress')
      const resolved = await resolveUploadVideoPath(videoPath, (sizeGB) => {
        if (sizeGB === 'remux') {
          mainProcess.logActivity('Wrapping OBS recording for upload (no re-encode)…')
        } else if (sizeGB === 'transcode') {
          mainProcess.logActivity('Converting OBS recording to upload format…')
        } else {
          log.warn(`[Upload] Recording is ${sizeGB} GB — compressing before upload`)
          mainProcess.logActivity(`Recording is ${sizeGB} GB — compressing for upload…`)
        }
        send('post-game:compress-start', { sizeGB })
      }, {
        forAnalysis: true,
        onProgress: (pct) => send('post-game:compress-progress', pct),
      })
      mainProcess.activeMatchTelemetry?.endSector('remux_compress')
      effectivePath = resolved.path
      if (effectivePath !== videoPath) {
        const siblingProbe = await mainProcess.clipExtractor.probe(effectivePath)
        if (!siblingProbe.ok) {
          log.warn(
            `[Upload] Remux/compressed path unreadable (${siblingProbe.reason}) — using original:`,
            videoPath,
          )
          effectivePath = videoPath
        }
      }
      if (recordingId) {
        mainProcess.recordingsStore.updatePath(recordingId, effectivePath)
        mainProcess.notifyRecordingsUpdated()
      }
      if (resolved.compressed && effectivePath !== videoPath) {
        const newGB = (resolved.sizeBytes / (1024 ** 3)).toFixed(2)
        mainProcess.logActivity(`Compressed recording to ${newGB} GB — uploading`)
      }
      if (resolved.sizeBytes > MAX_RECORDING_FILE_BYTES) {
        const sizeGB = (resolved.sizeBytes / (1024 ** 3)).toFixed(1)
        const errorMsg = formatRecordingTooLargeMessage(resolved.sizeBytes, true)
        log.warn(`[Upload] Still too large after compression (${sizeGB} GB) — clips only`)
        mainProcess.logActivity(`Recording still too large (${sizeGB} GB) — saving highlight clips only`)
        if (enrichPromise) {
          await enrichPromise.catch(() => {})
          mainProcess.finalizeTimelineOffsetsForClips(timeline)
        }
        mainProcess.extractMatchClips(effectivePath, timeline, null, game)
          .catch((err) => log.warn('[ClipExtract] Clip extraction (oversized) error:', err))
        mainProcess.sendUploadFailure(errorMsg, { targetWindow, recordingId, clipsOnly: true, notify: false, game })
        return null
      }
    } catch (prepErr) {
      const prepMsg = prepErr instanceof Error ? prepErr.message : 'Could not prepare recording for upload'
      if (wasBackgroundWorkInterrupted(prepErr)) {
        if (recordingId) {
          mainProcess.recordingsStore.setPipelineDeferReason(recordingId, 'recording')
          mainProcess.recordingsStore.setPipelineStatus(recordingId, 'pending')
          mainProcess.notifyRecordingsUpdated()
        }
        mainProcess.logActivity(POST_MATCH_COPY.compressPaused)
        send('post-game:upload-deferred', { reason: 'recording' })
        return null
      }
      log.error('[Upload] Failed to prepare video path:', prepErr)
      mainProcess.sendUploadFailure(prepMsg, { targetWindow, recordingId, notify: false, game,
        preparationDiagnostics: prepErr instanceof RecordingPreparationError ? prepErr.diagnostics : undefined })
      return null
    }

    // Show upload UI as soon as the file is ready — don't block on Riot stats (can take minutes).
    send('post-game:upload-start', {
      game,
      map,
      agent,
      matchDetailsStatus: mainProcess.lastMatchDiagnostic?.matchDetailsStatus ?? 'pending',
      killsInTimeline: mainProcess.lastMatchDiagnostic?.killsInTimeline ?? 0,
    })
    if (game === 'valorant') trackUploadStarted('valorant')
    send('post-game:upload-progress', 3)
    if (recordingId) {
      mainProcess.recordingsStore.setUploadProgress(recordingId, 3)
      mainProcess.mainWindow?.webContents.send('dashboard:upload-progress', { recordingId, progress: 3 })
    }

    let coachingExtras: CoachingSubmissionExtras | undefined
    const enrichTask = (async (): Promise<void> => {
      if (!timeline || (game !== 'valorant' && game !== 'lol')) return
      try {
        if (enrichPromise) {
          const result = await enrichPromise
          coachingExtras = result.extras
        } else {
          const result = await mainProcess.prepareTimelineForCoaching(timeline, game, recordingId)
          coachingExtras = result.extras
        }
        if (mainProcess.lastMatchDiagnostic && game === 'valorant') {
          mainProcess.lastMatchDiagnostic.killsInTimeline = timeline.playerKills?.length ?? 0
          const rich = hasRichMatchData(timeline)
          mainProcess.lastMatchDiagnostic.matchDetailsStatus = rich
            ? 'fetched'
            : (timeline.matchId ? 'fetch_failed' : 'no_match_id')
        }
        if (game === 'valorant' && hasRichMatchData(timeline)) {
          mainProcess.logActivity(
            `Riot match stats loaded (${timeline.roundSummaries?.length ?? 0} rounds, ${timeline.playerKills?.length ?? 0} kills)`,
          )
        } else if (game === 'valorant' && timeline.matchId) {
          mainProcess.logActivity('Riot match stats not ready yet — server will wait for stats before coaching')
        } else if (game === 'lol' && timeline.lolEnrichStatus === 'fetched' && hasRichMatchData(timeline)) {
          mainProcess.logActivity('LoL match stats loaded from Riot Match-V5')
        } else if (game === 'lol' && timeline.matchId) {
          mainProcess.logActivity('LoL match stats not ready yet — server will wait for stats before coaching')
        }
      } catch (err) {
        log.warn('[Upload] Match details enrichment failed:', err)
      }
    })()

    // Run Riot enrich in parallel with S3 upload — stats are awaited in beforeComplete.
    void enrichTask

    try {
      mainProcess.logActivity(`Uploading recording${map ? ` (${map}${agent ? ` · ${agent}` : ''})` : ''}`)

      const duelClipGames = new Set(['valorant', 'cs2', 'deadlock'])
      const result = await mainProcess.uploadManager.upload({
        videoPath: effectivePath,
        riotName,
        riotTag,
        game,
        map,
        agent,
        timeline,
        coachingExtras,
        recordingId,
        focusAreas: storedRecording?.submissionFocusAreas,
        onboardingBonus: storedRecording?.onboardingBonus === true,
        onboardingAdminTest: storedRecording?.onboardingAdminTest === true,
        prepareDuelClips: timeline && duelClipGames.has(game)
          ? async (jobId, path) => {
              const moments = await selectRecordedDuelMoments(path, timeline, mainProcess.clipExtractor)
              if (moments.length === 0) {
                const kills = timeline.playerKills?.length ?? 0
                const deaths = timeline.playerDeaths?.length ?? 0
                log.warn(`[Upload] No duel moments after enrich (kills=${kills} deaths=${deaths})`)
                if (deaths > 0 || kills > 0) {
                  mainProcess.logActivity('No duel moments fit within this recording. It may cover only part of the match.')
                } else {
                  const noDeathMsg = game === 'valorant'
                    ? 'No deaths in match stats — duel coaching needs your death moments from Riot'
                    : 'No deaths in demo timeline — attach a demo with your player kills/deaths'
                  mainProcess.logActivity(noDeathMsg)
                }
                return []
              }
              mainProcess.logActivity(`Preparing ${moments.length} duel clips for AI review`)
              const withKeys = await extractAndUploadDuelClips({
                uploadManager: mainProcess.uploadManager,
                jobId,
                videoPath: path,
                moments,
                clipExtractor: mainProcess.clipExtractor,
              })
              const uploaded = countMomentsWithClipKeys(withKeys)
              mainProcess.logActivity(`Uploaded ${uploaded}/${moments.length} duel clips for AI review`)
              if (uploaded === 0 && moments.length > 0) {
                mainProcess.logActivity('Duel clips not cut locally — server will extract from your recording')
              }
              return withKeys
            }
          : undefined,
        deferMatchDataOnPresign: game === 'valorant',
        getCoachingExtras: () => coachingExtras,
        beforeComplete: timeline && (game === 'valorant' || game === 'lol')
          ? async () => {
              await enrichTask
              if (game === 'valorant') {
                if (hasRichMatchData(timeline)) return
                mainProcess.logActivity('Still waiting for Riot match stats…')
                await enrichTimelineForCoaching(mainProcess.riotLocalApi, timeline, {
                  maxWaitMs: MATCH_DETAILS_ENRICH_MAX_MS,
                  onStatus: (msg) => mainProcess.logActivity(msg),
                })
                if (recordingId) {
                  mainProcess.recordingsStore.updateTimeline(recordingId, timeline)
                  mainProcess.notifyRecordingsUpdated()
                }
                const rrHistory = await mainProcess.authManager.fetchRRHistory().catch(() => [])
                coachingExtras = buildCoachingSubmissionExtras(
                  timeline,
                  mainProcess.settingsManager.get(),
                  rrHistory,
                  mainProcess.riotLocalApi.getDiagnostics().clientVersion,
                )
              } else if (game === 'lol') {
                if (timeline.lolEnrichStatus === 'fetched' && hasRichMatchData(timeline)) return
                mainProcess.logActivity('Still waiting for LoL match stats…')
                await mainProcess.prepareTimelineForCoaching(timeline, game, recordingId)
              }
            }
          : undefined,
        onProgress: (pct) => {
          send('post-game:upload-progress', pct)
          if (recordingId) {
            mainProcess.recordingsStore.setUploadProgress(recordingId, pct)
            mainProcess.mainWindow?.webContents.send('dashboard:upload-progress', { recordingId, progress: pct })
          }
        },
      })

      // The server has accepted and claimed this one-time bonus. Restore normal
      // capture settings now, but keep the mission active until analysis reaches
      // ready/failed so onboarding can continue polling the claimed recording.
      if (storedRecording?.onboardingBonus === true) {
        const settings = mainProcess.settingsManager.get()
        const mission = settings.onboardingMatchMission
        if (mission?.active === true) {
          const previousModes = mission.previousValorantModes
          mainProcess.settingsManager.save({
            ...(previousModes
              ? {
                  recordedModes: previousModes,
                  recordedModesByGame: {
                    ...settings.recordedModesByGame,
                    valorant: previousModes,
                  },
                }
              : {}),
            ...(typeof mission.previousAutoAnalyse === 'boolean'
              ? { autoAnalyse: mission.previousAutoAnalyse }
              : {}),
            ...(typeof mission.previousFullMatchRecording === 'boolean'
              ? { fullMatchRecording: mission.previousFullMatchRecording }
              : {}),
            onboardingMatchMission: {
              ...mission,
              bonusClaimedJobId: result.job_id,
            },
          })
          mainProcess.mainWindow?.webContents.send('settings:changed', mainProcess.settingsManager.get())
          mainProcess.logActivity(`Onboarding bonus claimed for job ${result.job_id} — waiting for analysis to finish`)
        }
      }

      if (timeline && game === 'valorant') {
        if (!coachingExtras) {
          const rrHistory = await mainProcess.authManager.fetchRRHistory().catch(() => [])
          coachingExtras = buildCoachingSubmissionExtras(
            timeline,
            mainProcess.settingsManager.get(),
            rrHistory,
            mainProcess.riotLocalApi.getDiagnostics().clientVersion,
          )
        }
        await mainProcess.uploadManager.patchMatchData(result.job_id, timeline, coachingExtras).catch((err) => {
          log.warn('[Upload] Failed to patch match_data after enrich:', err)
        })
      }

      send('post-game:upload-complete', { jobId: result.job_id })
      mainProcess.logActivity('Upload complete — AI analysis running')
      mainProcess.tray?.setToolTip('UpForge — Analysing...')

      // Mark as analysed in store (if this was a saved recording)
      if (recordingId) {
        mainProcess.recordingsStore.markAnalysed(recordingId, result.job_id)
        mainProcess.notifyRecordingsUpdated()
        mainProcess.mainWindow?.webContents.send('dashboard:refresh')
      }

      // Keep local file until analysis finishes — needed for VOD review, duel-clip debug, and retry on failure.
      startAnalysisPoll({
        uploadManager: mainProcess.uploadManager,
        jobId: result.job_id,
        recordingId,
        ownerUserId: getActiveUserId(),
        targetWindow,
        mainWindow: mainProcess.mainWindow,
        onProgress: (status) => {
          if (!recordingId) return
          const raw = status.progress
          const progress = typeof raw === 'number' && !Number.isNaN(raw)
            ? Math.min(100, Math.max(0, Math.round(raw)))
            : status.status === 'queued' ? 0 : 5
          mainProcess.recordingsStore.setAnalysisProgress(recordingId, progress, status.current_step ?? null)
        },
        onCompleted: (status) => {
          // A completed job may expose its linked analysis_log_id before its
          // denormalized result JSON is available. Completion must still clear
          // the local ANALYSING state in that ordering window.
          const completedResult = status.result ?? {}
          const score = completedResult.overall_score as number | undefined
          const analysisId = extractAnalysisIdFromPollStatus(status)
          if (recordingId) {
            if (analysisId != null) {
              mainProcess.recordingsStore.setAnalysisId(recordingId, analysisId)
              const rec = mainProcess.recordingsStore.getById(recordingId)
              if (rec?.path) {
                mainProcess.maybeDeleteLocalRecordingAfterAnalysis(rec.path, { deleteLocalAfterUpload, skipAutoDelete })
              }
            } else {
              mainProcess.recordingsStore.clearAnalysisPipeline(recordingId)
            }
            mainProcess.notifyRecordingsUpdated()
          }
          // League sends priority_improvements as { theme, issue, fix } objects: save text only.
          const insightText = insightTextFrom(completedResult.priority_improvements) ?? insightTextFrom(completedResult.top_issue)
          const scoreText = analysisScoreText(completedResult)
          mainProcess.logActivity(`Analysis ready${scoreText ? ` — ${scoreText}` : ''}`)
          if (insightText) {
            const insight = { text: insightText, score: score ?? 0, agent: agent ?? null, analysisId: analysisId ?? null, date: new Date().toISOString(), game }
            mainProcess.settingsManager.save({ lastInsight: insight })
            mainProcess.mainWindow?.webContents.send('dashboard:last-insight', insight)
          }
          const lastScore = timeline?.finalScore
            ?? (timeline?.roundScores?.length
              ? timeline.roundScores[timeline.roundScores.length - 1]
              : null)
          const matchResult: 'win' | 'loss' | null = lastScore
            ? (lastScore.allyScore > lastScore.enemyScore ? 'win' : 'loss')
            : null

          let localSpatial = timeline?.spatialSummary
          if (timeline) mainProcess.enrichTimelineSpatial(timeline)
          if (recordingId) {
            const rec = mainProcess.recordingsStore.getById(recordingId)
            if (rec?.timeline) {
              mainProcess.enrichTimelineSpatial(rec.timeline)
              mainProcess.recordingsStore.updateTimeline(recordingId, rec.timeline)
              localSpatial = rec.timeline.spatialSummary ?? localSpatial
            }
          }

          const categoryScores = completedResult.category_scores as
            | Array<{ category: string; score: number }>
            | undefined
          const coachingTags = completedResult.coaching_tags as string[] | undefined
          const prevSkillProfile = mainProcess.settingsManager.get().skillProfile
          const nextSkillProfile = mergeSkillProfileFromAnalysis(prevSkillProfile, {
            categoryScores: categoryScores ?? [],
            coachingTags: coachingTags ?? [],
            overallScore: score ?? null,
            headshotPct: timeline?.finalStats?.headshotPct ?? null,
          })
          mainProcess.settingsManager.save({
            skillProfile: nextSkillProfile,
            skillProfilePrevious: prevSkillProfile ?? undefined,
          })

          const rawHighlights = completedResult.match_highlights
          const matchHighlights = parseMatchHighlightsFromApi(rawHighlights)

          const rawTiming = completedResult.timing_comparisons

          send('post-game:analysis-ready', {
            recording_id: recordingId,
            overall_score: completedResult.overall_score,
            analysis_id: completedResult.analysis_id ?? analysisId,
            top_issue: completedResult.top_issue,
            priority_improvements: completedResult.priority_improvements,
            verdict: completedResult.verdict ?? null,
            coaching_tags: completedResult.coaching_tags ?? [],
            spatial_summary: mainProcess.mergeSpatialSummary(
              extractSpatialFromAnalysisPayload(completedResult),
              localSpatial,
            ),
            category_scores: completedResult.category_scores ?? [],
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
            duel_moments: completedResult.duel_moments
              ?? timeline?.duelMoments
              ?? null,
            pipeline: completedResult.pipeline
              ?? completedResult.pipeline_type
              ?? null,
            report_type: completedResult.report_type ?? null,
            coaching_source: completedResult.coaching_source ?? null,
            limitations: completedResult.limitations ?? [],
            is_degraded: completedResult.is_degraded ?? false,
            telemetry_fallback_used: completedResult.telemetry_fallback_used ?? false,
          })
          const readyPayload = {
            report_type: completedResult.report_type,
            coaching_source: completedResult.coaching_source,
            is_degraded: completedResult.is_degraded,
            telemetry_fallback_used: completedResult.telemetry_fallback_used,
          }
          if (isDegradedTelemetryResult(readyPayload)) {
            trackAnalysisDegraded({
              job_id: result.job_id,
              recording_id: recordingId ?? undefined,
              report_type: String(readyPayload.report_type ?? 'degraded_telemetry'),
            })
          }
          mainProcess.mainWindow?.webContents.send('dashboard:refresh')
          mainProcess.tray?.setToolTip(idleTooltip(game))
          mainProcess.notifyCoachingReady(coachingReadyBody(agent ?? gameLabel(game), map, completedResult), analysisId ?? undefined, { game, label: agent ?? gameLabel(game), map })
          if (!targetWindow.isDestroyed()) {
            targetWindow.flashFrame(true)
            targetWindow.once('focus', () => targetWindow.flashFrame(false))
          }
          // Results open in the app (notification / post-game). The web report opens only if the player turned this on.
          if (analysisId && isPrimaryGame(game) && mainProcess.settingsManager?.get()?.autoOpenBrowser === true) {
            void openExternalSafe(desktopVodResultsUrl(game, analysisId))
          }
          void (async () => {
            try {
              const profile = await mainProcess.authManager.fetchProfile()
              const total = profile?.user?.analysis_stats?.total ?? 0
              if (total <= 1) trackFirstAnalysis({ game, analysisId })
              else if (total === 2) trackSecondAnalysis()
            } catch { /* non-fatal */ }
          })()
        },
        onFailed: (userMessage, rawError, status) => {
          mainProcess.dispatchAnalysisFailure(rawError || userMessage, {
            recordingId,
            targetWindow,
            failureDiagnostics: mainProcess.extractFailureDiagnostics(status),
          })
          mainProcess.logAnalysisFailureActivity(rawError || userMessage, mainProcess.extractFailureDiagnostics(status))
          mainProcess.logActivity('Local recording kept on disk — use fight footage debug or VOD review to inspect duel windows')
          mainProcess.tray?.setToolTip(idleTooltip(game))
        },
        onConnectionLost: () => {
          mainProcess.logActivity('Analysis polling paused — lost connection (retrying automatically)')
          send('post-game:analysis-deferred', { jobId: result.job_id, reason: 'server' })
          mainProcess.tray?.setToolTip('UpForge — Analysis still running…')
          void mainProcess.runStuckAnalysisReconcile()
        },
        onPollEnded: (reason) => {
          if (reason === 'max_duration') {
            if (recordingId) {
              mainProcess.recordingsStore.clearAnalysisPipeline(recordingId)
              mainProcess.notifyRecordingsUpdated()
            }
            mainProcess.logActivity('Analysis poll reached 90 minute cap — job may still be processing on server')
            send('post-game:analysis-deferred', { jobId: result.job_id, reason: 'server' })
            mainProcess.tray?.setToolTip('UpForge — Analysis still running…')
            void mainProcess.runStuckAnalysisReconcile()
            showAppNotification({
              title: 'UpForge — Still analysing',
              body: 'Your match is still processing. We\'ll notify you when results are ready.',
              silent: mainProcess.notifySilent(),
            })
          }
        },
      })
      if (recordingId) mainProcess.clearDeferredUploadRetryPersisted(recordingId)
      return result.job_id
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      mainProcess.logActivity(`Upload failed: ${msg}`)
      mainProcess.tray?.setToolTip(idleTooltip(game))
      if (recordingId) {
        if (wasBackgroundWorkInterrupted(err)) {
          mainProcess.recordingsStore.setPipelineDeferReason(recordingId, 'recording')
          mainProcess.recordingsStore.setPipelineStatus(recordingId, 'pending')
          mainProcess.notifyRecordingsUpdated()
          mainProcess.logActivity(POST_MATCH_COPY.uploadPaused)
          send('post-game:upload-deferred', { reason: 'recording' })
          return null
        }
        mainProcess.recordingsStore.setPipelineStatus(recordingId, 'pending')
        mainProcess.notifyRecordingsUpdated()
        mainProcess.clearDeferredUploadRetryPersisted(recordingId)
      }

      // Quota exceeded — send upgrade prompt (no retry makes sense here)
      const isUpgradeError = err instanceof UpgradeRequiredError
        || (err instanceof Error && err.name === 'UpgradeRequiredError')
        || (err instanceof Error && /analysis.limit.reached|upgrade.required/i.test(err.message))
      if (isUpgradeError) {
        const upgradeErr = err as UpgradeRequiredError
        trackQuotaReached(game, { recording_id: recordingId ?? undefined })
        trackUpgradePromptShown('post_game_upload', game)
        mainProcess.sendUploadFailure(msg, {
          targetWindow,
          recordingId,
          needsUpgrade: true,
          upgradeUrl: upgradeErr.upgradeUrl || 'https://upforge.gg/pricing',
          ppaUrl: upgradeErr.ppaUrl || 'https://upforge.gg/valorant/analyze',
          notify: false,
          game,
        })
        return null
      }

      if (/ENOENT|Recording file not found/i.test(msg)) {
        mainProcess.sendUploadFailure(
          'Recording file was removed before upload finished. If auto-delete is on, wait until upload completes — or retry from dashboard if the file is still saved.',
          { targetWindow, recordingId, notify: false, game },
        )
        return null
      }

      reportPipelineError('upload', msg, {
        recordingId: recordingId ?? null,
        game,
        map,
        agent,
        stack: err instanceof Error ? err.stack?.slice(0, 2000) : undefined,
        transport: err instanceof UploadRequestError ? err.diagnostics : undefined,
      })

      // Try to ensure the recording is saved to the pending store so the user can retry.
      // If this is the first attempt (no recordingId yet) and the file still exists, save now.
      let effectiveRecordingId = recordingId
      if (!recordingId && fs.existsSync(videoPath)) {
        try {
          const user = mainProcess.authManager.getUser()
          if (timeline) recomputeTimelineVideoOffsets(timeline)
          const saved = mainProcess.recordingsStore.add({
            path: videoPath,
            ...resolveUploadPlayerIdentity(game, timeline, user, { riotName, riotTag }),
            game,
            map,
            agent,
            gameMode: resolveGameMode(game, {
              map,
              timelineMode: timeline?.gameMode,
              valorantLiveMode: mainProcess.riotLocalApi.getLastGameMode(),
            }),
            timeline
          })
          effectiveRecordingId = saved.id
          mainProcess.notifyRecordingsUpdated()
          mainProcess.logActivity('Recording saved — can retry from the post-game window or dashboard')
        } catch {
          // Store save failed — fall through with no recordingId
        }
      }

      // Send the error with the recordingId (if we have one) so the renderer can offer retry.
      // The payload is either a plain string (legacy, for analysis polling errors) or an object.
      mainProcess.sendUploadFailure(msg, { targetWindow, recordingId: effectiveRecordingId ?? undefined, notify: false, game })
      return null
    } finally {
      if (recordingId) mainProcess.activeUploadRecordingIds.delete(recordingId)
    }
  }

  return { handleOrphanedJobAtStartup, resumePollForJob, doUploadArchiveOnly, uploadArchiveOnlyImpl, doUploadAndAnalyse, performUploadAndAnalyse }
}
