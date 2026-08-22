/**
 * media-ipc.ts
 * IPC handlers for recording control, screenshots, desktop capture, and OBS WebSocket.
 */

import { IpcMain, app, desktopCapturer, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import { broadcastObsConnection, probeObsConnection } from '../obs-health'
import { ensureObsConnected } from '../obs-ensure'
import { isObsProcessRunning } from '../obs-process'
import { explainObsConnectionFailure } from '../obs-connect'
import { installObsViaWinget, isObsInstalled } from '../obs-installer'
import { restartObsStudioElevated } from '../obs-launcher'
import { ensureObsProfileInstalled, resolveObsWebSocketPassword } from '../obs-profile-installer'
import {
  repairObsSetup,
  runObsPreflight,
  runObsTestRecording,
} from '../obs-preflight'
import { resolveObsRecordVerifyMs } from '../obs-start-verify'
import {
  trackRecordingSetupFailed,
  trackRecordingSetupPassed,
  trackRecordingSetupStarted,
  trackRecordingTestPassed,
  trackRecordingTestStarted,
} from '../funnel-events'
import type { MatchRecorder } from '../match-recorder'
import { OBSRecorder } from '../obs-recorder'
import { SettingsManager } from '../settings-manager'
import { setPendingCaptureSource } from './api-helpers'
import { reportRecordingError } from '../recording-errors'

const OBS_IPC_TIMEOUT_MS = 45_000

function withIpcTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s — is OBS running?`))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

export function setupMediaHandlers(
  ipcMain: IpcMain,
  getActiveRecorder: () => MatchRecorder,
  settingsManager: SettingsManager,
  obsRecorder?: OBSRecorder,
  endMatchRecording?: (game: string) => Promise<{ ok: boolean; reason?: string }>,
  getCurrentGame?: () => string | null,
  getAudioDetectRecorder?: () => MatchRecorder,
): void {
  // ── Recorder ──────────────────────────────────────────────────────────────

  ipcMain.handle('recorder:stop', async () => {
    const recorder = getActiveRecorder()
    if (!recorder.isRecording()) return { ok: false, reason: 'not_recording' }
    if (endMatchRecording) {
      const game = getCurrentGame?.() ?? 'valorant'
      return endMatchRecording(game)
    }
    try {
      await recorder.stop()
      return { ok: true }
    } catch (err) {
      const msg = String(err)
      log.error('[IPC] recorder:stop error:', err)
      reportRecordingError('stop', msg)
      return { ok: false, reason: msg }
    }
  })

  ipcMain.handle('recorder:audio-status', () => {
    const settings = settingsManager.get()
    const obsConnected = obsRecorder?.isConnected() ?? false
    const audioCaptureMode = obsConnected ? 'obs-websocket' : false
    return {
      audioCaptureMode,
      /** @deprecated */ winAudioMode: audioCaptureMode,
      audioEnabled: settings.audioEnabled,
    }
  })

  ipcMain.handle('recorder:fix-audio', async () => {
    try {
      if (obsRecorder?.isConnected()) {
        return { audioCaptureMode: 'obs-websocket', winAudioMode: 'obs-websocket' }
      }
      const result = await obsRecorder?.connect()
      if (result?.ok) {
        return { audioCaptureMode: 'obs-websocket', winAudioMode: 'obs-websocket' }
      }
      return {
        audioCaptureMode: false,
        winAudioMode: false,
        error: result?.error ?? 'Connect OBS in Settings (WebSocket must be enabled)',
      }
    } catch (err) {
      log.error('[IPC] recorder:fix-audio error:', err)
      return { audioCaptureMode: false, winAudioMode: false, error: String(err) }
    }
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
      if (!sources.length) return { ok: false, error: 'no_sources' }
      return { ok: true, dataUrl: sources[0].thumbnail.toDataURL() }
    } catch (err) {
      log.warn('[Screenshots] capture-screen failed:', err)
      return { ok: false, error: String(err) }
    }
  })

  // ── Desktop capturer ──────────────────────────────────────────────────────

  ipcMain.handle('desktop-capturer:get-sources', async (_e, types: Array<'screen' | 'window'>) => {
    try {
      const sources = await desktopCapturer.getSources({ types })
      return { ok: true, sources: sources.map(s => ({ id: s.id, name: s.name })) }
    } catch (err) {
      log.error('[IPC] desktop-capturer:get-sources error:', err)
      return { ok: false, sources: [], error: String(err) }
    }
  })

  ipcMain.handle('desktop-capturer:set-source', (_e, sourceId: string, audioEnabled?: boolean) => {
    if (!sourceId || typeof sourceId !== 'string') {
      return { ok: false, error: 'invalid_source_id' }
    }
    setPendingCaptureSource(sourceId, audioEnabled !== false)
    return { ok: true }
  })

  // ── OBS WebSocket ─────────────────────────────────────────────────────────

  ipcMain.handle('obs:get-process-state', async () => {
    const processRunning = await isObsProcessRunning()
    return {
      installed: isObsInstalled(),
      processRunning,
      connected: obsRecorder?.isConnected() ?? false,
    }
  })

  ipcMain.handle('obs:capture-preview', async () => {
    if (!obsRecorder) return { ok: false, error: 'obs_unavailable' }
    return obsRecorder.captureSourcePreview()
  })

  ipcMain.handle('obs:connect', async () => {
    if (!obsRecorder) return { ok: false, error: 'OBS recorder not available' }
    const processRunning = await isObsProcessRunning()
    if (!processRunning) {
      return {
        ok: false,
        error: explainObsConnectionFailure({ processRunning: false }),
        processRunning: false,
      }
    }
    const result = await obsRecorder.connect()
    if (result.ok) {
      const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed())
      broadcastObsConnection(win, obsRecorder)
      return { ...result, processRunning: true }
    }
    return {
      ...result,
      processRunning: true,
      error: explainObsConnectionFailure({ processRunning: true, connectError: result.error }),
    }
  })

  ipcMain.handle('obs:launch-and-connect', async () => {
    if (!obsRecorder) return { ok: false, error: 'OBS recorder not available' }

    const cfg = settingsManager.get()
    const port = cfg.obsPort ?? 4455
    const password = resolveObsWebSocketPassword(cfg.obsPassword)
    ensureObsProfileInstalled(password, port)
    if (!cfg.obsPassword?.trim()) {
      settingsManager.save({ obsPassword: password })
    }

    return ensureObsConnected(obsRecorder, {
      password,
      port,
      allowProcessRestart: true,
      getWindow: () => BrowserWindow.getAllWindows().find(w => !w.isDestroyed()),
    })
  })

  ipcMain.handle('obs:restart-elevated-and-connect', async () => {
    if (!obsRecorder) return { ok: false, error: 'OBS recorder not available' }
    if (obsRecorder.isRecording()) {
      return { ok: false, error: 'A match recording is active. Finish it before restarting OBS.' }
    }
    if (obsRecorder.isConnected()) {
      const [recordStatus, streamStatus] = await Promise.all([
        obsRecorder.getObsClient().call('GetRecordStatus').catch(() => null) as Promise<{ outputActive?: boolean } | null>,
        obsRecorder.getObsClient().call('GetStreamStatus').catch(() => null) as Promise<{ outputActive?: boolean } | null>,
      ])
      if (recordStatus?.outputActive || streamStatus?.outputActive) {
        return { ok: false, error: 'OBS is recording or streaming. Stop the active output before restarting it.' }
      }
    }

    const cfg = settingsManager.get()
    const port = cfg.obsPort ?? 4455
    const password = resolveObsWebSocketPassword(cfg.obsPassword)
    ensureObsProfileInstalled(password, port)
    if (!cfg.obsPassword?.trim()) settingsManager.save({ obsPassword: password })

    await obsRecorder.disconnect()
    const launched = await restartObsStudioElevated({ password, port })
    if (!launched.ok) return { ok: false, error: launched.error }

    return ensureObsConnected(obsRecorder, {
      password,
      port,
      allowProcessRestart: false,
      getWindow: () => BrowserWindow.getAllWindows().find(w => !w.isDestroyed()),
    })
  })

  ipcMain.handle('obs:disconnect', async () => {
    if (!obsRecorder) return { ok: false, error: 'OBS recorder not available' }
    await obsRecorder.disconnect()
    return { ok: true }
  })

  ipcMain.handle('obs:get-status', async () => {
    if (!obsRecorder) return { connected: false, recording: false, replayBufferActive: false, outputPath: null, lastError: null, obsVersion: null }
    return obsRecorder.getOBSStatus()
  })

  ipcMain.handle('obs:save-replay-clip', async () => {
    if (!obsRecorder) return { ok: false, path: null, error: 'OBS recorder not available' }
    try {
      const clipPath = await obsRecorder.saveReplayClip()
      return clipPath ? { ok: true, path: clipPath } : { ok: false, path: null, error: 'save_failed' }
    } catch (err) {
      log.warn('[IPC] obs:save-replay-clip error:', err)
      return { ok: false, path: null, error: String(err) }
    }
  })

  ipcMain.handle('obs:install-profile', async () => {
    const cfg = settingsManager.get()
    const port = cfg.obsPort ?? 4455
    const password = resolveObsWebSocketPassword(cfg.obsPassword)
    const result = ensureObsProfileInstalled(password, port)
    if (result.ok && !cfg.obsPassword?.trim()) {
      settingsManager.save({ obsPassword: password })
    }
    return result
  })

  ipcMain.handle('obs:install-studio', async () => {
    if (isObsInstalled()) {
      return { ok: true, alreadyInstalled: true as const }
    }
    return installObsViaWinget()
  })

  ipcMain.handle('obs:setup-scene', async () => {
    if (!obsRecorder) {
      return { ok: false, sceneCreated: false, inputCreated: false, error: 'OBS recorder not available' }
    }
    const game = settingsManager.get().primaryGame ?? 'valorant'
    try {
      return await withIpcTimeout(
        obsRecorder.setupScene(game, true),
        OBS_IPC_TIMEOUT_MS,
        'OBS scene setup',
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.warn('[IPC] obs:setup-scene failed:', message)
      return { ok: false, sceneCreated: false, inputCreated: false, error: message }
    }
  })

  ipcMain.handle('obs:run-preflight', async (_event, options?: { includeTestRecording?: boolean }) => {
    if (!obsRecorder) {
      return { ok: false, steps: [], error: 'OBS recorder not available' }
    }
    const cfg = settingsManager.get()
    const game = cfg.primaryGame ?? 'valorant'
    const port = cfg.obsPort ?? 4455
    const password = resolveObsWebSocketPassword(cfg.obsPassword)
    ensureObsProfileInstalled(password, port)

    trackRecordingSetupStarted(game)
    try {
      const result = await withIpcTimeout(
        runObsPreflight({
          obsRecorder,
          game,
          password,
          port,
          recordVerifyMs: resolveObsRecordVerifyMs({ settingsMs: cfg.obsRecordVerifyMs }),
          includeTestRecording: options?.includeTestRecording === true,
        }),
        OBS_IPC_TIMEOUT_MS,
        'OBS preflight',
      )

      if (result.ok) {
        const passedAt = result.passedAt ?? new Date().toISOString()
        settingsManager.save({
          obsPreflightPassed: true,
          obsSetupPassedAt: passedAt,
        })
        trackRecordingSetupPassed(game)
        return { ...result, obsPreflightPassed: true, obsSetupPassedAt: passedAt }
      }

      trackRecordingSetupFailed(result.technicalMessage ?? result.userMessage ?? 'preflight failed', game)
      return {
        ...result,
        error: result.userMessage,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.warn('[IPC] obs:run-preflight failed:', message)
      trackRecordingSetupFailed(message, game)
      return { ok: false, steps: [], error: message }
    }
  })

  ipcMain.handle('obs:repair-setup', async () => {
    if (!obsRecorder) {
      return { ok: false, error: 'OBS recorder not available' }
    }
    const game = settingsManager.get().primaryGame ?? 'valorant'
    try {
      const result = await withIpcTimeout(
        repairObsSetup(obsRecorder, game),
        OBS_IPC_TIMEOUT_MS,
        'OBS repair setup',
      )
      if (!result.ok) {
        return {
          ...result,
          error: result.userMessage,
        }
      }
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.warn('[IPC] obs:repair-setup failed:', message)
      return { ok: false, error: message, technicalMessage: message }
    }
  })

  ipcMain.handle('obs:test-recording', async () => {
    if (!obsRecorder) {
      return { ok: false, error: 'OBS recorder not available' }
    }
    const cfg = settingsManager.get()
    const game = cfg.primaryGame ?? 'valorant'
    const port = cfg.obsPort ?? 4455
    const password = resolveObsWebSocketPassword(cfg.obsPassword)

    trackRecordingTestStarted(game)
    try {
      const ensure = await ensureObsConnected(obsRecorder, {
        password,
        port,
        allowProcessRestart: false,
        getWindow: () => BrowserWindow.getAllWindows().find(w => !w.isDestroyed()),
      })
      if (!ensure.ok) {
        trackRecordingSetupFailed(ensure.error ?? 'OBS not connected', game)
        return { ok: false, error: ensure.error ?? 'OBS is not connected' }
      }

      const result = await withIpcTimeout(
        runObsTestRecording({
          obs: obsRecorder.getObsClient(),
          recordVerifyMs: resolveObsRecordVerifyMs({ settingsMs: cfg.obsRecordVerifyMs }),
        }),
        OBS_IPC_TIMEOUT_MS,
        'OBS test recording',
      )

      if (result.ok) {
        trackRecordingTestPassed(game)
        return result
      }

      trackRecordingSetupFailed(result.technicalMessage ?? 'test recording failed', game)
      return {
        ...result,
        error: result.userMessage,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.warn('[IPC] obs:test-recording failed:', message)
      trackRecordingSetupFailed(message, game)
      return { ok: false, error: message, technicalMessage: message }
    }
  })
}
