import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  shell,
  screen,
  Notification,
  globalShortcut
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupAutoUpdater } from './updater'
import { GameDetector } from './game-detector'
import { Recorder } from './recorder'
import { RiotLocalApi } from './riot-local-api'
import { UploadManager } from './upload-manager'
import { AuthManager } from './auth-manager'
import { SettingsManager } from './settings-manager'
import { setupIpcHandlers } from './ipc-handlers'
import { RecordingsStore } from './recordings-store'
import type { MatchData } from './riot-local-api'

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let postGameWindow: BrowserWindow | null = null
let isQuitting = false
let trayRefreshInterval: ReturnType<typeof setInterval> | null = null
let ffmpegOk = true // updated after preflight; exposed via app:get-status

const gameDetector = new GameDetector()
const recorder = new Recorder()
recorder.onStatusChange = (recording, error) => {
  mainWindow?.webContents.send('recording:status-changed', { recording, error: error ?? null })
}
const riotLocalApi = new RiotLocalApi()
const authManager = new AuthManager()
let uploadManager: UploadManager
let settingsManager: SettingsManager
let recordingsStore: RecordingsStore

// Set by setupGameDetection — cancel pending match-wait when game quits from lobby
let cancelMatchWait: (() => void) | null = null
let waitingForMatch = false
// Prevents double-handling when onMatchEnded + game-stopped both fire for same match
let matchHandled = false

// Activity log — recent events shown on dashboard for user visibility
const MAX_LOG_ENTRIES = 30
const activityLog: { time: number; message: string }[] = []

