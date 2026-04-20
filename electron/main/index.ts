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

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let postGameWindow: BrowserWindow | null = null
let isQuitting = false
let trayRefreshInterval: ReturnType<typeof setInterval> | null = null

const gameDetector = new GameDetector()
const recorder = new Recorder()
const riotLocalApi = new RiotLocalApi()
const authManager = new AuthManager()
let uploadManager: UploadManager
let settingsManager: SettingsManager

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
      nodeIntegration: false
    },
    icon: join(__dirname, '../../resources/icon.png')
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
      nodeIntegration: false
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
  gameDetector.on('game-started', async (game: string) => {
    console.log(`[GameDetector] ${game} started`)
    tray?.setToolTip('UpForge — Recording...')

    const config = settingsManager?.get()
    await recorder.start(game, config ? {
      quality: config.recordingQuality,
      bitrate: config.recordingBitrate,
      savePath: config.savePath
    } : undefined)

    // Start polling Riot Local API
    riotLocalApi.start(game)
  })

  gameDetector.on('game-stopped', async (game: string) => {
    console.log(`[GameDetector] ${game} stopped`)
    tray?.setToolTip('UpForge — Uploading...')

    // Stop Riot API polling, get timeline
    const timeline = riotLocalApi.stop()

    // Stop recording
    await recorder.stop()

    // Open post-game window
    postGameWindow = createPostGameWindow()
    postGameWindow.webContents.once('did-finish-load', async () => {
      try {
        const user = authManager.getUser()
        const map = timeline?.map ?? null
        const agent = timeline?.agent ?? null

        postGameWindow?.webContents.send('post-game:upload-start', { game, map, agent })

        const videoPath = recorder.getLastRecordingPath()
        if (!videoPath) throw new Error('No recording available')

        // Upload with progress
        const result = await uploadManager.upload({
          videoPath,
          riotName: user?.riot_name ?? '',
          riotTag: user?.riot_tag ?? '',
          game,
          map,
          agent,
          timeline,
          onProgress: (pct) => {
            postGameWindow?.webContents.send('post-game:upload-progress', pct)
          }
        })

        postGameWindow?.webContents.send('post-game:upload-complete', { jobId: result.job_id })
        tray?.setToolTip('UpForge — Analysing...')

        // Auto-delete recording after upload if configured
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
              postGameWindow?.webContents.send('post-game:analysis-ready', {
                overall_score: (status.result as Record<string, unknown>).overall_score,
                analysis_id: (status.result as Record<string, unknown>).analysis_id,
                top_issue: (status.result as Record<string, unknown>).top_issue
              })
              mainWindow?.webContents.send('dashboard:refresh')
              tray?.setToolTip('UpForge — Valorant AI Coaching')
              new Notification({
                title: 'UpForge — Analysis Ready',
                body: `Your ${game} coaching analysis is ready to view.`
              }).show()
            } else if (status.status === 'failed') {
              clearInterval(pollTimer)
              postGameWindow?.webContents.send('post-game:upload-error', 'Analysis failed. Please try again.')
              tray?.setToolTip('UpForge — Valorant AI Coaching')
            } else if (Date.now() - startTime > 600_000) {
              clearInterval(pollTimer)
              postGameWindow?.webContents.send('post-game:upload-error', 'Analysis timed out.')
              tray?.setToolTip('UpForge — Valorant AI Coaching')
            }
          } catch { /* ignore poll errors */ }
        }, 15_000)

      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Upload failed'
        postGameWindow?.webContents.send('post-game:upload-error', msg)
        tray?.setToolTip('UpForge — Valorant AI Coaching')
      }
    })
  })

  gameDetector.start()
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('gg.upforge.desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  uploadManager = new UploadManager(authManager)
  settingsManager = new SettingsManager()

  // Create main window immediately so app is usable on launch
  mainWindow = createMainWindow()

  createTray()
  setupGameDetection()
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
