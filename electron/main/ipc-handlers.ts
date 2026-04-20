import { IpcMain, BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { AuthManager } from './auth-manager'
import { Recorder } from './recorder'
import { GameDetector } from './game-detector'

export function setupIpcHandlers(
  ipcMain: IpcMain,
  auth: AuthManager,
  recorder: Recorder,
  gameDetector: GameDetector
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
      isDev: is.dev
    }
  })

  // Dev-only: simulate game session on Mac for testing
  ipcMain.handle('dev:simulate-game', (_e, { game, durationMs } = {}) => {
    if (!is.dev) return { error: 'Dev only' }
    gameDetector.simulateGame(game ?? 'valorant', durationMs ?? 10000)
    return { ok: true }
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
}
