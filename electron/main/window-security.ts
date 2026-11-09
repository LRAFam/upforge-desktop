/**
 * window-security.ts
 * Navigation lock for windows that never need to open or follow links
 * (in-game overlay, splash). Every window.open is denied outright and any
 * navigation away from the bundled renderer entry is blocked.
 */

import type { BrowserWindow } from 'electron'
import log from 'electron-log'
import { isTrustedRendererUrl } from './renderer-trust'

export function lockDownWindowNavigation(
  win: BrowserWindow,
  source: string,
  isTrusted: (url: string) => boolean = (url) => isTrustedRendererUrl(url),
): void {
  win.webContents.setWindowOpenHandler(() => {
    log.warn(`[WindowSecurity] Denied window.open from ${source}`)
    return { action: 'deny' }
  })
  const guard = (event: Electron.Event, url: string): void => {
    if (isTrusted(url)) return
    event.preventDefault()
    log.warn(`[WindowSecurity] Blocked navigation from ${source}`)
  }
  win.webContents.on('will-navigate', guard)
  win.webContents.on('will-redirect', guard)
}
