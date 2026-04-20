import { IpcMain, BrowserWindow, app, dialog } from 'electron'
import { is } from '@electron-toolkit/utils'
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
    return {
      recording: recorder.isRecording(),
      currentGame: gameDetector.currentGame(),
      authenticated: auth.isAuthenticated(),
      user: auth.getUser(),
      platform: process.platform,
      isDev: is.dev,
      version: app.getVersion()
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

  // Dev-only: simulate game session on Mac for testing
  ipcMain.handle('dev:simulate-game', (_e, { game: gameName, durationMs } = {}) => {
    if (!is.dev) return { error: 'Dev only' }
    gameDetector.simulateGame(gameName ?? 'valorant', durationMs ?? 10000)
    return { ok: true }
  })

  // Updater
  ipcMain.handle('updater:check', () => {
    if (!is.dev) {
      const { autoUpdater } = require('electron-updater')
      autoUpdater.checkForUpdatesAndNotify()
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
