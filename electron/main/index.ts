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
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupAutoUpdater } from './updater'
import { GameDetector } from './game-detector'
import { Recorder } from './recorder'
import { RiotLocalApi } from './riot-local-api'
import { UploadManager, savePendingJob, clearPendingJob, readPendingJob } from './upload-manager'
import { AuthManager } from './auth-manager'
import { SettingsManager } from './settings-manager'
import { setupIpcHandlers } from './ipc-handlers'
import { RecordingsStore } from './recordings-store'
import type { MatchData } from './riot-local-api'

// Catch any floating promise rejections in the main process before they
// crash Electron silently. Log them so they show up in support logs.
process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled promise rejection:', reason)
})

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
  // If recording stopped unexpectedly due to an error, show a system notification
  // so the user knows even if UpForge is in the background during a game
  if (!recording && error) {
    console.warn('[Main] Recording stopped with error:', error)
    tray?.setToolTip('UpForge — Recording stopped!')
    if (Notification.isSupported()) {
      new Notification({
        title: 'UpForge — Recording Stopped',
        body: 'Recording stopped unexpectedly. Open UpForge to see details.',
        silent: false
      }).show()
    }
    setTimeout(() => tray?.setToolTip('UpForge — Valorant AI Coaching'), 10_000)
  }
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
    icon: join(__dirname, '../../resources/icon.ico'),
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
    icon: join(__dirname, '../../resources/icon.ico'),
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
    const pendingCount = recordingsStore?.getPending().length ?? 0
    const pendingLabel = pendingCount === 1
      ? '1 recording pending analysis'
      : pendingCount > 1
        ? `${pendingCount} recordings pending analysis`
        : null

    const menuTemplate: Electron.MenuItemConstructorOptions[] = [
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
    ]

    if (pendingLabel) {
      menuTemplate.push({
        label: pendingLabel,
        click: () => {
          if (!mainWindow) {
            mainWindow = createMainWindow()
          } else {
            mainWindow.show()
            mainWindow.focus()
          }
        }
      })
    }

    menuTemplate.push(
      { type: 'separator' },
      {
        label: 'Quit UpForge',
        click: () => {
          app.quit()
        }
      }
    )

    const menu = Menu.buildFromTemplate(menuTemplate)
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
  const ALL_MODES = new Set(['COMPETITIVE', 'PREMIER', 'CLASSIC', 'DEATHMATCH', 'TEAMDEATHMATCH', 'SPIKERUSH', 'SWIFTPLAY', 'SNOWBALL'])

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
      if (videoPath && fs.existsSync(videoPath)) {
        try { fs.unlinkSync(videoPath) } catch { /* ignore */ }
      }
      return
    }

    // If recording never started (recorder.start() threw earlier in this match),
    // skip the post-game window — it would just show a confusing error.
    if (recordingDuration === 0) {
      const lastErr = recorder.getLastError()
      logActivity(lastErr ? `Match ended — no recording was made (${lastErr})` : 'Match ended — no active recording')
      return
    }

    // Close any existing post-game window first (consecutive match scenario —
    // match 2 can end before match 1's window is dismissed).
    postGameWindow?.close()
    const thisPostGameWindow = createPostGameWindow()
    postGameWindow = thisPostGameWindow
    thisPostGameWindow.on('closed', () => {
      if (postGameWindow === thisPostGameWindow) postGameWindow = null
    })

    // Notify the user that the match recording has finished and upload is starting
    if (Notification.isSupported()) {
      const agentLabel = agent ?? 'Valorant'
      const mapLabel = map ? ` on ${map}` : ''
      new Notification({
        title: 'UpForge — Recording Complete',
        body: `${agentLabel}${mapLabel} — uploading for AI analysis…`
      }).show()
    }

    thisPostGameWindow.webContents.once('did-finish-load', async () => {
      const sendToWindow = (channel: string, payload?: unknown) => {
        if (!thisPostGameWindow.isDestroyed()) thisPostGameWindow.webContents.send(channel, payload)
      }

      if (!videoPath || !fs.existsSync(videoPath)) {
        const ffmpegError = recorder.getLastError()
        const errorMsg = ffmpegError
          ? `Recording failed: ${ffmpegError}`
          : 'Recording file was not created — ffmpeg may have failed to start. Check that ffmpeg is installed (dev) or the app was not corrupted (production).'
        sendToWindow('post-game:upload-error', errorMsg)
        return
      }

      if (fileSize < MIN_FILE_SIZE_BYTES) {
        const sizeMB = (fileSize / (1024 * 1024)).toFixed(2)
        const errorMsg = `Recording appears corrupt or empty (${sizeMB} MB). Please check your ffmpeg setup.`
        console.error(`[GameDetector] ${errorMsg}`)
        sendToWindow('post-game:upload-error', errorMsg)
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
        sendToWindow('post-game:pending', {
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
        game, map, agent, timeline, thisPostGameWindow)
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

    // If presence API was available but INGAME was never seen, the player is idle
    // in the lobby (or queued and cancelled). Do NOT start recording — this is what
    // causes "hallucinated" matches when the app is left idle for 25+ minutes.
    if (authOk && matchStartTime === null) {
      logActivity('Presence timeout — no match started, returning to idle')
      console.log('[GameDetector] Presence loop timed out without INGAME — not recording')
      tray?.setToolTip('UpForge — Valorant AI Coaching')
      // Re-arm: if the game process is still alive, re-enter the detection loop
      // so we catch the next match the player queues into.
      await new Promise((r) => setTimeout(r, 5000))
      if (await gameDetector.isMatchProcessRunning()) {
        console.log('[GameDetector] Game still running after presence timeout — re-arming detection')
        gameDetector.emit('game-started', game)
      }
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

      // VALORANT-Win64-Shipping.exe often stays alive between consecutive matches
      // (the user returns to lobby and queues again without relaunching the client).
      // In that case game-stopped never fires and game-started never re-fires, so
      // nothing would detect the next match. Re-enter the full detection loop if
      // the process is still running. This also covers back-to-back Deathmatch sessions.
      await new Promise((r) => setTimeout(r, 5000)) // let the post-game lobby settle
      if (await gameDetector.isMatchProcessRunning()) {
        console.log('[GameDetector] Game still running after match — watching for next match')
        logActivity('Watching for next match...')
        gameDetector.emit('game-started', game)
      }
    }

    // Start tracking + recording
    // Pass matchStartTime so the API can compute videoOffsetMs once we have recording start.
    riotLocalApi.start(game, matchStartTime ?? undefined)

    tray?.setToolTip('UpForge — Starting recorder...')
    mainWindow?.webContents.send('recording:starting', { starting: true })
    try {
      await recorder.start(game, recorderConfig)
      // Update recordingStartTime to the moment the recorder actually began capturing.
      // This makes videoOffsetMs accurate: offset = (matchStart - recordingStart) + timeSinceGameStart.
      riotLocalApi.setRecordingStartTime(Date.now())
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Main] Failed to start recording:', msg)
      logActivity(`Recording failed to start: ${msg}`)
      mainWindow?.webContents.send('recording:starting', { starting: false })
      tray?.setToolTip('UpForge — Recording failed!')
      if (Notification.isSupported()) {
        new Notification({
          title: 'UpForge — Recording Failed',
          body: 'Could not start recording. Open UpForge to see details.',
          silent: false
        }).show()
      }
      // Reset tray tooltip after 10 seconds so it doesn't stay on "failed"
      setTimeout(() => tray?.setToolTip('UpForge — Valorant AI Coaching'), 10_000)
      return
    }
    logActivity(`Recording started (${gameMode ?? 'unknown mode'}${recorder.wasNoAudio() ? ' — no audio' : ''})`)

    if (recorder.wasNoAudio()) {
      console.warn('[Main] Recording started without audio (WASAPI/avfoundation fallback)')
      mainWindow?.webContents.send('app:warning', {
        message: 'Recording started without audio — your system audio device was unavailable'
      })
    }

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

    // Poll for analysis result (up to 10 minutes) with exponential backoff
    const startTime = Date.now()
    let pollFailCount = 0
    let pollDelay = 5_000
    let pollTimer: ReturnType<typeof setTimeout> | null = null

    const schedulePoll = () => {
      pollTimer = setTimeout(pollOnce, pollDelay)
      pollDelay = Math.min(Math.round(pollDelay * 1.5), 30_000)
    }

    const pollOnce = async () => {
      try {
        const status = await uploadManager.pollStatus(result.job_id)
        pollFailCount = 0
        if (status.status === 'completed' && status.result) {
          const score = (status.result as Record<string, unknown>).overall_score as number | undefined
          logActivity(`Analysis ready${score != null ? ` — Score: ${score}/100` : ''}`)
          clearPendingJob()
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
          logActivity('Analysis failed')
          clearPendingJob()
          send('post-game:upload-error', 'Analysis failed. Please try again.')
          tray?.setToolTip('UpForge — Valorant AI Coaching')
        } else if (Date.now() - startTime > 600_000) {
          logActivity('Analysis timed out')
          clearPendingJob()
          send('post-game:upload-error', 'Analysis timed out.')
          tray?.setToolTip('UpForge — Valorant AI Coaching')
        } else {
          schedulePoll()
        }
      } catch (pollErr) {
        pollFailCount++
        console.warn(`[Upload] Poll error (${pollFailCount}):`, pollErr)
        if (pollFailCount >= 5) {
          logActivity('Analysis polling failed — lost connection to server')
          send('post-game:upload-error', 'Lost connection while waiting for analysis. Check your internet connection.')
          tray?.setToolTip('UpForge — Valorant AI Coaching')
        } else {
          schedulePoll()
        }
      }
    }

    schedulePoll()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload failed'
    logActivity(`Upload failed: ${msg}`)
    tray?.setToolTip('UpForge — Valorant AI Coaching')

    // If this was the auto-analyse path (no recordingId yet) and the file still
    // exists, save it to the pending store and switch the post-game window to
    // 'pending' state so the user can retry with one click (or later from dashboard).
    if (!recordingId && fs.existsSync(videoPath)) {
      try {
        const user = authManager.getUser()
        const saved = recordingsStore.add({
          path: videoPath,
          riotName: riotName || user?.riot_name || '',
          riotTag: riotTag || user?.riot_tag || '',
          game,
          map,
          agent,
          gameMode: riotLocalApi.getLastGameMode() ?? 'UNKNOWN',
          timeline
        })
        send('post-game:pending', { recordingId: saved.id, game, map, agent })
        mainWindow?.webContents.send('recordings:updated')
        logActivity('Recording saved — retry from the post-game window or dashboard')
        return
      } catch {
        // Store save failed — fall through to show the error
      }
    }

    send('post-game:upload-error', msg)
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

  // Resume polling for any job_id that was persisted before a crash.
  // We wait until the main window is ready before sending the result.
  const orphanedJob = readPendingJob()
  if (orphanedJob) {
    console.log('[App] Orphaned job found from previous session:', orphanedJob.job_id)
    logActivity(`Resuming analysis poll for job ${orphanedJob.job_id} from previous session`)
  }

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

    // If an orphaned job was found at startup, resume polling once the window loads
    if (orphanedJob) {
      mainWindow.webContents.once('did-finish-load', () => {
        console.log('[App] Resuming orphaned job poll:', orphanedJob.job_id)
        mainWindow?.webContents.send('post-game:upload-complete', { jobId: orphanedJob.job_id, resumed: true })
        // Kick off a background poll — reuse the same logic via a synthetic upload window
        // For now, just notify the dashboard to check; a full poll loop would need the post-game window
        mainWindow?.webContents.send('dashboard:refresh')
      })
    }
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
  }).catch((err) => {
    console.error('[App] ffmpeg preflight threw unexpectedly:', err)
    ffmpegOk = false
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
  }, () => ffmpegOk, () => waitingForMatch, () => activityLog.slice(), uploadManager)

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
