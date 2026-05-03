import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let overlayWindow: BrowserWindow | null = null
let isVisible = false

export function createOverlayWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const { width } = display.workAreaSize

  const win = new BrowserWindow({
    width: 320,
    height: 280,
    x: width - 340,
    y: 20,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Use screen-saver level so overlay renders above full-screen games
  win.setAlwaysOnTop(true, 'screen-saver', 1)

  // Allow clicks to pass through to the game underneath by default
  win.setIgnoreMouseEvents(true, { forward: true })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/overlay`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'overlay' })
  }

  win.once('ready-to-show', () => {
    if (isVisible) win.show()
    else win.hide()
  })

  overlayWindow = win
  return win
}

export function showOverlay(): void {
  isVisible = true
  overlayWindow?.show()
}

export function hideOverlay(): void {
  isVisible = false
  overlayWindow?.hide()
}

export function toggleOverlay(): void {
  if (isVisible) hideOverlay()
  else showOverlay()
}

export function destroyOverlay(): void {
  overlayWindow?.destroy()
  overlayWindow = null
  isVisible = false
}

export function sendOverlayData(channel: string, data: unknown): void {
  overlayWindow?.webContents.send(channel, data)
}

export function isOverlayVisible(): boolean {
  return isVisible
}

export function setOverlayInteractive(interactive: boolean): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  if (interactive) {
    overlayWindow.setIgnoreMouseEvents(false)
  } else {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  }
}
