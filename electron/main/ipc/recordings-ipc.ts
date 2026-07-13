/**
 * recordings-ipc.ts
 * IPC handlers for managing saved recordings that DON'T trigger the upload/analysis
 * pipeline: dismiss/remove, VOD sync nudging, trimming, demo attach/preview, playback
 * URL refresh, duel-window preview, and timeline fetch for the VOD reviewer.
 *
 * Extracted from index.ts. Runtime state and the few index-local helpers are passed
 * in via the deps object so this module stays free of module-level singletons.
 */

import { BrowserWindow, dialog, type IpcMain } from 'electron'
import fs from 'fs'
import log from 'electron-log'
import type { AuthManager } from '../auth-manager'
import type { SettingsManager } from '../settings-manager'
import type { RecordingsStore } from '../recordings-store'
import type { ClipExtractor } from '../clip-extractor'
import type { MatchData } from '../riot-types'
import { deleteLocalRecordingFiles } from '../vod-compressor'
import { isLocalOnlyRecording } from '../storage-cleanup'
import { applyVodTrimToTimeline, swapMediaFileInPlace, trimmedOutputPath } from '../vod-trimmer'
import {
  recomputeTimelineVideoOffsets,
  nudgeTimelineSyncOffset,
  effectiveVideoSyncOffsetMs,
  defaultVideoSyncOffsetMs,
} from '../riot-local-api'
import { timelineDeathsForVod, timelineKillsForVod } from '../recording-sync'
import {
  fetchArchivePlaybackUrl,
  fetchJobPlaybackUrl,
  fetchRecordingPlaybackUrl,
  resolveLocalRecordingFile,
} from '../recording-playback'
import { extractDuelPreviewClip } from '../duel-clip-uploader'
import { resolveCs2LocalPlayerName } from '../cs2-player-identity'
import { attachDemoFileToRecording } from '../recording-demo-attach'
import { getAnalysisReadiness } from '../analysis-readiness'

export interface RecordingsIpcDeps {
  recordingsStore: RecordingsStore
  authManager: AuthManager
  settingsManager: SettingsManager
  clipExtractor: ClipExtractor
  getMainWindow: () => BrowserWindow | null
  logActivity: (message: string) => void
  abortInFlightAnalysisForRecording: (recordingId: string) => { ok: boolean; error?: string }
  refreshReplayTimelineForRecording: (
    recordingId: string,
    options?: { notifyActivity?: boolean },
  ) => Promise<boolean>
  extractMatchClips: (
    videoPath: string,
    timeline: MatchData | null,
    analysisJobId: string | null,
    game?: string,
  ) => Promise<void>
  enrichTimelineSpatial: (timeline: MatchData) => void
}

