/**
 * app-ipc.ts
 * IPC handlers for app state, settings, storage, dialog, dev tools, updater, and window controls.
 */

import { IpcMain, BrowserWindow, app, dialog, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import { getUpdateState, installUpdate } from '../updater'
import { AuthManager } from '../auth-manager'
import type { MatchRecorder } from '../match-recorder'
import { GameDetector } from '../game-detector'
import { SettingsManager } from '../settings-manager'

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
): void {
  // ── App state ─────────────────────────────────────────────────────────────

  ipcMain.handle('app:get-status', () => {
    const settings = settingsManager.get()
    const recorder = getActiveRecorder()
    return {
      recording: recorder.isRecording(),
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
      recordedModes: settings.recordedModes
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
    return settingsManager.get()
  })

  ipcMain.handle('settings:save', (_e, partial: Record<string, unknown>) => {
    const prev = settingsManager.get()
    const result = settingsManager.save(partial)
    if ('launchOnStartup' in partial && partial.launchOnStartup !== prev.launchOnStartup) {
      app.setLoginItemSettings({ openAtLogin: !!partial.launchOnStartup })
    }
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed()) w.webContents.send('settings:changed', result)
    })
    return result
  })

  ipcMain.handle('settings:mark-first-run-done', () => {
    return settingsManager.save({ firstRun: false })
  })

  // ── Storage ───────────────────────────────────────────────────────────────

  ipcMain.handle('storage:get-usage', async () => {
    const settings = settingsManager.get()
    const dir = settings.savePath
    let bytes = 0
    let count = 0
    try {
      const entries = await fs.promises.readdir(dir)
      await Promise.all(entries.map(async (entry) => {
        try {
          const stat = await fs.promises.stat(path.join(dir, entry))
          if (stat.isFile()) { bytes += stat.size; count++ }
        } catch { /* ignore unreadable entries */ }
      }))
    } catch { /* dir may not exist yet */ }
    return { bytes, count }
  })

  ipcMain.handle('storage:open-folder', () => {
    const settings = settingsManager.get()
    shell.openPath(settings.savePath)
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
}
