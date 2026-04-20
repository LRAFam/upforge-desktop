import { IpcMain, BrowserWindow, app, dialog } from 'electron'
import { is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
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
  openPostGameFn?: () => void
): void {
  // Auth
  ipcMain.handle('auth:login', async (_e, { email, password }) => {
    return auth.login(email, password)
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
      authenticated: auth.isAuthenticated(),
      user: auth.getUser(),
      platform: process.platform,
      isDev: is.dev,
      version: app.getVersion(),
      firstRun: settings.firstRun
    }
  })

  // Settings
  ipcMain.handle('settings:get', () => {
    return settingsManager.get()
  })

  ipcMain.handle('settings:save', (_e, partial: Record<string, unknown>) => {
    return settingsManager.save(partial)
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
      if (!result) return { status: 'up-to-date', message: 'You are on the latest version' }
      return { status: 'checking', message: 'Checking for updates...' }
    } catch (err) {
      return { status: 'error', message: 'Could not check for updates' }
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