function logActivity(message: string): void {
  const entry = { time: Date.now(), message }
  activityLog.push(entry)
  if (activityLog.length > MAX_LOG_ENTRIES) activityLog.shift()
  mainWindow?.webContents.send('app:activity-log', activityLog.slice())
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 860,
    height: 580,
    minWidth: 700,
    minHeight: 480,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
  })

  win.on('ready-to-show', () => win.show())
  win.on('close', (e) => {
    // Minimise to tray instead of closing — unless app is actually quitting
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function createPostGameWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 380,
    height: 260,
    resizable: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Position bottom-right corner
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.workAreaSize
  win.setPosition(width - 400, height - 280)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/post-game`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'post-game' })
  }

  return win
}

function createTray(): void {
  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/tray-icon.png'))
  tray = new Tray(icon.resize({ width: 16, height: 16 }))

  const updateTrayMenu = (): void => {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Open UpForge',
        click: () => {
          if (!mainWindow) {
            mainWindow = createMainWindow()
          } else {
            mainWindow.show()
            mainWindow.focus()
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Open in Browser',
        click: () => shell.openExternal('https://upforge.gg/dashboard')
      },
      { type: 'separator' },
      {
        label: 'Recording: ' + (recorder.isRecording() ? '● Active' : '○ Idle'),
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Quit UpForge',
        click: () => {
          app.quit()
        }
      }
    ])

    tray!.setContextMenu(menu)
  }

  tray.setToolTip('UpForge — Valorant AI Coaching')
  updateTrayMenu()

  // Single click toggles window (Mac: click fires before context menu on some versions)
  tray.on('click', () => {
    if (!mainWindow) {
      mainWindow = createMainWindow()
    } else if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  tray.on('double-click', () => {
    if (!mainWindow) {
      mainWindow = createMainWindow()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // Refresh tray menu periodically to reflect recording state
  trayRefreshInterval = setInterval(updateTrayMenu, 5000)
}

function setupGameDetection(): void {
  // All known Valorant game modes returned by the Riot Local Client API
  const ALL_MODES = new Set(['COMPETITIVE', 'PREMIER', 'CLASSIC', 'DEATHMATCH', 'SPIKERUSH', 'SWIFTPLAY', 'SNOWBALL'])

  /**
   * Stop recording, collect the match timeline (with Riot MatchDetails), and
   * trigger the post-game upload window. Called from both onMatchEnded and
   * game-stopped — protected by the module-level matchHandled flag.
   */
  async function handleMatchEnd(game: string): Promise<void> {
    const timeline = await riotLocalApi.stop()
    const recordingDuration = recorder.getRecordingDuration()
    await recorder.stop()

    const videoPath = recorder.getLastRecordingPath()
    const fileSize = recorder.getLastRecordingSize()
    const user = authManager.getUser()
    const map = timeline?.map ?? null
    const agent = timeline?.agent ?? null
    const gameMode = riotLocalApi.getLastGameMode() ?? 'UNKNOWN'
    const config = settingsManager?.get()
    const autoAnalyse = config?.autoAnalyse !== false

    tray?.setToolTip('UpForge — Valorant AI Coaching')

    const MIN_DURATION_SECONDS = 120
    const MIN_FILE_SIZE_BYTES = 1024 * 1024

    if (recordingDuration > 0 && recordingDuration < MIN_DURATION_SECONDS) {
      console.log(`[GameDetector] Recording too short (${recordingDuration}s) — ignoring`)
      logActivity(`Recording too short (${recordingDuration}s) — discarded`)
      if (videoPath && require('fs').existsSync(videoPath)) {
        try { require('fs').unlinkSync(videoPath) } catch { /* ignore */ }
      }
      return
    }

    postGameWindow = createPostGameWindow()
    postGameWindow.on('closed', () => { postGameWindow = null })

    postGameWindow.webContents.once('did-finish-load', async () => {
      if (!videoPath || !require('fs').existsSync(videoPath)) {
        const ffmpegError = recorder.getLastError()
        const errorMsg = ffmpegError
          ? `Recording failed: ${ffmpegError}`
          : 'Recording file was not created — ffmpeg may have failed to start. Check that ffmpeg is installed (dev) or the app was not corrupted (production).'
        postGameWindow?.webContents.send('post-game:upload-error', errorMsg)
        return
      }

      if (fileSize < MIN_FILE_SIZE_BYTES) {
        const sizeMB = (fileSize / (1024 * 1024)).toFixed(2)
        const errorMsg = `Recording appears corrupt or empty (${sizeMB} MB). Please check your ffmpeg setup.`
        console.error(`[GameDetector] ${errorMsg}`)
        postGameWindow?.webContents.send('post-game:upload-error', errorMsg)
        return
      }

      if (!autoAnalyse) {
        const recording = recordingsStore.add({
          path: videoPath,
          riotName: user?.riot_name ?? '',
          riotTag: user?.riot_tag ?? '',
          game,
          map,
          agent,
          gameMode,
          timeline
        })
        postGameWindow?.webContents.send('post-game:pending', {
          recordingId: recording.id,
          game,
          map,
          agent
        })
        mainWindow?.webContents.send('recordings:updated')
        return
      }

      tray?.setToolTip('UpForge — Uploading...')
      await doUploadAndAnalyse(null, videoPath, user?.riot_name ?? '', user?.riot_tag ?? '',
        game, map, agent, timeline, postGameWindow!)
    })
  }

  gameDetector.on('game-started', async (game: string) => {
    console.log(`[GameDetector] ${game} started`)
    logActivity(`${game === 'cs2' ? 'CS2' : 'Valorant'} detected — waiting for match`)

    const config = settingsManager?.get()
    const recorderConfig = config ? {
      quality: config.recordingQuality,
      bitrate: config.recordingBitrate,
      savePath: config.savePath
    } : undefined

    // Check disk space now so the warning shows while in lobby
    const savePath = config?.savePath ?? app.getPath('userData')
    const freeBytes = await recorder.getFreeDiskSpace(savePath)
    const TWO_GB = 2 * 1024 * 1024 * 1024
    if (freeBytes < TWO_GB) {
      const freeGB = (freeBytes / (1024 ** 3)).toFixed(1)
      console.warn(`[Recorder] Low disk space: ${freeGB} GB free`)
      mainWindow?.webContents.send('app:warning', { message: `Low disk space (${freeGB} GB free) — recording may be cut short` })
      if (Notification.isSupported()) {
        new Notification({
          title: 'UpForge — Low Disk Space',
          body: `Only ${freeGB} GB free. Recording may be cut short.`,
          silent: true
        }).show()
      }
    }

    tray?.setToolTip('UpForge — Match loading...')
    mainWindow?.webContents.send('recording:waiting-for-match', { waiting: true })

    // VALORANT-Win64-Shipping.exe is the in-game process — its presence confirms a map
    // is loading or actively in progress. The Riot Live Client Data API (port 2999) was
    // deprecated; we no longer gate recording on it.
    // Wait 90 seconds for the loading screen to pass, cancelling early if the process dies.
    let matchActive = false
    let gameMode: string | null = null
    let cancelled = false
    cancelMatchWait = () => { cancelled = true }
    waitingForMatch = true

    const recordedModes = config?.recordedModes ?? ['COMPETITIVE', 'PREMIER']
    const filterByMode = recordedModes.length > 0 &&
      !([...ALL_MODES].every(m => recordedModes.includes(m)))

    // ── Presence-based match detection ────────────────────────────────────
    // Try to use the Riot Local API to detect when the match actually goes
    // INGAME, so we avoid the old blind 90s wait.  Falls back to a 90s wait
    // if the lockfile / auth is not available (rare on modern installs).
    // ──────────────────────────────────────────────────────────────────────
    let matchStartTime: number | null = null
    let modeConfident = false
    const authOk = game === 'valorant' && await riotLocalApi.initAuth()

    if (authOk) {
      logActivity('Riot Client API ready — waiting for INGAME presence')
      // Wait up to 25 minutes for INGAME (handles long Agent Select)
      const PRESENCE_TIMEOUT_MS = 25 * 60 * 1000
      const deadline = Date.now() + PRESENCE_TIMEOUT_MS
      while (Date.now() < deadline && !cancelled) {
        await new Promise((r) => setTimeout(r, 3000))
        if (cancelled) break
        const stillRunning = await gameDetector.isMatchProcessRunning()
        if (!stillRunning) { cancelled = true; break }
        try {
          const state = await riotLocalApi.getSessionState()
          if (state?.sessionLoopState === 'INGAME') {
            matchStartTime = Date.now()
            if (state.queueId) {
              gameMode = state.queueId.toUpperCase().replace(/\b(unrated)\b/i, 'CLASSIC')
              // Use the exported normalizer for an accurate label
              const { normalizeQueueId } = await import('./riot-local-api')
              gameMode = normalizeQueueId(state.queueId)
              modeConfident = true
            }
            break
          }
        } catch { /* presence endpoint not yet up — keep waiting */ }
      }
    } else {
      // Fallback: wait 90 s for the loading screen
      const LOADING_DELAY_MS = 90_000
      logActivity('Riot Client API unavailable — recording starts in 90s')
      const deadline = Date.now() + LOADING_DELAY_MS
      while (Date.now() < deadline && !cancelled) {
        await new Promise((r) => setTimeout(r, 5000))
        if (cancelled) break
        const stillRunning = await gameDetector.isMatchProcessRunning()
        if (!stillRunning) { cancelled = true; break }
      }
    }

    waitingForMatch = false
    cancelMatchWait = null
    mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })

    if (cancelled) {
      logActivity('Match cancelled (game quit during loading)')
      console.log('[GameDetector] Game quit during loading — no recording')
      tray?.setToolTip('UpForge — Valorant AI Coaching')
      return
    }

    // If presence didn't give us a mode, try the log file as last resort
    if (!modeConfident) {
      const logMode = await riotLocalApi.getGameModeFromLog()
      if (logMode) { gameMode = logMode; modeConfident = true }
    }

    if (filterByMode && modeConfident && gameMode && !recordedModes.includes(gameMode)) {
      console.log(`[GameDetector] Skipping recording — mode is ${gameMode} (not in recordedModes)`)
      logActivity(`Mode ${gameMode} not in recorded modes — skipped`)
      tray?.setToolTip('UpForge — Valorant AI Coaching')
      return
    }

    if (!gameMode) gameMode = 'COMPETITIVE'
    matchActive = true
    matchHandled = false

    logActivity(`Match detected (${gameMode}${modeConfident ? '' : '?'}) — starting recording`)
    console.log(`[GameDetector] Match confirmed! gameMode=${gameMode} confident=${modeConfident} matchStartTime=${matchStartTime}`)

    // Wire up onMatchEnded — fires when presence transitions INGAME → MENUS.
    // This is the primary way we know the match ended (before the process dies).
    riotLocalApi.onMatchEnded = async () => {
      if (matchHandled) return
      matchHandled = true
      console.log('[RiotLocalApi] onMatchEnded fired — stopping recording')
      logActivity('Match ended (presence) — stopping recording')
      await handleMatchEnd(game)
    }

    // Start tracking + recording
    riotLocalApi.start(game, matchStartTime ?? undefined)

    tray?.setToolTip('UpForge — Recording...')
    await recorder.start(game, recorderConfig)
    logActivity(`Recording started (${gameMode ?? 'unknown mode'})`)

    const user = authManager.getUser()
    const userLabel = (user?.riot_name && user?.riot_tag)
      ? `${user.riot_name}#${user.riot_tag}`
      : user?.name ?? 'your account'
    const gameLabel = game === 'cs2' ? 'CS2' : 'Valorant'
    tray?.setToolTip(`UpForge — Recording ${gameLabel} (${userLabel})`)

    if (Notification.isSupported()) {
      new Notification({
        title: `UpForge is recording`,
        body: `${gameLabel} match started for ${userLabel}`,
        silent: true
      }).show()
    }
  })

  gameDetector.on('game-stopped', async (game: string) => {
    console.log(`[GameDetector] ${game} stopped`)

    // Game quit while still in lobby (before match started)
    if (cancelMatchWait) {
      cancelMatchWait()
      cancelMatchWait = null
      waitingForMatch = false
      mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })
      tray?.setToolTip('UpForge — Valorant AI Coaching')
      console.log('[GameDetector] Game quit before match — no recording to save')
      logActivity('Game quit before match started — nothing recorded')
      return
    }

    // Presence already fired onMatchEnded and the match was handled — nothing to do
    if (matchHandled) {
      console.log('[GameDetector] Match already handled by onMatchEnded — skipping game-stopped')
      riotLocalApi.onMatchEnded = null
      return
    }

    // Process died without a clean presence transition (crash, force-quit, etc.)
    matchHandled = true
    logActivity('Game process ended — stopping recording')
    await handleMatchEnd(game)
  })

  gameDetector.start()
}

