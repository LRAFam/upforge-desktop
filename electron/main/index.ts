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

    tray?.setToolTip('UpForge — Waiting for match...')
    mainWindow?.webContents.send('recording:waiting-for-match', { waiting: true })

    // Wait for Riot Local API to respond — this only happens once a match loads.
    // Use isMatchActive() as the trigger (API responds = match in progress).
    // getGameMode() is unreliable as the sole trigger since gameMode field may vary.
    let matchActive = false
    let gameMode: string | null = null
    let cancelled = false
    cancelMatchWait = () => { cancelled = true }
    waitingForMatch = true

    const recordedModes = config?.recordedModes ?? ['COMPETITIVE', 'PREMIER']
    const filterByMode = recordedModes.length > 0 &&
      !([...ALL_MODES].every(m => recordedModes.includes(m)))

    // Poll up to 120 attempts × 5s = 10 minutes (covers long queue wait times).
    // Probe immediately on first attempt — no initial wait.
    // PRIMARY: VALORANT-Win64-Shipping.exe only runs during an actual match (not lobby/queue).
    // SECONDARY: TCP port 2999 (Riot Live Client Data API) as a fallback.
    // IMPORTANT: Both signals can fire during loading screen / practice range before round 1.
    // We require gameMode to be confirmed by the Live Client Data API before starting — this
    // ensures we only record real in-progress matches, not lobby/queue/loading states.
    for (let attempt = 0; attempt < 120; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 5000))
      if (cancelled) {
        console.log('[GameDetector] Match wait cancelled — game quit before match started')
        waitingForMatch = false
        cancelMatchWait = null
        return
      }

      const processMatch = await gameDetector.isMatchProcessRunning()
      const portMatch = await riotLocalApi.isMatchActive()
      const signalDetected = processMatch || portMatch

      if (signalDetected) {
        // Port/process is up — now confirm with Live Client API (gameMode = match is truly live)
        // Retry up to 8 times × 3s = 24s to allow loading screens to finish
        for (let modeAttempt = 0; modeAttempt < 8 && !gameMode; modeAttempt++) {
          if (modeAttempt > 0) await new Promise((r) => setTimeout(r, 3000))
          gameMode = await riotLocalApi.getGameMode()
        }

        if (gameMode) {
          matchActive = true
          console.log(`[GameDetector] Match confirmed! process=${processMatch} port=${portMatch} gameMode=${gameMode}`)
          logActivity(`Match found (${gameMode}) — starting recording`)
          break
        }

        // Signal present but gameMode unavailable — still loading or practice range
        // Keep polling the outer loop rather than recording an unknown match
        console.log(`[GameDetector] Process/port signal present but Live Client API has no gameMode yet — waiting... (attempt ${attempt + 1}/120)`)
        continue
      }

      console.log(`[GameDetector] Waiting for match... (attempt ${attempt + 1}/120, process=${processMatch} port=${portMatch})`)
    }

    waitingForMatch = false
    cancelMatchWait = null
    mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })

    if (cancelled) return

    if (!matchActive || !gameMode) {
      const reason = !matchActive ? 'No Riot API response after 10 minutes' : 'Could not confirm game mode'
      console.log(`[GameDetector] ${reason} — skipping recording`)
      logActivity(`${reason} — skipped recording`)
      tray?.setToolTip('UpForge — Valorant AI Coaching')
      return
    }

    if (filterByMode && !recordedModes.includes(gameMode)) {
      console.log(`[GameDetector] Skipping recording — mode is ${gameMode} (not in recordedModes)`)
      logActivity(`Mode ${gameMode} not in recorded modes — skipped`)
      tray?.setToolTip('UpForge — Valorant AI Coaching')
      return
    }

    console.log(`[GameDetector] Match confirmed (${gameMode}) — starting recording`)

    // Start Riot Local API timeline tracking from match start
    riotLocalApi.start(game)

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

    // If we were still waiting for a match (player quit from lobby), cancel and clean up
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

    const MIN_DURATION_SECONDS = 120  // 2 minutes — ignore crash/test launches
    const MIN_FILE_SIZE_BYTES = 1024 * 1024  // 1 MB

    if (recordingDuration > 0 && recordingDuration < MIN_DURATION_SECONDS) {
      console.log(`[GameDetector] Recording too short (${recordingDuration}s) — ignoring`)
      logActivity(`Recording too short (${recordingDuration}s) — discarded`)
      // Clean up the tiny file
      if (videoPath && require('fs').existsSync(videoPath)) {
        try { require('fs').unlinkSync(videoPath) } catch { /* ignore */ }
      }
      tray?.setToolTip('UpForge — Valorant AI Coaching')
      return
    }

    // Always open the post-game window
    postGameWindow = createPostGameWindow()

    postGameWindow.webContents.once('did-finish-load', async () => {
      if (!videoPath || !require('fs').existsSync(videoPath)) {
        const ffmpegError = recorder.getLastError()
        const errorMsg = ffmpegError
          ? `Recording failed: ${ffmpegError}`
          : 'Recording file was not created — ffmpeg may have failed to start. Check that ffmpeg is installed (dev) or the app was not corrupted (production).'
        postGameWindow?.webContents.send('post-game:upload-error', errorMsg)
        tray?.setToolTip('UpForge — Valorant AI Coaching')
        return
      }

      if (fileSize < MIN_FILE_SIZE_BYTES) {
        const sizeMB = (fileSize / (1024 * 1024)).toFixed(2)
        const errorMsg = `Recording appears corrupt or empty (${sizeMB} MB). Please check your ffmpeg setup.`
        console.error(`[GameDetector] ${errorMsg}`)
        postGameWindow?.webContents.send('post-game:upload-error', errorMsg)
        tray?.setToolTip('UpForge — Valorant AI Coaching')
        return
      }

      if (!autoAnalyse) {
        // Save recording for later and show pending prompt
        tray?.setToolTip('UpForge — Valorant AI Coaching')
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

      // Auto-analyse: start upload immediately
      tray?.setToolTip('UpForge — Uploading...')
      await doUploadAndAnalyse(null, videoPath, user?.riot_name ?? '', user?.riot_tag ?? '',
        game, map, agent, timeline, postGameWindow!)
    })
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
  try {
    targetWindow.webContents.send('post-game:upload-start', { game, map, agent })
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
        targetWindow.webContents.send('post-game:upload-progress', pct)
      }
    })

    targetWindow.webContents.send('post-game:upload-complete', { jobId: result.job_id })
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
          targetWindow.webContents.send('post-game:analysis-ready', {
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
          targetWindow.webContents.send('post-game:upload-error', 'Analysis failed. Please try again.')
          tray?.setToolTip('UpForge — Valorant AI Coaching')
        } else if (Date.now() - startTime > 600_000) {
          clearInterval(pollTimer)
          logActivity('Analysis timed out')
          targetWindow.webContents.send('post-game:upload-error', 'Analysis timed out.')
          tray?.setToolTip('UpForge — Valorant AI Coaching')
        }
      } catch { /* ignore poll errors */ }
    }, 15_000)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload failed'
    logActivity(`Upload failed: ${msg}`)
    targetWindow.webContents.send('post-game:upload-error', msg)
    tray?.setToolTip('UpForge — Valorant AI Coaching')
  }
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

  // Create main window immediately so app is usable on launch
  mainWindow = createMainWindow()

  createTray()
  setupGameDetection()

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

  // Recordings: get pending, trigger analysis, or dismiss
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

  // Start auto-updater in production
  setupAutoUpdater()

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
