/**
 * In-app web shell — loads upforge.gg pages inside a dedicated BrowserWindow
 * with its own web-shell Sanctum token (see web-shell-session.ts) in a host-only HttpOnly website cookie.
 */

import { WEB_SHELL_PARTITION, applyWebShellCookie, noteShellApiResponse } from './web-shell-session'
import { getApiBaseUrl } from './api-base'
import { BrowserWindow, Menu, shell, session } from 'electron'
import { AuthManager } from './auth-manager'
import { getFrontendBaseUrl } from './api-base'
import { isSafeExternalUrl } from './renderer-trust'

let shellWindow: BrowserWindow | null = null
let watchingShellApi = false

function allowedHost(hostname: string, frontendOrigin: string): boolean {
  try {
    const allowed = new URL(frontendOrigin).hostname
    return hostname === allowed || hostname.endsWith(`.${allowed}`)
  } catch {
    return hostname === 'upforge.gg' || hostname.endsWith('.upforge.gg')
  }
}

function frontendHost(frontendBase: string): string[] {
  try {
    return [new URL(frontendBase).hostname]
  } catch {
    return []
  }
}

/**
 * Open a URL from the web shell in the system browser — https only (http only for
 * the configured frontend host, i.e. local dev). Everything else is denied and logged.
 */
export function openExternalFromShell(
  url: string,
  frontendBase: string,
  open: (url: string) => Promise<void> | void = (u) => shell.openExternal(u),
): boolean {
  if (!isSafeExternalUrl(url, frontendHost(frontendBase))) {
    console.warn('[WebShell] Blocked external URL with disallowed scheme:', String(url).slice(0, 200))
    return false
  }
  void Promise.resolve(open(url)).catch(() => {})
  return true
}

async function injectAuthCookie(auth: AuthManager, frontendBase: string): Promise<boolean> {
  // The shell gets its OWN web-shell token, never the desktop token (a website logout deletes the
  // token it holds). Its API replies are watched so a 401 re-mints on the next open.
  if (!auth.getToken()) return false
  if (!watchingShellApi) {
    watchingShellApi = true
    session.fromPartition(WEB_SHELL_PARTITION).webRequest.onCompleted(
      { urls: [`${getApiBaseUrl()}/*`, `${frontendBase.replace(/\/$/, '')}/api/browser/*`] },
      (details) => noteShellApiResponse(details.statusCode),
    )
  }
  // Signed out on failure (logged there): the page still opens, just without a session.
  await applyWebShellCookie(auth, frontendBase)
  return true
}

