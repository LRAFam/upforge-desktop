import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  shell,
  screen,
  Notification
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { GameDetector } from './game-detector'
import { Recorder } from './recorder'
import { RiotLocalAPI } from './riot-local-api'
import { UploadManager } from './upload-manager'
import { AuthManager } from './auth-manager'
import { setupIpcHandlers } from './ipc-handlers'

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let postGameWindow: BrowserWindow | null = null

const gameDetector = new GameDetector()
const recorder = new Recorder()
const riotLocalAPI = new RiotLocalAPI()
const authManager = new AuthManager()
let uploadManager: UploadManager

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
    // Minimise to tray instead of closing
    e.preventDefault()
    win.hide()
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
        label: 'UpForge',
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Open Dashboard',
        click: () => {
          if (!mainWindow) {
            mainWindow = createMainWindow()
          } else {
            mainWindow.show()
            mainWindow.focus()
          }
        }
      },
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
  setInterval(updateTrayMenu, 5000)
}

function setupGameDetection(): void {
  gameDetector.on('game-started', async (game: string) => {
    console.log(`[GameDetector] ${game} started`)
    tray?.setToolTip('UpForge — Recording...')

    // Start recording
    await recorder.start(game)

    // Start polling Riot Local API (Valorant only for now)
    if (game === 'valorant') {
      riotLocalAPI.start()
    }
  })

  gameDetector.on('game-stopped', async (game: string) => {
    console.log(`[GameDetector] ${game} stopped`)
    tray?.setToolTip('UpForge — Uploading...')

    // Stop recording and local API polling
    const videoPath = await recorder.stop()
    const timeline = riotLocalAPI.stop()

    // Show post-game window
    postGameWindow = createPostGameWindow()
    postGameWindow.webContents.once('did-finish-load', () => {
      postGameWindow?.webContents.send('post-game:upload-start', {
        game,
        map: timeline?.gameData?.map || null,
        agent: timeline?.activePlayer?.championName || null
      })
    })

    // Trigger upload
    if (videoPath) {
      await uploadManager.upload({
        game,
        videoPath,
        timeline,
        onProgress: (pct: number) => {
          postGameWindow?.webContents.send('post-game:upload-progress', pct)
        },
        onComplete: (jobId: string) => {
          postGameWindow?.webContents.send('post-game:upload-complete', { jobId })
          tray?.setToolTip('UpForge — Analysing...')
          // Poll for analysis completion
          uploadManager.pollJobStatus(jobId, (result) => {
            postGameWindow?.webContents.send('post-game:analysis-ready', result)
            mainWindow?.webContents.send('dashboard:refresh')
            tray?.setToolTip('UpForge — Valorant AI Coaching')

            new Notification({
              title: 'UpForge — Analysis Ready',
              body: `Your ${game} coaching analysis is ready to view.`
            }).show()
          })
        },
        onError: (err: string) => {
          postGameWindow?.webContents.send('post-game:upload-error', err)
          tray?.setToolTip('UpForge — Valorant AI Coaching')
        }
      })
    }
  })

  gameDetector.start()
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('gg.upforge.desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  uploadManager = new UploadManager(authManager)

  // Create main window immediately so app is usable on launch
  mainWindow = createMainWindow()

  createTray()
  setupGameDetection()
  setupIpcHandlers(ipcMain, authManager, recorder, gameDetector)

  // Start auto-updater in production
  if (!is.dev) {
    autoUpdater.checkForUpdatesAndNotify()
  }
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
  gameDetector.stop()
  recorder.forceStop()
})
