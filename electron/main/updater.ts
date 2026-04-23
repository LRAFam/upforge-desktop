import { autoUpdater } from 'electron-updater'
import { BrowserWindow, app } from 'electron'
import log from 'electron-log'

autoUpdater.logger = log
autoUpdater.autoDownload = false  // we control the download explicitly
autoUpdater.autoInstallOnAppQuit = false

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
  // (both update-not-available and error can fire in sequence on some configurations)
  let readyCalled = false
  const safeOnReady = () => {
    if (readyCalled) return
    readyCalled = true
    onReady()
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
    autoUpdater.downloadUpdate()
  })

  autoUpdater.on('download-progress', (progress) => {
    log.info(`[Updater] Downloading: ${Math.round(progress.percent)}%`)
    send('updater:progress', progress.percent)
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info('[Updater] Download complete:', info.version)
    send('updater:downloaded', info)
    setTimeout(() => {
      // Signal the main process to allow windows to close (disables tray minimise-on-close).
      // This must happen BEFORE windows are destroyed so that if NSIS sends WM_CLOSE
      // to any lingering window it is honoured rather than swallowed.
      beforeQuit?.()
      // Destroy all open windows so Electron releases file handles before
      // the NSIS installer tries to overwrite the old install directory.
      BrowserWindow.getAllWindows().forEach((win) => {
        try { win.destroy() } catch { /* ignore */ }
      })
      autoUpdater.quitAndInstall(true, true)
    }, 1500)
  })

  autoUpdater.on('update-not-available', () => {
    log.info('[Updater] Up to date')
    send('updater:not-available')
    safeOnReady()
  })

  autoUpdater.on('error', (err) => {
    log.error('[Updater] Error:', err.message || err)
    send('updater:error', err.message)
    safeOnReady()
  })

  autoUpdater.checkForUpdates()
}