export function setupRecordingsHandlers(ipcMain: IpcMain, deps: RecordingsIpcDeps): void {
  const {
    recordingsStore,
    authManager,
    settingsManager,
    clipExtractor,
    getMainWindow,
    logActivity,
    abortInFlightAnalysisForRecording,
    refreshReplayTimelineForRecording,
    extractMatchClips,
    enrichTimelineSpatial,
  } = deps

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
    getMainWindow()?.webContents.send('recordings:updated')
    return { ok: true as const, deletedLocal: wasLocalOnly }
  })

  ipcMain.handle('analyses:remove', async (_e, { analysisId, jobId }: { analysisId: number; jobId?: string | null }) => {
    // A completed analysis may still have its source VOD on disk (auto-delete off, or kept after upload).
    const rec = recordingsStore.getByAnalysisId(analysisId)
      ?? (jobId ? recordingsStore.getByJobId(jobId) : undefined)
    const localPath = rec?.path && fs.existsSync(rec.path) ? rec.path : null

    const buttons = localPath
      ? ['Cancel', 'Remove from dashboard', 'Remove & delete local file']
      : ['Cancel', 'Remove from dashboard']
    const win = getMainWindow()
    const notifyWin = win && !win.isDestroyed() ? win : null
    const detail = localPath
      ? 'Hide this match from your dashboard on this PC. You can also delete the local video file to free up space — your cloud copy (if saved) stays available.'
      : 'Hide this match from your dashboard on this PC. Your cloud copy (if saved) stays available.'

    const { response } = notifyWin
      ? await dialog.showMessageBox(notifyWin, {
          type: 'question',
          buttons,
          defaultId: 1,
          cancelId: 0,
          title: 'Remove recording',
          message: 'Remove this match?',
          detail,
        })
      : { response: 1 }

    if (response === 0) return { ok: false as const, removed: false, deletedLocal: false }

    let deletedLocal = false
    if (response === 2 && localPath) {
      const freed = deleteLocalRecordingFiles(localPath)
      deletedLocal = freed > 0
      if (deletedLocal) {
        log.info(`[Analyses] Removed local file (${freed} bytes) for analysis ${analysisId}: ${localPath}`)
      }
    }
    if (rec) recordingsStore.remove(rec.id)
    getMainWindow()?.webContents.send('recordings:updated')
    return { ok: true as const, removed: true, deletedLocal }
  })

  ipcMain.handle('app:open-vod-review', (_e, { id, seekMs }: { id: string; seekMs?: number }) => {
    const mainWindow = getMainWindow()
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
      getMainWindow()?.webContents.send('recordings:updated')
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

  ipcMain.handle('recordings:list-demo-candidates', async (_e, { id }: { id: string }) => {
    const { listDemoCandidatesForRecording } = await import('../demo-recording-candidates')
    return listDemoCandidatesForRecording(recordingsStore, settingsManager, id)
  })

  ipcMain.handle('recordings:preview-demo', async (_e, { recordingId, demoPath }: { recordingId: string; demoPath: string }) => {
    const rec = recordingsStore.getById(recordingId)
    if (!rec || (rec.game !== 'cs2' && rec.game !== 'deadlock')) {
      return { preview: null, assessment: null, recordingHint: null, error: 'Recording not found' }
    }

    const { buildDemoPreviewSummary } = await import('../demo-preview')
    const { buildRecordingDemoHint, assessDemoPreviewMatch } = await import('../../../src/lib/demo-preview-match')
    const localPlayerName = rec.game === 'cs2'
      ? await resolveCs2LocalPlayerName(settingsManager, authManager)
      : null

    const preview = await buildDemoPreviewSummary({
      game: rec.game,
      demoPath,
      localPlayerName,
      mapHint: rec.map ?? rec.timeline?.map ?? null,
    })
    const recordingHint = buildRecordingDemoHint(rec)
    const assessment = assessDemoPreviewMatch(preview, recordingHint)

    return { preview, assessment, recordingHint, error: preview.ok ? undefined : preview.error }
  })

  ipcMain.handle('recordings:refresh-demo-timeline', async (_e, { id }: { id: string }) => {
    const ok = await refreshReplayTimelineForRecording(id, { notifyActivity: true })
    const rec = recordingsStore.getById(id)
    return {
      ok,
      analysisReadiness: rec ? getAnalysisReadiness(rec) : null,
    }
  })

  ipcMain.handle('recordings:attach-demo', async (_e, { id, demoPath }: { id: string; demoPath?: string }) => {
    let chosen = demoPath?.trim()
    if (!chosen) {
      const win = BrowserWindow.getFocusedWindow() ?? getMainWindow()
      if (!win || win.isDestroyed()) {
        return { ok: false as const, error: 'App window unavailable', analysisReadiness: null }
      }
      const result = await dialog.showOpenDialog(win, {
        title: 'Attach match demo',
        filters: [{ name: 'Demo replay', extensions: ['dem'] }],
        properties: ['openFile'],
      })
      if (result.canceled || !result.filePaths[0]) {
        return { ok: false as const, error: 'Cancelled', analysisReadiness: null }
      }
      chosen = result.filePaths[0]
    }

    const rec = recordingsStore.getById(id)
    const localPlayerName = rec?.game === 'cs2'
      ? await resolveCs2LocalPlayerName(settingsManager, authManager)
      : null

    const attachResult = await attachDemoFileToRecording({
      store: recordingsStore,
      recordingId: id,
      demoPath: chosen,
      localPlayerName,
      logActivity,
      onClipsExtracted: (videoPath, timeline, sourceGame) =>
        extractMatchClips(videoPath, timeline, null, sourceGame),
    })

    if (attachResult.ok) {
      getMainWindow()?.webContents.send('recordings:updated')
    }

    const updated = recordingsStore.getById(id)
    return {
      ok: attachResult.ok,
      error: attachResult.error,
      analysisReadiness: updated ? getAnalysisReadiness(updated) : null,
    }
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
      kills: timelineKillsForVod(tl),
      deaths: timelineDeathsForVod(tl),
      roundSummaries: tl?.roundSummaries ?? [],
      finalStats: tl?.finalStats ?? null,
      teamSnapshot: tl?.teamSnapshot ?? [],
      spikePlants: tl?.spikePlants ?? [],
      spikeDefuses: tl?.spikeDefuses ?? [],
      spikeDetonations: tl?.spikeDetonations ?? [],
      firstBloods: tl?.firstBloods ?? [],
      objectives: tl?.objectiveEvents ?? [],
      spatialSummary: tl?.spatialSummary ?? null,
      duelMoments: tl?.duelMoments ?? [],
      videoSyncOffsetMs: tl ? effectiveVideoSyncOffsetMs(tl) : 0,
    }
  })
}
