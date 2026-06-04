/**
 * media-ipc.ts
 * IPC handlers for recording control, screenshots, desktop capture, and OBS WebSocket.
 */

import { IpcMain, app, desktopCapturer } from 'electron'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import { Recorder } from '../recorder'
import { OBSRecorder } from '../obs-recorder'
import { SettingsManager } from '../settings-manager'
import { setPendingCaptureSourceId } from './api-helpers'

export function setupMediaHandlers(
  ipcMain: IpcMain,
  recorder: Recorder,
  settingsManager: SettingsManager,
  obsRecorder?: OBSRecorder,
): void {
  // ── Recorder ──────────────────────────────────────────────────────────────

  ipcMain.handle('recorder:stop', async () => {
    if (!recorder.isRecording()) return { ok: false, reason: 'not_recording' }
    try {
      await recorder.stop()
      return { ok: true }
    } catch (err) {
      log.error('[IPC] recorder:stop error:', err)
      return { ok: false, reason: String(err) }
    }
  })

  ipcMain.handle('recorder:audio-status', () => {
    const settings = settingsManager.get()
    const obsActive = settings.obsEnabled && obsRecorder?.isConnected()
    return {
      winAudioMode: obsActive ? 'obs-websocket' : recorder.getAudioMode(),
      audioEnabled: obsActive ? true : settings.audioEnabled,
    }
  })

  ipcMain.handle('recorder:fix-audio', async () => {
    const settings = settingsManager.get()
    if (settings.obsEnabled && obsRecorder?.isConnected()) {
      return { winAudioMode: 'obs-websocket' }
    }
    const mode = await recorder.redetectAudio()
    return { winAudioMode: mode }
  })

  // ── Screenshots ───────────────────────────────────────────────────────────

  ipcMain.handle('screenshots:save', (_e, { dataUrl }: { dataUrl: string }) => {
    try {
      const screenshotsDir = path.join(app.getPath('userData'), 'screenshots')
      if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true })
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
      const filename = `screenshot_${timestamp}.png`
      const filepath = path.join(screenshotsDir, filename)
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
      fs.writeFileSync(filepath, Buffer.from(base64, 'base64'))
      log.info('[Screenshots] Saved:', filepath)
      return { ok: true, filename, path: filepath }
    } catch (err) {
      log.error('[Screenshots] Failed to save:', err)
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('screenshots:capture-screen', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 3840, height: 2160 },
      })
      if (!sources.length) return null
      return sources[0].thumbnail.toDataURL()
    } catch { return null }
  })

  // ── Desktop capturer ──────────────────────────────────────────────────────

  ipcMain.handle('desktop-capturer:get-sources', async (_e, types: Array<'screen' | 'window'>) => {
    const sources = await desktopCapturer.getSources({ types })
    return sources.map(s => ({ id: s.id, name: s.name }))
  })

  ipcMain.handle('desktop-capturer:set-source', (_e, sourceId: string) => {
    setPendingCaptureSourceId(sourceId)
  })

  // ── OBS WebSocket ─────────────────────────────────────────────────────────

  ipcMain.handle('obs:connect', async () => {
    if (!obsRecorder) return { ok: false, error: 'OBS recorder not available' }
    return obsRecorder.connect()
  })

  ipcMain.handle('obs:disconnect', async () => {
    if (!obsRecorder) return
    return obsRecorder.disconnect()
  })

  ipcMain.handle('obs:get-status', async () => {
    if (!obsRecorder) return { connected: false, recording: false, replayBufferActive: false, outputPath: null, lastError: null, obsVersion: null }
    return obsRecorder.getOBSStatus()
  })

  ipcMain.handle('obs:save-replay-clip', async () => {
    if (!obsRecorder) return { path: null }
    const clipPath = await obsRecorder.saveReplayClip()
    return { path: clipPath }
  })
}
