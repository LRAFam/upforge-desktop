import { autoUpdater } from 'electron-updater'
import { BrowserWindow, app } from 'electron'
import log from 'electron-log'

autoUpdater.logger = log
autoUpdater.autoDownload = false  // we control the download explicitly
autoUpdater.autoInstallOnAppQuit = false

export function setupAutoUpdater(splashWindow: BrowserWindow | null, onReady: () => void): void {
  // Only run in production
  if (!app.isPackaged) {
    onReady()
    return
  }

  const send = (channel: string, payload?: unknown) => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send(channel, payload)
    }
  }

  autoUpdater.on('checking-for-update', () => {
    log.info('[Updater] Checking for updates')
    send('updater:checking')
  })

  autoUpdater.on('update-available', (info) => {
    log.info('[Updater] Update available:', info.version)
    send('updater:available', info)
    // Start download now that we know one is available
    autoUpdater.downloadUpdate()
  })

  autoUpdater.on('download-progress', (progress) => {
    log.info(`[Updater] Downloading: ${Math.round(progress.percent)}%`)
    send('updater:progress', progress.percent)
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info('[Updater] Download complete:', info.version)
    send('updater:downloaded', info)
    // Install silently and relaunch — no user interaction needed
    // isSilent=true suppresses the installer UI on Windows
    // isForceRunAfter=true relaunches the app after install
    setTimeout(() => {
      autoUpdater.quitAndInstall(true, true)
    }, 1500)
  })

  autoUpdater.on('update-not-available', () => {
    log.info('[Updater] Up to date')
    send('updater:not-available')
    onReady()
  })

  autoUpdater.on('error', (err) => {
    log.error('[Updater] Error:', err.message || err)
    send('updater:error', err.message)
    // Don't block startup on updater errors
    onReady()
  })

  autoUpdater.checkForUpdates()
}
