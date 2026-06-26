/**
 * window-manager.ts
 * Factory functions for creating the main, post-game, and splash windows,
 * and for setting up the system tray. Extracted from index.ts.
 */

import { BrowserWindow, Tray, Menu, nativeImage, screen, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import log from 'electron-log'
import { ClipExtractor } from './clip-extractor'

// ── Main window ───────────────────────────────────────────────────────────────

export function createMainWindow(
  startAuthenticated: boolean,
  isQuitting: () => boolean,
): BrowserWindow {
  const win = new BrowserWindow({
    width: startAuthenticated ? 1280 : 860,
    height: startAuthenticated ? 800 : 580,
    minWidth: 980,
    minHeight: 660,
    resizable: true,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0f1c',
    icon: join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
  })

  win.on('ready-to-show', () => {
    win.show()
    if (startAuthenticated) win.maximize()
  })

  let rendererCrashCount = 0
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Main] Renderer process gone:', details.reason)
    if (details.reason !== 'clean-exit') {
      rendererCrashCount++
      if (rendererCrashCount > 3) {
        console.error('[Main] Renderer crashed too many times — not reloading to prevent loop')
        return
      }
      const delay = Math.min(1000 * Math.pow(2, rendererCrashCount - 1), 15_000)
      console.warn(`[Main] Reloading renderer (attempt ${rendererCrashCount}/3) in ${delay}ms`)
      setTimeout(() => {
        try {
          if (!win.isDestroyed()) {
            if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
              win.loadURL(process.env['ELECTRON_RENDERER_URL'])
            } else {
              win.loadFile(join(__dirname, '../renderer/index.html'))
            }
            win.webContents.once('did-finish-load', () => { rendererCrashCount = 0 })
          }
        } catch (e) {
          console.error('[Main] Failed to reload renderer:', e)
        }
      }, delay)
    }
  })

  win.on('close', (e) => {
    if (!isQuitting()) {
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

// ── Post-game window ──────────────────────────────────────────────────────────

export function createPostGameWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const { width: workW, height: workH } = display.workAreaSize
  const winHeight = Math.min(720, Math.max(520, workH - 80))

  const win = new BrowserWindow({
    width: 400,
    height: winHeight,
    minWidth: 360,
    minHeight: 420,
    maxHeight: workH - 40,
    resizable: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: '#161616',
    icon: join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.setPosition(workW - 420, workH - winHeight - 20)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/post-game`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'post-game' })
  }

  return win
}

/** Run callback when the window renderer is ready — avoids missing did-finish-load if already loaded. */
export function whenWebContentsReady(win: BrowserWindow, fn: () => void): void {
  if (win.isDestroyed()) return
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', fn)
  } else {
    fn()
  }
}

// ── Splash window ─────────────────────────────────────────────────────────────

export function createSplashWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 680,
    height: 440,
    resizable: false,
    frame: false,
    center: true,
    skipTaskbar: false,
    backgroundColor: '#0a0f1c',
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

// ── System tray ───────────────────────────────────────────────────────────────

export interface TrayDeps {
  getMainWindow: () => BrowserWindow | null
  setMainWindow: (win: BrowserWindow) => void
  isRecording: () => boolean
  getPendingCount: () => number
  getInFlightCount?: () => number
  getAnalysablePendingCount?: () => number
  onAnalyseOldest?: () => void
  createMainWindowFn: () => BrowserWindow
}

export interface TrayResult {
  tray: Tray
  updateMenu: () => void
  refreshInterval: ReturnType<typeof setInterval>
}

export function createTray(deps: TrayDeps): TrayResult {
  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/tray-icon.png'))
  const tray = new Tray(icon.resize({ width: 16, height: 16 }))

  const focusOrCreate = () => {
    const win = deps.getMainWindow()
    if (!win) {
      deps.setMainWindow(deps.createMainWindowFn())
    } else {
      win.show()
      win.focus()
    }
  }

  const updateMenu = (): void => {
    const pendingCount = deps.getPendingCount()
    const inFlightCount = deps.getInFlightCount?.() ?? 0
    const analysableCount = deps.getAnalysablePendingCount?.() ?? 0
    const pendingLabel = pendingCount === 1
      ? '1 recording pending analysis'
      : pendingCount > 1
        ? `${pendingCount} recordings pending analysis`
        : null
    const inFlightLabel = inFlightCount === 1
      ? '1 upload/analysis in progress'
      : inFlightCount > 1
        ? `${inFlightCount} uploads/analyses in progress`
        : null

    const template: Electron.MenuItemConstructorOptions[] = [
      { label: 'Open UpForge', click: focusOrCreate },
      { type: 'separator' },
      { label: 'Open in Browser', click: () => shell.openExternal('https://upforge.gg/dashboard') },
      { type: 'separator' },
      { label: 'Recording: ' + (deps.isRecording() ? '● Active' : '○ Idle'), enabled: false },
    ]

    if (inFlightLabel) {
      template.push({ label: inFlightLabel, click: focusOrCreate })
    }
    if (pendingLabel) {
      template.push({ label: pendingLabel, click: focusOrCreate })
    }
    if (analysableCount > 0 && deps.onAnalyseOldest) {
      template.push({
        label: analysableCount === 1 ? 'Analyse pending match' : `Analyse oldest pending (${analysableCount})`,
        click: deps.onAnalyseOldest,
      })
    }

    template.push(
      { type: 'separator' },
      { label: 'Open Clips Folder', click: () => shell.openPath(ClipExtractor.clipsDir()) },
      { label: 'Quit UpForge completely', click: () => { require('electron').app.quit() } }
    )

    tray.setContextMenu(Menu.buildFromTemplate(template))
    tray.setToolTip(
      inFlightCount > 0
        ? `UpForge — ${inFlightCount} in progress`
        : pendingCount > 0
          ? `UpForge — ${pendingCount} pending`
          : 'UpForge — AI Coaching',
    )
  }

  updateMenu()

  tray.on('click', () => {
    const win = deps.getMainWindow()
    if (!win) {
      deps.setMainWindow(deps.createMainWindowFn())
    } else if (win.isVisible()) {
      win.hide()
    } else {
      win.show()
      win.focus()
    }
  })

  tray.on('double-click', focusOrCreate)

  const refreshInterval = setInterval(updateMenu, 30_000)

  return { tray, updateMenu, refreshInterval }
}
