import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Web shell window behaviour: which URLs it will open, how it is sandboxed, and where links go.
 * Electron is faked; the cookie details are covered by the web-shell session tests.
 */

const h = vi.hoisted(() => {
  type Handler = (...args: any[]) => any
  class FakeWebContents {
    url = ''
    listeners: Record<string, Handler[]> = {}
    windowOpenHandler: Handler | null = null
    loadURL = vi.fn(async (u: string) => { this.url = u })
    getURL = () => this.url
    on(event: string, fn: Handler) { (this.listeners[event] ??= []).push(fn); return this }
    once(event: string, fn: Handler) { return this.on(event, fn) }
    removeListener() { return this }
    setWindowOpenHandler(fn: Handler) { this.windowOpenHandler = fn }
    canGoBack() { return false }
    canGoForward() { return false }
    emit(event: string, ...args: unknown[]) { for (const fn of this.listeners[event] ?? []) fn(...args) }
  }
  class FakeWindow {
    static created: FakeWindow[] = []
    webContents = new FakeWebContents()
    destroyed = false
    visible = false
    windowEvents: Record<string, Handler[]> = {}
    loadURL = vi.fn(async (u: string) => {
      if (h.loadError) throw h.loadError
      this.webContents.url = u
    })
    focus = vi.fn()
    constructor(public options: Record<string, any>) { FakeWindow.created.push(this) }
    on(event: string, fn: Handler) { (this.windowEvents[event] ??= []).push(fn); return this }
    setMenu() {}
    show() { this.visible = true }
    isVisible() { return this.visible }
    isDestroyed() { return this.destroyed }
    close() { this.destroyed = true; for (const fn of this.windowEvents.closed ?? []) fn() }
  }
  return {
    FakeWindow,
    openExternal: vi.fn(async () => {}),
    cookiesSet: vi.fn(async () => {}),
    loadError: null as Error | null,
  }
})

vi.mock('electron', () => ({
  BrowserWindow: h.FakeWindow,
  Menu: { buildFromTemplate: vi.fn(() => ({})) },
  shell: { openExternal: h.openExternal },
  session: {
    fromPartition: vi.fn(() => ({
      cookies: { set: h.cookiesSet, get: vi.fn(async () => []), remove: vi.fn(async () => {}) },
      webRequest: { onCompleted: vi.fn() },
      clearStorageData: vi.fn(async () => {}),
    })),
  },
  app: { getPath: () => '/tmp', getVersion: () => '0.0.0', isPackaged: false },
  safeStorage: { isEncryptionAvailable: () => false },
}))
vi.mock('./auth-manager', () => ({ AuthManager: class {} }))
vi.mock('./api-base', () => ({
  getFrontendBaseUrl: () => 'https://upforge.gg',
  getApiBaseUrl: () => 'https://api.upforge.gg',
}))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { closeWebShell, openWebShell } from './web-shell'
import type { AuthManager } from './auth-manager'

const DESKTOP_TOKEN = '1|' + 'd'.repeat(40)

function auth(token: string | null = DESKTOP_TOKEN): AuthManager {
  return {
    getToken: () => token,
    // Web-shell token minting (when present) gets a valid, different token.
    getApi: () => ({ post: vi.fn(async () => ({ status: 200, data: { token: '2|' + 's'.repeat(40) } })) }),
  } as unknown as AuthManager
}

function lastWindow() {
  const w = h.FakeWindow.created.at(-1)
  if (!w) throw new Error('no window')
  return w
}

beforeEach(() => {
  closeWebShell()
  h.FakeWindow.created.length = 0
  h.openExternal.mockClear()
  h.cookiesSet.mockClear()
  h.loadError = null
})

describe('openWebShell — what it will open', () => {
  it('refuses when signed out and opens no window', async () => {
    expect(await openWebShell(auth(null), '/progress')).toEqual({ ok: false, error: 'Not logged in' })
    expect(h.FakeWindow.created).toHaveLength(0)
  })

  it('refuses a full URL on another host before touching cookies or windows', async () => {
    expect(await openWebShell(auth(), 'https://evil.example/phish')).toEqual({ ok: false, error: 'Blocked external URL for web shell' })
    expect(await openWebShell(auth(), 'https://upforge.gg.evil.example/')).toMatchObject({ ok: false })
    expect(h.FakeWindow.created).toHaveLength(0)
    expect(h.cookiesSet).not.toHaveBeenCalled()
  })

  it('resolves a relative path (with or without a slash) against the frontend', async () => {
    expect(await openWebShell(auth(), 'weekly-goals')).toEqual({ ok: true })
    expect(lastWindow().loadURL).toHaveBeenLastCalledWith('https://upforge.gg/weekly-goals')
    await openWebShell(auth(), '/progress')
    expect(lastWindow().loadURL).toHaveBeenLastCalledWith('https://upforge.gg/progress')
  })

  it('accepts full URLs on the frontend host and its subdomains', async () => {
    expect(await openWebShell(auth(), 'https://www.upforge.gg/guides')).toEqual({ ok: true })
    expect(lastWindow().loadURL).toHaveBeenLastCalledWith('https://www.upforge.gg/guides')
  })

  it('sets the website auth cookie (secure, frontend URL) before loading', async () => {
    await openWebShell(auth(), '/dashboard')
    expect(h.cookiesSet).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://upforge.gg', name: '__Host-upforge_session', secure: true, httpOnly: true, path: '/',
    }))
  })
})

