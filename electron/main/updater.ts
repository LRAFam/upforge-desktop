import { autoUpdater } from 'electron-updater'
import { Notification, app } from 'electron'
import log from 'electron-log'

autoUpdater.logger = log
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

export function setupAutoUpdater(onUpdateAvailable?: () => void): void {
  // Only run in production
  if (!app.isPackaged) return

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...')
  })

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version)
    onUpdateAvailable?.()
    new Notification({
      title: 'UpForge Update',
      body: `Version ${info.version} is downloading in the background.`
    }).show()
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version)
    new Notification({
      title: 'UpForge Updated',
      body: `Version ${info.version} ready. It will install when you quit.`
    }).show()
  })

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err)
  })

  // Check on startup, then every 4 hours
  autoUpdater.checkForUpdatesAndNotify()
  setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1000)
}
