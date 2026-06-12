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

/** CI may expose a release before latest.yml is on the CDN — treat as transient. */
function isTransientUpdateError(message: string): boolean {
  const is404 = /404|not found|cannot find|httperror|cannot download/i.test(message)
  return is404 && (/latest\.yml/i.test(message) || /UpForge-Setup-.*\.exe/i.test(message))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

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

export function installUpdate(beforeQuit?: () => void): void {
  beforeQuit?.()
  BrowserWindow.getAllWindows().forEach(win => {
    try { if (!win.isDestroyed()) win.destroy() } catch { /* ignore */ }
  })
  autoUpdater.quitAndInstall(true, true)
}

export function setupAutoUpdater(
  splashWindow: BrowserWindow | null,
  onReady: () => void,
  beforeQuit?: () => void
): void {
  if (!app.isPackaged) {
    onReady()
    return
  }

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
    if (startupComplete) broadcastToAll(channel, payload)
  }

  // Never leave splash stuck if updater hangs
  const startupDeadline = setTimeout(() => {
    log.warn('[Updater] Startup check timed out — continuing without update')
    safeOnReady()
  }, 3 * 60 * 1000)

  const finishStartup = () => {
    clearTimeout(startupDeadline)
    safeOnReady()
  }

  let startupCheckDone = false
  const finishStartupCheck = () => {
    if (startupCheckDone) return
    startupCheckDone = true
    finishStartup()
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
    void autoUpdater.downloadUpdate().catch((err: Error) => {
      log.error('[Updater] downloadUpdate failed:', err.message)
      state = { phase: 'error', error: err.message }
      send('updater:error', err.message)
      if (!startupComplete) finishStartupCheck()
    })
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
      setTimeout(() => {
        beforeQuit?.()
        BrowserWindow.getAllWindows().forEach(win => {
          try { if (!win.isDestroyed()) win.destroy() } catch { /* ignore */ }
        })
        autoUpdater.quitAndInstall(true, true)
      }, 1500)
    }
  })

  autoUpdater.on('update-not-available', () => {
    state = { phase: 'idle' }
    log.info('[Updater] Up to date')
    send('updater:not-available')
    finishStartupCheck()
  })

  autoUpdater.on('error', (err) => {
    const msg = err.message || String(err)
    if (!startupComplete && isTransientUpdateError(msg)) {
      log.warn('[Updater] Transient metadata error (handled by retry loop):', msg)
      return
    }
    state = { phase: 'error', error: msg }
    log.error('[Updater] Error:', msg)
    send('updater:error', msg)
    if (!startupComplete) finishStartupCheck()
    else if (!startupCheckDone) finishStartupCheck()
  })

  const MAX_ATTEMPTS = 8
  const RETRY_BASE_MS = 10_000
  const INITIAL_DELAY_MS = 8_000

  void (async () => {
    await sleep(INITIAL_DELAY_MS)

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await autoUpdater.checkForUpdates()
        // Resolved — wait for update-* events or not-available
        return
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (isTransientUpdateError(msg) && attempt < MAX_ATTEMPTS) {
          const delayMs = RETRY_BASE_MS * Math.min(attempt, 4)
          log.warn(
            `[Updater] Release metadata not ready (${attempt}/${MAX_ATTEMPTS}), retrying in ${delayMs / 1000}s…`
          )
          await sleep(delayMs)
          continue
        }
        if (isTransientUpdateError(msg)) {
          log.warn('[Updater] Update assets unavailable after retries — continuing without update')
        } else {
          log.error('[Updater] checkForUpdates failed:', msg)
          state = { phase: 'error', error: msg }
          send('updater:error', msg)
        }
        finishStartupCheck()
        return
      }
    }
  })()
}