describe('openWebShell — the window', () => {
  it('is sandboxed in its own persistent partition', async () => {
    await openWebShell(auth(), '/dashboard')
    expect(lastWindow().options.webPreferences).toEqual({
      partition: 'persist:upforge-web',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    })
    expect(lastWindow().visible).toBe(true)
  })

  it('reuses one window: a second open focuses it and navigates', async () => {
    await openWebShell(auth(), '/dashboard')
    await openWebShell(auth(), '/coaches')
    expect(h.FakeWindow.created).toHaveLength(1)
    expect(lastWindow().focus).toHaveBeenCalled()
    expect(lastWindow().loadURL).toHaveBeenLastCalledWith('https://upforge.gg/coaches')
  })

  it('closeWebShell closes it; the next open makes a fresh window', async () => {
    await openWebShell(auth(), '/dashboard')
    const first = lastWindow()
    closeWebShell()
    expect(first.isDestroyed()).toBe(true)
    await openWebShell(auth(), '/dashboard')
    expect(h.FakeWindow.created).toHaveLength(2)
  })

  it('a navigation aborted by a redirect still counts as opened when a page is showing', async () => {
    h.loadError = new Error('ERR_ABORTED (-3) loading https://upforge.gg/dashboard')
    const win = new Promise<void>((resolve) => setTimeout(resolve, 0))
    const opened = openWebShell(auth(), '/dashboard')
    await win
    // A nested abort during the redirect chain is ignored; the finished load settles it.
    lastWindow().webContents.emit('did-fail-load', {}, -3, 'ERR_ABORTED')
    lastWindow().webContents.url = 'https://upforge.gg/dashboard'
    lastWindow().webContents.emit('did-finish-load')
    expect(await opened).toEqual({ ok: true })
  })

  it('other load failures are reported', async () => {
    h.loadError = new Error('ERR_NAME_NOT_RESOLVED (-105)')
    expect(await openWebShell(auth(), '/dashboard')).toEqual({ ok: false, error: 'ERR_NAME_NOT_RESOLVED (-105)' })
  })
})

describe('openWebShell — links inside the page', () => {
  async function openShell() {
    await openWebShell(auth(), '/dashboard')
    return lastWindow().webContents
  }

  it('in-site navigation stays in the shell', async () => {
    const wc = await openShell()
    const event = { preventDefault: vi.fn() }
    wc.emit('will-navigate', event, 'https://upforge.gg/progress')
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(h.openExternal).not.toHaveBeenCalled()
  })

  it('navigation to another https site is stopped and opened in the browser', async () => {
    const wc = await openShell()
    const event = { preventDefault: vi.fn() }
    wc.emit('will-navigate', event, 'https://discord.gg/upforge')
    expect(event.preventDefault).toHaveBeenCalled()
    expect(h.openExternal).toHaveBeenCalledWith('https://discord.gg/upforge')
  })

  it('a server redirect to another site is stopped too (will-redirect)', async () => {
    const wc = await openShell()
    const event = { preventDefault: vi.fn() }
    wc.emit('will-redirect', event, 'https://evil.example/phish')
    expect(event.preventDefault).toHaveBeenCalled()
    const inSite = { preventDefault: vi.fn() }
    wc.emit('will-redirect', inSite, 'https://upforge.gg/login')
    expect(inSite.preventDefault).not.toHaveBeenCalled()
  })

  it.each(['file:///C:/Windows/System32/calc.exe', 'ms-msdt:/id PCWDiagnostic', 'not a url'])(
    'navigation to %s is stopped and never opened',
    async (url) => {
      const wc = await openShell()
      const event = { preventDefault: vi.fn() }
      wc.emit('will-navigate', event, url)
      expect(event.preventDefault).toHaveBeenCalled()
      expect(h.openExternal).not.toHaveBeenCalled()
    },
  )

  it('window.open: same site loads in the shell, https elsewhere goes to the browser, popups always denied', async () => {
    const wc = await openShell()
    expect(wc.windowOpenHandler?.({ url: 'https://upforge.gg/guides' })).toEqual({ action: 'deny' })
    expect(wc.loadURL).toHaveBeenCalledWith('https://upforge.gg/guides')

    expect(wc.windowOpenHandler?.({ url: 'https://example.com/' })).toEqual({ action: 'deny' })
    expect(h.openExternal).toHaveBeenCalledWith('https://example.com/')

    h.openExternal.mockClear()
    expect(wc.windowOpenHandler?.({ url: 'smb://evil.example/share' })).toEqual({ action: 'deny' })
    expect(h.openExternal).not.toHaveBeenCalled()
  })
})