function resolveTargetUrl(pathOrUrl: string, frontendBase: string): string {
  const base = frontendBase.replace(/\/$/, '')
  if (/^https?:\/\//i.test(pathOrUrl)) {
    const u = new URL(pathOrUrl)
    if (!allowedHost(u.hostname, base)) {
      throw new Error('Blocked external URL for web shell')
    }
    return u.toString()
  }
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`
  return `${base}${path}`
}

function attachShellMenu(win: BrowserWindow, frontendBase: string): void {
  const menu = Menu.buildFromTemplate([
    {
      label: 'UpForge Web',
      submenu: [
        {
          label: 'Open in Browser',
          click: () => {
            const url = win.webContents.getURL()
            if (url) openExternalFromShell(url, frontendBase)
          },
        },
        { type: 'separator' },
        {
          label: 'Close',
          accelerator: 'Escape',
          click: () => win.close(),
        },
      ],
    },
    {
      label: 'Navigate',
      submenu: [
        {
          label: 'Back',
          accelerator: 'CmdOrCtrl+[',
          click: () => {
            if (win.webContents.canGoBack()) win.webContents.goBack()
          },
        },
        {
          label: 'Forward',
          accelerator: 'CmdOrCtrl+]',
          click: () => {
            if (win.webContents.canGoForward()) win.webContents.goForward()
          },
        },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => win.webContents.reload(),
        },
        { type: 'separator' },
        {
          label: 'Roadmap',
          click: () => void win.loadURL(`${frontendBase.replace(/\/$/, '')}/improvement-roadmap`),
        },
        {
          label: 'Skill profile',
          click: () => void win.loadURL(`${frontendBase.replace(/\/$/, '')}/skill-profile`),
        },
        {
          label: 'Playstyle',
          click: () => void win.loadURL(`${frontendBase.replace(/\/$/, '')}/valorant/playstyle`),
        },
        {
          label: 'Weekly goals',
          click: () => void win.loadURL(`${frontendBase.replace(/\/$/, '')}/weekly-goals`),
        },
        {
          label: 'Progress',
          click: () => void win.loadURL(`${frontendBase.replace(/\/$/, '')}/progress`),
        },
        {
          label: 'Guides',
          click: () => void win.loadURL(`${frontendBase.replace(/\/$/, '')}/guides`),
        },
        {
          label: 'Playbooks',
          click: () => void win.loadURL(`${frontendBase.replace(/\/$/, '')}/playbooks`),
        },
        {
          label: 'Lineups',
          click: () => void win.loadURL(`${frontendBase.replace(/\/$/, '')}/lineups`),
        },
        {
          label: 'Map insights',
          click: () => void win.loadURL(`${frontendBase.replace(/\/$/, '')}/map-insights`),
        },
        {
          label: 'Coaches',
          click: () => void win.loadURL(`${frontendBase.replace(/\/$/, '')}/coaches`),
        },
        {
          label: 'Dashboard',
          click: () => void win.loadURL(`${frontendBase.replace(/\/$/, '')}/dashboard`),
        },
      ],
    },
  ])
  win.setMenu(menu)
}

/**
 * loadURL rejects with ERR_ABORTED (-3) when Chromium cancels a navigation —
 * common for auth cookie redirects / SPA client navigations. If the shell
 * still has a real page, treat that as success.
 */
async function loadShellUrl(win: BrowserWindow, target: string): Promise<void> {
  try {
    await win.loadURL(target)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const aborted = /ERR_ABORTED|\(-3\)/.test(msg)
    if (!aborted || win.isDestroyed()) {
      throw e instanceof Error ? e : new Error(msg)
    }

    const current = win.webContents.getURL()
    if (current && current !== 'about:blank') {
      return
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        const url = win.isDestroyed() ? '' : win.webContents.getURL()
        if (url && url !== 'about:blank') resolve()
        else reject(e instanceof Error ? e : new Error(msg))
      }, 4000)

      const onFinish = () => {
        cleanup()
        resolve()
      }
      const onFail = (
        _event: Electron.Event,
        errorCode: number,
        errorDescription: string,
      ) => {
        // Nested aborts during redirect chains — keep waiting for finish/timeout.
        if (errorCode === -3) return
        cleanup()
        reject(new Error(errorDescription || `Load failed (${errorCode})`))
      }
      const cleanup = () => {
        clearTimeout(timer)
        win.webContents.removeListener('did-finish-load', onFinish)
        win.webContents.removeListener('did-fail-load', onFail)
      }

      win.webContents.once('did-finish-load', onFinish)
      win.webContents.on('did-fail-load', onFail)
    })
  }
}

export async function openWebShell(
  auth: AuthManager,
  pathOrUrl: string,
  parent?: BrowserWindow | null,
): Promise<{ ok: boolean; error?: string }> {
  const frontendBase = getFrontendBaseUrl()

  let target: string
  try {
    target = resolveTargetUrl(pathOrUrl, frontendBase)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid URL' }
  }

  const authed = await injectAuthCookie(auth, frontendBase)
  if (!authed) {
    return { ok: false, error: 'Not logged in' }
  }

  try {
    if (shellWindow && !shellWindow.isDestroyed()) {
      shellWindow.focus()
      await loadShellUrl(shellWindow, target)
      if (!shellWindow.isVisible()) shellWindow.show()
      return { ok: true }
    }

    shellWindow = new BrowserWindow({
      width: 1100,
      height: 760,
      minWidth: 720,
      minHeight: 480,
      parent: parent && !parent.isDestroyed() ? parent : undefined,
      modal: false,
      show: false,
      backgroundColor: '#0a0a0a',
      title: 'UpForge — Web',
      autoHideMenuBar: false,
      webPreferences: {
        partition: 'persist:upforge-web',
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    attachShellMenu(shellWindow, frontendBase)

    shellWindow.on('closed', () => {
      shellWindow = null
    })

    shellWindow.webContents.setWindowOpenHandler(({ url }) => {
      try {
        const u = new URL(url)
        if (allowedHost(u.hostname, frontendBase)) {
          void shellWindow?.webContents.loadURL(url).catch(() => {})
        } else {
          openExternalFromShell(url, frontendBase)
        }
      } catch {
        openExternalFromShell(url, frontendBase)
      }
      return { action: 'deny' }
    })

    // Guard server redirects too, or a 302 to another host would load inside the shell.
    const guardShellNavigation = (event: Electron.Event, url: string): void => {
      try {
        const u = new URL(url)
        if (!allowedHost(u.hostname, frontendBase)) {
          event.preventDefault()
          openExternalFromShell(url, frontendBase)
        }
      } catch {
        event.preventDefault()
      }
    }
    shellWindow.webContents.on('will-navigate', guardShellNavigation)
    shellWindow.webContents.on('will-redirect', guardShellNavigation)

    shellWindow.on('ready-to-show', () => {
      shellWindow?.show()
    })

    await loadShellUrl(shellWindow, target)
    if (!shellWindow.isDestroyed() && !shellWindow.isVisible()) {
      shellWindow.show()
    }
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message }
  }
}

export function closeWebShell(): void {
  if (shellWindow && !shellWindow.isDestroyed()) {
    shellWindow.close()
  }
  shellWindow = null
}
