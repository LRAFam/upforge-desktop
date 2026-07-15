import { autoUpdater } from 'electron-updater'
import { BrowserWindow, app } from 'electron'
import log from 'electron-log'
import { showAppNotification } from './app-notifications'

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
let isActivityBlockingUpdate = () => false
let pendingUpdateCheck = false
let pendingUpdateDownload = false

export function setUpdateActivityGuard(guard: () => boolean): void {
  isActivityBlockingUpdate = guard
}

export function shouldDeferUpdateWork(): boolean {
  return isActivityBlockingUpdate()
}

function downloadAvailableUpdate(onError?: (message: string) => void): void {
  if (shouldDeferUpdateWork()) {
    pendingUpdateDownload = true
    log.info('[Updater] Deferring update download while a game or recording is active')
    return
  }
  pendingUpdateDownload = false
  void autoUpdater.downloadUpdate().catch((err: Error) => {
    log.error('[Updater] downloadUpdate failed:', err.message)
    state = { phase: 'error', error: err.message }
    if (onError) onError(err.message)
    else broadcastToAll('updater:error', err.message)
  })
}

export function resumeDeferredUpdateWork(): void {
  if (shouldDeferUpdateWork()) return
  if (pendingUpdateDownload && state.phase === 'available') {
    downloadAvailableUpdate()
    return
  }
  if (pendingUpdateCheck) {
    pendingUpdateCheck = false
    checkForUpdatesIfIdle()
  }
}

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
  startPeriodicUpdateChecks()
  // Catch updates that finished downloading while splash was still open.
  if (state.phase === 'ready' && state.version) {
    notifyUpdateReady(state.version)
  } else if (state.phase !== 'downloading' && state.phase !== 'checking') {
    checkForUpdatesIfIdle()
  }
}

const PERIODIC_UPDATE_INTERVAL_MS = 2 * 60 * 60 * 1000 // 2 hours
let periodicCheckTimer: ReturnType<typeof setInterval> | null = null

function notifyUpdateReady(version: string): void {
  showAppNotification({
    title: 'UpForge update ready',
    body: `v${version} downloaded — click Restart now in UpForge to install.`,
    silent: true,
  })
}

export function checkForUpdatesIfIdle(): void {
  if (!app.isPackaged) return
  if (shouldDeferUpdateWork()) {
    pendingUpdateCheck = true
    log.info('[Updater] Deferring update check while a game or recording is active')
    return
  }
  if (state.phase === 'downloading' || state.phase === 'checking') return
  pendingUpdateCheck = false
  log.info('[Updater] Background update check')
  void autoUpdater.checkForUpdates().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    if (!isTransientUpdateError(msg)) {
      log.warn('[Updater] Background check failed:', msg)
    }
  })
}

export function startPeriodicUpdateChecks(): void {
  if (!app.isPackaged || periodicCheckTimer) return

  periodicCheckTimer = setInterval(() => {
    checkForUpdatesIfIdle()
  }, PERIODIC_UPDATE_INTERVAL_MS)
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
    if (shouldDeferUpdateWork() && !startupComplete) finishStartupCheck()
    downloadAvailableUpdate((message) => {
      send('updater:error', message)
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
    } else {
      notifyUpdateReady(info.version)
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
  const INITIAL_DELAY_MS = 2_000

  void (async () => {
    await sleep(INITIAL_DELAY_MS)
    if (shouldDeferUpdateWork()) {
      pendingUpdateCheck = true
      log.info('[Updater] Startup update check deferred while game is active')
      finishStartupCheck()
      return
    }

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
