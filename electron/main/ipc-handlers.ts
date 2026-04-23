import { IpcMain, BrowserWindow, app, dialog, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import { AuthManager } from './auth-manager'
import { Recorder } from './recorder'
import { GameDetector } from './game-detector'
import { SettingsManager } from './settings-manager'

export function setupIpcHandlers(
  ipcMain: IpcMain,
  auth: AuthManager,
  recorder: Recorder,
  gameDetector: GameDetector,
  settingsManager: SettingsManager,
  openPostGameFn?: () => void,
  getFFmpegOk?: () => boolean,
  getWaitingForMatch?: () => boolean,
  getActivityLog?: () => { time: number; message: string }[]
): void {
  // Auth
  ipcMain.handle('auth:login', async (_e, { email, password }) => {
    log.info('[IPC] auth:login invoked')
    try {
      const result = await auth.login(email, password)
      log.info('[IPC] auth:login result:', result.ok, result.error)
      return result
    } catch (err) {
      log.error('[IPC] auth:login handler threw:', err)
      throw err
    }
  })

  ipcMain.handle('auth:logout', async () => {
    return auth.logout()
  })

  ipcMain.handle('auth:get-user', async () => {
    return auth.getUser()
  })

  ipcMain.handle('auth:load-stored', async () => {
    return auth.loadStoredToken()
  })

  // App state
  ipcMain.handle('app:get-status', () => {
    const settings = settingsManager.get()
    return {
      recording: recorder.isRecording(),
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

  // Profile — full profile + Valorant stats
  ipcMain.handle('profile:get', async () => {
    return auth.fetchProfile()
  })

  // Analyses — recent VOD analyses list
  ipcMain.handle('analyses:get', async (_e, { limit } = {}) => {
    return auth.fetchAnalyses(limit ?? 10)
  })

  // Settings
  ipcMain.handle('settings:get', () => {
    return settingsManager.get()
  })

  ipcMain.handle('settings:save', (_e, partial: Record<string, unknown>) => {
    const prev = settingsManager.get()
    const result = settingsManager.save(partial)
    // Sync launchOnStartup with OS login items when it changes
    if ('launchOnStartup' in partial && partial.launchOnStartup !== prev.launchOnStartup) {
      app.setLoginItemSettings({ openAtLogin: !!partial.launchOnStartup })
    }
    return result
  })

  // Storage usage — sum size of all files in the recordings folder
  ipcMain.handle('storage:get-usage', async () => {
    const settings = settingsManager.get()
    const dir = settings.savePath
    let bytes = 0
    let count = 0
    try {
      const entries = fs.readdirSync(dir)
      for (const entry of entries) {
        try {
          const stat = fs.statSync(path.join(dir, entry))
          if (stat.isFile()) { bytes += stat.size; count++ }
        } catch { /* ignore unreadable entries */ }
      }
    } catch { /* dir may not exist yet */ }
    return { bytes, count }
  })

  // Open the recordings folder in Explorer / Finder
  ipcMain.handle('storage:open-folder', () => {
    const settings = settingsManager.get()
    shell.openPath(settings.savePath)
  })

  // Dialog
  ipcMain.handle('dialog:open-directory', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  // Simulate game session — available on non-Windows for testing
  ipcMain.handle('dev:simulate-game', (_e, { game: gameName, durationMs } = {}) => {
    if (process.platform === 'win32' && !is.dev) return { error: 'Simulate not available on Windows production' }
    gameDetector.simulateGame(gameName ?? 'valorant', durationMs ?? 10000)
    return { ok: true }
  })

  // Updater
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
      // Provide human-friendly message for common failure modes
      if (msg.includes('404') || msg.includes('not found')) {
        return { status: 'error', message: 'No update metadata found — release may still be building' }
      }
      if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('network')) {
        return { status: 'error', message: 'No internet connection' }
      }
      return { status: 'error', message: `Update check failed: ${msg}` }
    }
  })

  // Manual recording stop — lets the user stop a session from the UI
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

  // Window controls (for frameless window)
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
