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
import type { MatchTimeline } from './riot-local-api'

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let postGameWindow: BrowserWindow | null = null
let isQuitting = false
let trayRefreshInterval: ReturnType<typeof setInterval> | null = null
let ffmpegOk = true // updated after preflight; exposed via app:get-status

const gameDetector = new GameDetector()
const recorder = new Recorder()
const riotLocalApi = new RiotLocalApi()
const authManager = new AuthManager()
let uploadManager: UploadManager
let settingsManager: SettingsManager
let recordingsStore: RecordingsStore

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

    const config = settingsManager?.get()
    const recorderConfig = config ? {
      quality: config.recordingQuality,
      bitrate: config.recordingBitrate,
      savePath: config.savePath
    } : undefined

    // Start Riot Local API polling immediately so timeline is captured from the start
    riotLocalApi.start(game)

    // Determine which modes to record. Empty array or matching all = record everything.
    const recordedModes = config?.recordedModes ?? ['COMPETITIVE', 'PREMIER']
    const filterByMode = recordedModes.length > 0 &&
      !([...ALL_MODES].every(m => recordedModes.includes(m)))

    if (filterByMode) {
      // Probe game mode — retry for up to 30 seconds since Riot local API takes time to start
      let gameMode: string | null = null
      for (let attempt = 0; attempt < 6; attempt++) {
        await new Promise((r) => setTimeout(r, 5000))
        gameMode = await riotLocalApi.getGameMode()
        if (gameMode) break
        console.log(`[GameDetector] Game mode not available yet (attempt ${attempt + 1}/6)`)
      }

      if (gameMode && !recordedModes.includes(gameMode)) {
        console.log(`[GameDetector] Skipping recording — mode is ${gameMode} (not in recordedModes)`)
        tray?.setToolTip('UpForge — Valorant AI Coaching')
        return
      }

      if (!gameMode) {
        console.log('[GameDetector] Could not determine game mode — recording anyway as fallback')
      } else {
        console.log(`[GameDetector] Game mode: ${gameMode} — starting recording`)
      }
    }

    tray?.setToolTip('UpForge — Recording...')
    await recorder.start(game, recorderConfig)

    // Notify the user that recording has started with their identity
    const user = authManager.getUser()
    const userLabel = (user?.riot_name && user?.riot_tag)
      ? `${user.riot_name}#${user.riot_tag}`
      : user?.name ?? 'your account'
    const gameLabel = game === 'cs2' ? 'CS2' : 'Valorant'
    tray?.setToolTip(`UpForge — Recording ${gameLabel} (${userLabel})`)

    if (Notification.isSupported()) {
      new Notification({
        title: `UpForge is recording`,
        body: `${gameLabel} session started for ${userLabel}`,
        silent: true
      }).show()
    }
  })

  gameDetector.on('game-stopped', async (game: string) => {
    console.log(`[GameDetector] ${game} stopped`)

    const timeline = riotLocalApi.stop()
    await recorder.stop()

    const videoPath = recorder.getLastRecordingPath()
    const user = authManager.getUser()
    const map = timeline?.map ?? null
    const agent = timeline?.agent ?? null
    const gameMode = riotLocalApi.getLastGameMode() ?? 'UNKNOWN'
    const config = settingsManager?.get()
    const autoAnalyse = config?.autoAnalyse !== false

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
  timeline: MatchTimeline | null,
  targetWindow: BrowserWindow
): Promise<void> {
  try {
    targetWindow.webContents.send('post-game:upload-start', { game, map, agent })

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
          targetWindow.webContents.send('post-game:analysis-ready', {
            overall_score: (status.result as Record<string, unknown>).overall_score,
            analysis_id: (status.result as Record<string, unknown>).analysis_id,
            top_issue: (status.result as Record<string, unknown>).top_issue
          })
          mainWindow?.webContents.send('dashboard:refresh')
          tray?.setToolTip('UpForge — Valorant AI Coaching')
          const score = (status.result as Record<string, unknown>).overall_score as number | undefined
          const notifAgent = agent ?? 'Valorant'
          const notifMap = map ? ` on ${map}` : ''
          const notifScore = score != null ? ` — Score: ${score}/100` : ''
          new Notification({
            title: 'UpForge — Analysis Ready',
            body: `${notifAgent}${notifMap}${notifScore}`
          }).show()
        } else if (status.status === 'failed') {
          clearInterval(pollTimer)
          targetWindow.webContents.send('post-game:upload-error', 'Analysis failed. Please try again.')
          tray?.setToolTip('UpForge — Valorant AI Coaching')
        } else if (Date.now() - startTime > 600_000) {
          clearInterval(pollTimer)
          targetWindow.webContents.send('post-game:upload-error', 'Analysis timed out.')
          tray?.setToolTip('UpForge — Valorant AI Coaching')
        }
      } catch { /* ignore poll errors */ }
    }, 15_000)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload failed'
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
  }, () => ffmpegOk)

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
