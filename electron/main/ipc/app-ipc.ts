/**
 * app-ipc.ts
 * IPC handlers for app state, settings, storage, dialog, dev tools, updater, and window controls.
 */

import { IpcMain, BrowserWindow, app, dialog, shell, screen } from 'electron'
import { is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import { getUpdateState, installUpdate } from '../updater'
import { AuthManager } from '../auth-manager'
import type { MatchRecorder } from '../match-recorder'
import { GameDetector } from '../game-detector'
import { SettingsManager } from '../settings-manager'
import type { OBSRecorder } from '../obs-recorder'
import { buildRecorderConfig } from '../obs-output-settings'
import { hasProAccess } from '../subscription'
import { getActiveUserId } from '../user-session'
import { resolveRecordingSavePath } from '../user-data-paths'
import { openPathSafe } from '../shell-open'
import { trackOnboardingComplete } from '../funnel-events'
import { applyLayoutForRoute } from '../window-layouts'

export function setupAppHandlers(
  ipcMain: IpcMain,
  auth: AuthManager,
  getActiveRecorder: () => MatchRecorder,
  gameDetector: GameDetector,
  settingsManager: SettingsManager,
  openPostGameFn?: () => void,
  getFFmpegOk?: () => boolean,
  getWaitingForMatch?: () => boolean,
  getActivityLog?: () => { time: number; message: string }[],
  showClipsFn?: () => void,
  getRecordingBackend?: () => 'obs',
  getCurrentQueueMode?: () => string | null,
  getObsConnected?: () => boolean,
  obsRecorder?: OBSRecorder,
  onSettingsSaved?: (settings: ReturnType<SettingsManager['get']>) => void,
): void {
  // ── App state ─────────────────────────────────────────────────────────────

  ipcMain.handle('app:get-status', () => {
    const settings = settingsManager.get()
    const recorder = getActiveRecorder()
    const recording = recorder.isRecording()
    return {
      recording,
      recordingStartedAt: recorder.getRecordingStartedAt(),
      currentGame: gameDetector.currentGame(),
      waitingForMatch: getWaitingForMatch ? getWaitingForMatch() : false,
      authenticated: auth.isAuthenticated(),
      user: auth.getUser(),
      platform: process.platform,
      isDev: is.dev,
      version: app.getVersion(),
      firstRun: settings.firstRun,
      ffmpegOk: getFFmpegOk ? getFFmpegOk() : true,
      obsConnected: getObsConnected ? getObsConnected() : false,
      recordedModes: settings.recordedModes,
      recordingBackend: getRecordingBackend ? getRecordingBackend() : 'obs',
      currentQueueMode: recording && getCurrentQueueMode ? getCurrentQueueMode() : null,
    }
  })

  ipcMain.handle('app:get-activity-log', () => {
    return getActivityLog ? getActivityLog() : []
  })

  ipcMain.handle('app:show-clips', () => {
    showClipsFn?.()
    return { ok: true }
  })

  ipcMain.handle('app:open-url', (_e, { url }: { url: string }) => {
    shell.openExternal(url)
    return { ok: true }
  })

  // ── Settings ──────────────────────────────────────────────────────────────

  ipcMain.handle('settings:get', () => {
    const allowCreator = hasProAccess(auth.getUser())
    const current = settingsManager.get()
    const settings = current.recordingPreset === 'creator' && !allowCreator
      ? settingsManager.save({ recordingPreset: 'coaching' }, { allowCreator: false })
      : current
    return {
      ...settings,
      effectiveSavePath: resolveRecordingSavePath(settings.savePath, getActiveUserId()),
    }
  })

  ipcMain.handle('settings:save', (_e, partial: Record<string, unknown>) => {
    const prev = settingsManager.get()
    const allowCreator = hasProAccess(auth.getUser())
    const wantsCreator = partial.recordingPreset === 'creator'
    const result = settingsManager.save(partial as Partial<import('../settings-manager').AppSettings>, { allowCreator })
    if ('launchOnStartup' in partial && partial.launchOnStartup !== prev.launchOnStartup) {
      app.setLoginItemSettings({ openAtLogin: !!partial.launchOnStartup })
    }
    if (obsRecorder?.isConnected()) {
      void obsRecorder.applyRecordingSettings(buildRecorderConfig(result, allowCreator, getActiveUserId()))
    }
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed()) w.webContents.send('settings:changed', result)
    })
    onSettingsSaved?.(result)
    if ('primaryGame' in partial && partial.primaryGame !== prev.primaryGame && auth.isAuthenticated()) {
      const game = String(partial.primaryGame)
      void auth.syncPrimaryGameToApi(game)
    }
    if (partial.onboardingComplete === true && !prev.onboardingComplete) {
      trackOnboardingComplete()
    }
    if ('cs2SteamName' in partial && partial.cs2SteamName !== prev.cs2SteamName && auth.isAuthenticated()) {
      void auth.syncCs2Identity(String(partial.cs2SteamName ?? ''))
    }
    return {
      ...result,
      creatorPresetRequiresPro: wantsCreator && !allowCreator,
    }
  })

  ipcMain.handle('settings:mark-first-run-done', async () => {
    trackOnboardingComplete()
    return settingsManager.save({ firstRun: false, onboardingComplete: true })
  })

  // ── Storage (usage/open-folder handlers live in index.ts where recordingsStore is available) ──

  ipcMain.handle('storage:open-folder', async () => {
    const settings = settingsManager.get()
    return openPathSafe(resolveRecordingSavePath(settings.savePath, getActiveUserId()), {
      createIfMissing: true,
    })
  })

  // ── Dialog ────────────────────────────────────────────────────────────────

  ipcMain.handle('dialog:open-directory', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  // ── Dev ───────────────────────────────────────────────────────────────────

  ipcMain.handle('dev:simulate-game', (_e, { game: gameName, durationMs } = {}) => {
    if (process.platform === 'win32' && !is.dev) return { error: 'Simulate not available on Windows production' }
    gameDetector.simulateGame(gameName ?? 'valorant', durationMs ?? 10000)
    return { ok: true }
  })

  // ── Updater ───────────────────────────────────────────────────────────────

  ipcMain.handle('updater:check', async () => {
    if (is.dev) return { status: 'dev', message: 'Updates disabled in dev mode' }
    try {
      const result = await autoUpdater.checkForUpdates()
      if (!result) return { status: 'up-to-date', message: 'You\'re on the latest version' }
      const newVersion = result.updateInfo?.version
      if (newVersion && newVersion !== app.getVersion()) {
        return { status: 'available', message: `v${newVersion} is downloading...` }
      }
      return { status: 'up-to-date', message: 'You\'re on the latest version' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('[Updater] checkForUpdates failed:', msg)
      if (msg.includes('404') || msg.includes('not found')) {
        return { status: 'error', message: 'No update metadata found — release may still be building' }
      }
      if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('network')) {
        return { status: 'error', message: 'No internet connection' }
      }
      return { status: 'error', message: `Update check failed: ${msg}` }
    }
  })

  ipcMain.handle('updater:getState', () => getUpdateState())

  ipcMain.handle('updater:install', () => {
    if (is.dev) return
    installUpdate()
  })

  // ── Window controls (frameless window) ───────────────────────────────────

  ipcMain.handle('window:minimize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    win?.minimize()
  })

  ipcMain.handle('window:close', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    win?.hide()
  })

  ipcMain.handle('window:open-post-game', () => {
    if (openPostGameFn) openPostGameFn()
  })

  ipcMain.handle('window:apply-layout', (e, routePath: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win || win.isDestroyed()) return { ok: false }
    applyLayoutForRoute(win, typeof routePath === 'string' ? routePath : '/dashboard')
    return { ok: true }
  })

  /** Resize the calling window to fit compact post-game content (title bar is added automatically). */
  ipcMain.handle('window:set-content-height', (e, contentHeight: number) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win || win.isDestroyed()) return
    const { height: workH } = screen.getPrimaryDisplay().workAreaSize
    const titleBarPx = 44
    const desiredHeight = Math.min(
      workH - 32,
      380,
      Math.max(240, Math.round(Number(contentHeight) + titleBarPx)),
    )
    const bounds = win.getBounds()
    if (Math.abs(bounds.height - desiredHeight) < 6) return
    win.setBounds({
      x: bounds.x,
      y: workH - desiredHeight - 20,
      width: bounds.width,
      height: desiredHeight,
    })
  })
}
