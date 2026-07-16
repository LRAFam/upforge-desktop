/**
 * In-app web shell — loads upforge.gg pages inside a dedicated BrowserWindow
 * with the desktop Sanctum token injected as the web auth_token cookie.
 */

import { BrowserWindow, Menu, shell, session } from 'electron'
import { AuthManager } from './auth-manager'
import { getFrontendBaseUrl } from './api-base'

let shellWindow: BrowserWindow | null = null

function encodeAuthCookie(token: string): string {
  return 'b64.' + Buffer.from(token, 'utf8').toString('base64')
}

function allowedHost(hostname: string, frontendOrigin: string): boolean {
  try {
    const allowed = new URL(frontendOrigin).hostname
    return hostname === allowed || hostname.endsWith(`.${allowed}`)
  } catch {
    return hostname === 'upforge.gg' || hostname.endsWith('.upforge.gg')
  }
}

async function injectAuthCookie(auth: AuthManager, frontendBase: string): Promise<boolean> {
  const token = auth.getToken()
  if (!token) return false

  const ses = session.fromPartition('persist:upforge-web')
  const url = frontendBase.replace(/\/$/, '')
  const secure = url.startsWith('https://')

  await ses.cookies.set({
    url,
    name: 'auth_token',
    value: encodeAuthCookie(token),
    path: '/',
    secure,
    httpOnly: false,
    sameSite: 'lax',
    expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  })

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
            if (url) void shell.openExternal(url)
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

  if (shellWindow && !shellWindow.isDestroyed()) {
    shellWindow.focus()
    await shellWindow.webContents.loadURL(target)
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
        void shellWindow?.webContents.loadURL(url)
      } else {
        void shell.openExternal(url)
      }
    } catch {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  shellWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const u = new URL(url)
      if (!allowedHost(u.hostname, frontendBase)) {
        event.preventDefault()
        void shell.openExternal(url)
      }
    } catch {
      event.preventDefault()
    }
  })

  shellWindow.on('ready-to-show', () => {
    shellWindow?.show()
  })

  await shellWindow.loadURL(target)
  return { ok: true }
}

export function closeWebShell(): void {
  if (shellWindow && !shellWindow.isDestroyed()) {
    shellWindow.close()
  }
  shellWindow = null
}
