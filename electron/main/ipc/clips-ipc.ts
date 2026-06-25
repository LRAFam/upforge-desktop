/**
 * clips-ipc.ts
 * IPC handlers for clips: CRUD, upload, S3 streaming, analysis polling, trim, hotkeys.
 */

import { IpcMain, shell } from 'electron'
import fs from 'fs'
import https from 'https'
import http from 'http'
import { tmpdir } from 'os'
import { join } from 'path'
import { AuthManager } from '../auth-manager'
import { ClipStore } from '../clip-store'
import { clipMatchesGame, normalizeClipGame } from '../clip-game'
import { ClipExtractor, FREE_CLIP_UPLOAD_MAX_HEIGHT } from '../clip-extractor'
import { HotkeyManager } from '../hotkey-manager'
import { UpgradeRequiredError } from '../errors'
import { _clipInFlight, apiPost, pollClipAnalysis } from './api-helpers'
import type { RecordingsStore } from '../recordings-store'
import type { SettingsManager } from '../settings-manager'
import { buildClipUploadPayload, resolveClipTimeline } from '../clip-coaching-context'
import { buildCoachingSubmissionExtras } from '../match-coaching-context'
import { exportMatchRecap } from '../recap-export'
import { hasProAccess } from '../subscription'

export function setupClipHandlers(
  ipcMain: IpcMain,
  clipStore: ClipStore,
  clipExtractor: ClipExtractor,
  auth: AuthManager,
  hotkeyManager: HotkeyManager,
  recordingsStore?: RecordingsStore,
  settingsManager?: SettingsManager,
): void {
  const apiBase = process.env['VITE_API_URL'] || 'https://api.upforge.gg'

  async function clipCoachingExtras(clip: { analysisJobId: string | null }) {
    const recordings = recordingsStore?.getAll().map((r) => ({ jobId: r.jobId, timeline: r.timeline })) ?? []
    const timeline = resolveClipTimeline(
      { analysisJobId: clip.analysisJobId } as import('../clip-store').ClipRecord,
      recordings,
    )
    if (!timeline || !settingsManager) return undefined
    const rrHistory = await auth.fetchRRHistory().catch(() => [])
    return buildCoachingSubmissionExtras(
      timeline,
      settingsManager.get(),
      rrHistory,
      null,
    )
  }

  function clipTimeline(clip: import('../clip-store').ClipRecord) {
    if (!clip.analysisJobId || !recordingsStore) return null
    return recordingsStore.getTimelineByJobId(clip.analysisJobId)
  }

  async function resolveClipUploadPath(
    clipId: string,
    sourcePath: string,
  ): Promise<{ path: string; cleanup: string | null; uploadResolution: 'hd' | '720p' }> {
    const user = auth.getUser()
    if (hasProAccess(user)) {
      return { path: sourcePath, cleanup: null, uploadResolution: 'hd' }
    }

    const dims = await clipExtractor.probeDimensions(sourcePath)
    if (!dims || dims.height <= FREE_CLIP_UPLOAD_MAX_HEIGHT) {
      return { path: sourcePath, cleanup: null, uploadResolution: '720p' }
    }

    const tempPath = join(tmpdir(), `upforge_clip_upload_${clipId}_${Date.now()}.mp4`)
    await clipExtractor.transcodeForCloudUpload(sourcePath, tempPath)
    return { path: tempPath, cleanup: tempPath, uploadResolution: '720p' }
  }

  ipcMain.handle('clips:get', (_e, opts?: { game?: string; allGames?: boolean }) => {
    const all = clipStore.getAll()
    if (opts?.allGames || !opts?.game) return all
    const game = normalizeClipGame(opts.game)
    return all.filter(c => clipMatchesGame(c, game))
  })

  ipcMain.handle('clips:get-thumbnail', (_e, { id }: { id: string }) => {
    const clip = clipStore.getById(id)
    if (!clip?.thumbPath || !fs.existsSync(clip.thumbPath)) return null
    try {
      const data = fs.readFileSync(clip.thumbPath)
      return `data:image/jpeg;base64,${data.toString('base64')}`
    } catch {
      return null
    }
  })

  ipcMain.handle('clips:delete', (_e, { id }: { id: string }) => {
    if (_clipInFlight.has(id)) return { ok: false, error: 'Cannot delete while an operation is in progress' }
    const clip = clipStore.remove(id)
    if (!clip) return { ok: false, error: 'Not found' }
    for (const p of [clip.path, clip.thumbPath]) {
      if (p && fs.existsSync(p)) {
        try { fs.unlinkSync(p) } catch { /* ignore */ }
      }
    }
    return { ok: true }
  })

  ipcMain.handle('clips:update-title', (_e, { id, title }: { id: string; title: string }) => {
    clipStore.update(id, { title })
    return { ok: true }
  })

  ipcMain.handle('clips:open-folder', () => {
    shell.openPath(ClipExtractor.clipsDir())
  })

  ipcMain.handle('clips:reveal-file', (_e, { id }: { id: string }) => {
    const clip = clipStore.getById(id)
    if (clip && fs.existsSync(clip.path)) shell.showItemInFolder(clip.path)
    else shell.openPath(ClipExtractor.clipsDir())
  })

  ipcMain.handle('clips:toggle-favorite', (_e, { id }: { id: string }) => {
    const clip = clipStore.getById(id)
    if (!clip) return { ok: false }
    clipStore.update(id, { favorited: !clip.favorited })
    return { ok: true, favorited: !clip.favorited }
  })

  ipcMain.handle('clips:get-hotkeys', () => hotkeyManager.getBindings())

  ipcMain.handle('clips:get-hotkey-status', () => ({
    saveClipRegistered: hotkeyManager.isRegistered('save-clip'),
    toggleOverlayRegistered: hotkeyManager.isRegistered('toggle-overlay'),
    screenshotRegistered: hotkeyManager.isRegistered('take-screenshot'),
  }))

  ipcMain.handle('clips:set-hotkey', (_e, { action, accelerator }: { action: string; accelerator: string }) => {
    const ok = hotkeyManager.update(action as 'save-clip' | 'toggle-overlay' | 'take-screenshot', accelerator)
    return { ok }
  })

  ipcMain.handle('clips:upload', async (_e, { id }: { id: string }) => {
    const clip = clipStore.getById(id)
    if (!clip) return { ok: false, error: 'Clip not found' }
    if (!fs.existsSync(clip.path)) return { ok: false, error: 'Clip file missing' }
    if (_clipInFlight.has(id)) return { ok: false, error: 'Upload or trim already in progress for this clip' }

    const token = auth.getToken()
    if (!token) return { ok: false, error: 'Not authenticated' }

    _clipInFlight.add(id)
    clipStore.update(id, { uploadStatus: 'uploading' })

    let uploadCleanup: string | null = null
    try {
      const { path: uploadPath, cleanup, uploadResolution } = await resolveClipUploadPath(id, clip.path)
      uploadCleanup = cleanup

      const timeline = clipTimeline(clip)
      const extras = timeline && settingsManager
        ? buildCoachingSubmissionExtras(timeline, settingsManager.get(), await auth.fetchRRHistory().catch(() => []))
        : undefined
      const presignPayload = JSON.stringify(buildClipUploadPayload(clip, timeline, extras))
      const { upload_url: uploadUrl, clip_uuid: clipUuid } = await apiPost(
        apiBase, '/api/clips/presign', presignPayload, token
      ) as { upload_url: string; clip_uuid: string }

      const fileSize = fs.statSync(uploadPath).size
      const s3Url = new URL(uploadUrl)
      const s3Proto = s3Url.protocol === 'https:' ? https : http
      await new Promise<void>((resolve, reject) => {
        const req = s3Proto.request({
          method:   'PUT',
          hostname: s3Url.hostname,
          port:     s3Url.port || (s3Url.protocol === 'https:' ? 443 : 80),
          path:     s3Url.pathname + s3Url.search,
          headers: {
            'Content-Type':   'video/mp4',
            'Content-Length': fileSize,
          },
        }, (res) => {
          res.resume()
          res.on('end', () => {
            if ((res.statusCode ?? 0) >= 400) reject(new Error(`S3 upload failed (${res.statusCode})`))
            else resolve()
          })
        })
        req.on('error', reject)
        req.setTimeout(300_000, () => req.destroy(new Error('S3 upload timed out')))
        fs.createReadStream(uploadPath).pipe(req)
      })

      const completePayload = JSON.stringify({
        clip_uuid: clipUuid,
        ...buildClipUploadPayload(clip, timeline, extras),
      })
      const { id: apiClipId } = await apiPost(
        apiBase, '/api/clips/complete', completePayload, token
      ) as { id: number }

      clipStore.update(id, { uploadStatus: 'uploaded', apiClipId })
      return { ok: true, apiClipId, uploadResolution }
    } catch (err) {
      if (err instanceof UpgradeRequiredError) {
        clipStore.update(id, { uploadStatus: 'local' })
        return { ok: false, needsUpgrade: true, message: err.message, upgradeUrl: err.upgradeUrl }
      }
      const msg = err instanceof Error ? err.message : String(err)
      clipStore.update(id, { uploadStatus: 'failed' })
      return { ok: false, error: msg }
    } finally {
      if (uploadCleanup && fs.existsSync(uploadCleanup)) {
        try { fs.unlinkSync(uploadCleanup) } catch { /* ignore */ }
      }
      _clipInFlight.delete(id)
    }
  })

  ipcMain.handle('clips:request-analysis', async (_e, { id }: { id: string }) => {
    const clip = clipStore.getById(id)
    if (!clip) return { ok: false, error: 'Clip not found' }

    const token = auth.getToken()
    if (!token) return { ok: false, error: 'Not authenticated' }

    if (!clip.apiClipId) {
      return { ok: false, error: 'Upload the clip before requesting analysis' }
    }

    clipStore.update(id, { analysisStatus: 'queued' })

    try {
      const timeline = clipTimeline(clip)
      const extras = await clipCoachingExtras(clip)
      const analyseBody = JSON.stringify(
        buildClipUploadPayload(clip, timeline, extras),
      )
      await apiPost(apiBase, `/api/clips/${clip.apiClipId}/analyse`, analyseBody, token)
      clipStore.update(id, { analysisStatus: 'queued' })
      pollClipAnalysis(id, clip.apiClipId, token, clipStore, apiBase)
      return { ok: true }
    } catch (err) {
      if (err instanceof UpgradeRequiredError) {
        clipStore.update(id, { analysisStatus: 'none' })
        return { ok: false, needsUpgrade: true, message: err.message, upgradeUrl: err.upgradeUrl }
      }
      const msg = err instanceof Error ? err.message : String(err)
      clipStore.update(id, { analysisStatus: 'failed' })
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle('clips:share', async (_e, { id }: { id: string }) => {
    const clip = clipStore.getById(id)
    if (!clip?.apiClipId) return { ok: false, error: 'Upload clip first' }

    const token = auth.getToken()
    if (!token) return { ok: false, error: 'Not authenticated' }

    try {
      const res = await apiPost(apiBase, `/api/clips/${clip.apiClipId}/share`, '{}', token) as Record<string, string>
      const shareToken = res.share_token
      const shareUrl = res.share_url
      if (shareToken) clipStore.update(id, { shareToken })
      return { ok: true, shareUrl, shareToken }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('clips:publish', async (_e, { id, caption }: { id: string; caption?: string }) => {
    const clip = clipStore.getById(id)
    if (!clip?.apiClipId) return { ok: false, error: 'Upload clip first' }

    const token = auth.getToken()
    if (!token) return { ok: false, error: 'Not authenticated' }

    try {
      await apiPost(apiBase, `/api/clips/${clip.apiClipId}/publish`,
        JSON.stringify({ caption: caption ?? null }), token)
      clipStore.update(id, { published: true })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('clips:trim', async (_e, { id, startSec, endSec }: { id: string; startSec: number; endSec: number }) => {
    const clip = clipStore.getById(id)
    if (!clip) return { ok: false, error: 'Clip not found' }
    if (!fs.existsSync(clip.path)) return { ok: false, error: 'Clip file not found on disk' }
    if (_clipInFlight.has(id)) return { ok: false, error: 'Upload or trim already in progress for this clip' }

    _clipInFlight.add(id)
    const trimmedPath = clip.path.replace(/\.mp4$/, '_trimmed.mp4')
    try {
      await clipExtractor.trim({ sourcePath: clip.path, startSec, endSec, outputPath: trimmedPath })
      // Swap trimmed file in atomically
      const backupPath = clip.path + '.bak'
      try {
        fs.renameSync(clip.path, backupPath)
        try {
          fs.renameSync(trimmedPath, clip.path)
          try { fs.unlinkSync(backupPath) } catch { /* backup cleanup — non-fatal */ }
        } catch (renameErr) {
          try { fs.renameSync(backupPath, clip.path) } catch { /* best-effort restore */ }
          throw renameErr
        }
      } catch (backupErr) {
        // Cross-device fallback
        try { fs.unlinkSync(clip.path) } catch { /* ignore */ }
        fs.renameSync(trimmedPath, clip.path)
      }
      const dur = endSec - startSec
      clipStore.update(id, { durationSeconds: dur, uploadStatus: 'local' })
      return { ok: true }
    } catch (err) {
      try { if (fs.existsSync(trimmedPath)) fs.unlinkSync(trimmedPath) } catch { /* ignore */ }
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      _clipInFlight.delete(id)
    }
  })

  ipcMain.handle('recap:export-stitched', async (_e, payload: {
    recordingId: string
    highlights: Array<{ id: string; clipId?: string | null; videoOffsetMs?: number | null; rank?: number }>
    maxMoments?: number
  }) => {
    if (!recordingsStore) {
      return { ok: false, error: 'Recordings store unavailable' }
    }
    return exportMatchRecap(
      { clipStore, clipExtractor, recordingsStore },
      payload.recordingId,
      payload.highlights ?? [],
      payload.maxMoments ?? 5,
    )
  })
}
