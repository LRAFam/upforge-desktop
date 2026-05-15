import { autoUpdater } from 'electron-updater'
import { BrowserWindow, app } from 'electron'
import log from 'electron-log'

autoUpdater.logger = log
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false

export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

export interface UpdateState {
  phase: UpdatePhase
  version?: string
  percent?: number
  error?: string
}

let state: UpdateState = { phase: 'idle' }
let startupComplete = false

function broadcastToAll(channel: string, payload?: unknown) {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  })
}

export function getUpdateState(): UpdateState {
  return { ...state }
}

export function markStartupComplete(): void {
  startupComplete = true
}

export function installUpdate(): void {
  BrowserWindow.getAllWindows().forEach(win => {
    try { win.destroy() } catch { /* ignore */ }
  })
  autoUpdater.quitAndInstall(true, true)
}

export function setupAutoUpdater(
  splashWindow: BrowserWindow | null,
  onReady: () => void,
  beforeQuit?: () => void
): void {
  // Only run in production
  if (!app.isPackaged) {
    onReady()
    return
  }

  // Guard: onReady must only ever fire once, even if multiple updater events arrive
  let readyCalled = false
  const safeOnReady = () => {
    if (readyCalled) return
    readyCalled = true
    onReady()
  }

  // Send to splash (startup phase) and broadcast to all windows (post-startup)
  const send = (channel: string, payload?: unknown) => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send(channel, payload)
    }
    if (startupComplete) broadcastToAll(channel, payload)
  }

  autoUpdater.on('checking-for-update', () => {
    state = { phase: 'checking' }
    log.info('[Updater] Checking for updates')
    send('updater:checking')
  })

  autoUpdater.on('update-available', (info) => {
    state = { phase: 'available', version: info.version }
    log.info('[Updater] Update available:', info.version)
    send('updater:available', info)
    autoUpdater.downloadUpdate()
  })

  autoUpdater.on('download-progress', (progress) => {
    const pct = Number.isFinite(progress.percent) ? progress.percent : 0
    state = { phase: 'downloading', version: state.version, percent: pct }
    log.info(`[Updater] Downloading: ${Math.round(pct)}%`)
    send('updater:progress', pct)
  })

  autoUpdater.on('update-downloaded', (info) => {
    state = { phase: 'ready', version: info.version }
    log.info('[Updater] Download complete:', info.version)
    send('updater:downloaded', info)

    if (!startupComplete) {
      // Startup flow: user is watching the splash — auto-install after brief pause
      setTimeout(() => {
        beforeQuit?.()
        BrowserWindow.getAllWindows().forEach(win => {
          try { win.destroy() } catch { /* ignore */ }
        })
        autoUpdater.quitAndInstall(true, true)
      }, 1500)
    }
    // Post-startup: wait for user to click "Restart now" via updater:install IPC
  })

  autoUpdater.on('update-not-available', () => {
    state = { phase: 'idle' }
    log.info('[Updater] Up to date')
    send('updater:not-available')
    safeOnReady()
  })

  autoUpdater.on('error', (err) => {
    state = { phase: 'error', error: err.message }
    log.error('[Updater] Error:', err.message || err)
    send('updater:error', err.message)
    safeOnReady()
  })

  autoUpdater.checkForUpdates()
}