/** Upload a recording and poll for the analysis result, sending IPC events to `targetWindow`. */
async function doUploadAndAnalyse(
  recordingId: string | null,
  videoPath: string,
  riotName: string,
  riotTag: string,
  game: string,
  map: string | null,
  agent: string | null,
  timeline: MatchData | null,
  targetWindow: BrowserWindow
): Promise<void> {
  const send = (channel: string, payload?: unknown) => {
    if (!targetWindow.isDestroyed()) targetWindow.webContents.send(channel, payload)
  }
  try {
    send('post-game:upload-start', { game, map, agent })
    logActivity(`Uploading recording${map ? ` (${map}${agent ? ` · ${agent}` : ''})` : ''}`)

    const result = await uploadManager.upload({
      videoPath,
      riotName,
      riotTag,
      game,
      map,
      agent,
      timeline,
      onProgress: (pct) => {
        send('post-game:upload-progress', pct)
      }
    })

    send('post-game:upload-complete', { jobId: result.job_id })
    logActivity('Upload complete — AI analysis running')
    tray?.setToolTip('UpForge — Analysing...')

    // Mark as analysed in store (if this was a saved recording)
    if (recordingId) {
      recordingsStore.markAnalysed(recordingId, result.job_id)
      mainWindow?.webContents.send('recordings:updated')
    }

    // Auto-delete after upload if configured
    if (settingsManager?.get().autoDelete) {
      recorder.deleteRecording(videoPath)
    }

    // Poll for analysis result (up to 10 minutes)
    const startTime = Date.now()
    const pollTimer = setInterval(async () => {
      try {
        const status = await uploadManager.pollStatus(result.job_id)
        if (status.status === 'completed' && status.result) {
          clearInterval(pollTimer)
          const score = (status.result as Record<string, unknown>).overall_score as number | undefined
          logActivity(`Analysis ready${score != null ? ` — Score: ${score}/100` : ''}`)
          send('post-game:analysis-ready', {
            overall_score: (status.result as Record<string, unknown>).overall_score,
            analysis_id: (status.result as Record<string, unknown>).analysis_id,
            top_issue: (status.result as Record<string, unknown>).top_issue
          })
          mainWindow?.webContents.send('dashboard:refresh')
          tray?.setToolTip('UpForge — Valorant AI Coaching')
          const notifAgent = agent ?? 'Valorant'
          const notifMap = map ? ` on ${map}` : ''
          const notifScore = score != null ? ` — Score: ${score}/100` : ''
          new Notification({
            title: 'UpForge — Analysis Ready',
            body: `${notifAgent}${notifMap}${notifScore}`
          }).show()
        } else if (status.status === 'failed') {
          clearInterval(pollTimer)
          logActivity('Analysis failed')
          send('post-game:upload-error', 'Analysis failed. Please try again.')
          tray?.setToolTip('UpForge — Valorant AI Coaching')
        } else if (Date.now() - startTime > 600_000) {
          clearInterval(pollTimer)
          logActivity('Analysis timed out')
          send('post-game:upload-error', 'Analysis timed out.')
          tray?.setToolTip('UpForge — Valorant AI Coaching')
        }
      } catch { /* ignore poll errors */ }
    }, 15_000)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload failed'
    logActivity(`Upload failed: ${msg}`)
    send('post-game:upload-error', msg)
    tray?.setToolTip('UpForge — Valorant AI Coaching')
  }
}

function createSplashWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 500,
    height: 320,
    resizable: false,
    frame: false,
    center: true,
    skipTaskbar: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/splash`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'splash' })
  }

  return win
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('gg.upforge.desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  uploadManager = new UploadManager(authManager)
  settingsManager = new SettingsManager()
  recordingsStore = new RecordingsStore()

  // Restore auth session from keychain before creating window
  await authManager.loadStoredToken()

  // Show splash launcher while we check for updates
  const splashWindow = createSplashWindow()

  createTray()

  // Called when updater confirms no update pending (or errors out).
  // Close splash and open the main window.
  const launchMainApp = () => {
    mainWindow = createMainWindow()
    setupGameDetection()
    // Small delay so main window is loaded before splash closes
    setTimeout(() => {
      if (!splashWindow.isDestroyed()) splashWindow.close()
    }, 400)
  }

  setupAutoUpdater(splashWindow, launchMainApp, () => { isQuitting = true })

  // Verify ffmpeg is accessible and log a warning if not — better to know early
  recorder.preflight().then((result) => {
    ffmpegOk = result.ok
    if (!result.ok) {
      console.error('[App] ffmpeg preflight FAILED:', result.error)
      if (Notification.isSupported()) {
        new Notification({
          title: 'UpForge — Recording Unavailable',
          body: `ffmpeg not found: ${result.error ?? 'unknown error'}. Recording will not work.`
        }).show()
      }
      // Push the warning to the dashboard if it's already open
      mainWindow?.webContents.send('app:ffmpeg-status', { ok: false })
    } else {
      console.log('[App] ffmpeg preflight OK')
    }
  })
  setupIpcHandlers(ipcMain, authManager, recorder, gameDetector, settingsManager, () => {
    postGameWindow = createPostGameWindow()
    postGameWindow.webContents.once('did-finish-load', () => {
      postGameWindow?.webContents.send('post-game:upload-start', { game: 'valorant', map: 'Bind', agent: 'Jett' })
      setTimeout(() => postGameWindow?.webContents.send('post-game:upload-progress', 45), 800)
      setTimeout(() => postGameWindow?.webContents.send('post-game:upload-progress', 100), 1600)
      setTimeout(() => postGameWindow?.webContents.send('post-game:upload-complete', {}), 2000)
      setTimeout(() => postGameWindow?.webContents.send('post-game:analysis-ready', {
        overall_score: 72,
        analysis_id: 999,
        top_issue: 'Positioning during post-plant — you were caught in the open on 4 of 6 clutch attempts.'
      }), 5500)
    })
  }, () => ffmpegOk, () => waitingForMatch, () => activityLog.slice())

  // Debug: test Riot Live Client API connection — returns raw response or error details
  ipcMain.handle('debug:test-riot-api', async () => {
    const net = await import('net')
    // TCP check on port 2999 (deprecated Live Client API — expected closed in 2026)
    const portOpen = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket()
      socket.setTimeout(2000)
      socket.on('connect', () => { socket.destroy(); resolve(true) })
      socket.on('error', () => resolve(false))
      socket.on('timeout', () => { socket.destroy(); resolve(false) })
      socket.connect(2999, '127.0.0.1')
    })
    const gameMode = await riotLocalApi.getGameMode()
    const logGameMode = await riotLocalApi.getGameModeFromLog()
    const processRunning = await gameDetector.isMatchProcessRunning()
    return { portOpen, gameMode, logGameMode, processRunning }
  })


  ipcMain.handle('recordings:get', () => recordingsStore.getPending())

  ipcMain.handle('recordings:analyse', async (_e, { id }: { id: string }) => {
    const recording = recordingsStore.getById(id)
    if (!recording) return { error: 'Recording not found' }

    const user = authManager.getUser()

    const triggerAnalysis = async (win: BrowserWindow) => {
      await doUploadAndAnalyse(
        recording.id,
        recording.path,
        recording.riotName || user?.riot_name || '',
        recording.riotTag || user?.riot_tag || '',
        recording.game,
        recording.map,
        recording.agent,
        recording.timeline,
        win
      )
    }

    if (!postGameWindow || postGameWindow.isDestroyed()) {
      postGameWindow = createPostGameWindow()
      postGameWindow.webContents.once('did-finish-load', () => triggerAnalysis(postGameWindow!))
    } else {
      postGameWindow.show()
      postGameWindow.focus()
      // Window is already loaded — trigger directly
      triggerAnalysis(postGameWindow)
    }

    return { ok: true }
  })

  ipcMain.handle('recordings:dismiss', (_e, { id }: { id: string }) => {
    recordingsStore.remove(id)
    mainWindow?.webContents.send('recordings:updated')
  })

  // Register global shortcut to show/focus window
  globalShortcut.register('CommandOrControl+Shift+U', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
})

// Re-show window when clicking dock icon on Mac
app.on('activate', () => {
  if (!mainWindow) {
    mainWindow = createMainWindow()
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
})

app.on('window-all-closed', () => {
  // Don't quit when all windows close — keep running in tray
})

app.on('before-quit', () => {
  isQuitting = true
  if (trayRefreshInterval) clearInterval(trayRefreshInterval)
  tray?.destroy()
  tray = null
  gameDetector.stop()
  recorder.forceStop()
  globalShortcut.unregisterAll()
})
