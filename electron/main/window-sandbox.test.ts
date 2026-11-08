import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))
vi.mock('electron-log', () => ({ default: { warn: vi.fn() } }))

import { lockDownWindowNavigation } from './window-security'

const ELECTRON_DIR = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__fixtures__' ? [] : sourceFiles(path)
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : []
  })
}

/** Return the text of the object literal passed to each `new BrowserWindow(`. */
function browserWindowConfigs(source: string): string[] {
  const configs: string[] = []
  let from = 0
  for (;;) {
    const start = source.indexOf('new BrowserWindow(', from)
    if (start < 0) return configs
    const open = source.indexOf('{', start)
    let depth = 0
    let end = open
    for (; end < source.length; end++) {
      if (source[end] === '{') depth++
      else if (source[end] === '}' && --depth === 0) break
    }
    configs.push(source.slice(open, end + 1))
    from = end
  }
}

describe('BrowserWindow sandboxing (card 37)', () => {
  const windows = sourceFiles(ELECTRON_DIR).flatMap((file) =>
    browserWindowConfigs(readFileSync(file, 'utf8')).map((config) => ({
      file: relative(ELECTRON_DIR, file),
      config,
    })),
  )

  it('finds the app windows', () => {
    expect(windows.length).toBeGreaterThanOrEqual(5)
  })

  it('enables sandbox, context isolation and no node integration on every window', () => {
    for (const { file, config } of windows) {
      expect(config, file).toMatch(/sandbox:\s*true/)
      expect(config, file).not.toMatch(/sandbox:\s*false/)
      expect(config, file).toMatch(/contextIsolation:\s*true/)
      expect(config, file).not.toMatch(/nodeIntegration:\s*true/)
    }
  })

  it('keeps the shared preload free of Node-only imports', () => {
    const preload = readFileSync(join(ELECTRON_DIR, 'preload/index.ts'), 'utf8')
    const runtimeImports = [...preload.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1])
    expect(runtimeImports).toEqual(['electron'])
    expect(preload).not.toMatch(/\brequire\(/)
  })

  it('gives the overlay and splash a navigation lock', () => {
    const overlay = readFileSync(join(ELECTRON_DIR, 'main/overlay-window.ts'), 'utf8')
    expect(overlay).toMatch(/lockDownWindowNavigation\(win/)
    const manager = readFileSync(join(ELECTRON_DIR, 'main/window-manager.ts'), 'utf8')
    expect(manager).toMatch(/lockDownWindowNavigation\(win, 'desktop_splash'\)/)
  })
})

describe('main window external links (card 36 follow-up)', () => {
  it('only hands safe https links to the OS browser', () => {
    const manager = readFileSync(join(ELECTRON_DIR, 'main/window-manager.ts'), 'utf8')
    expect(manager).not.toMatch(/https\?:\/i\.test\(url\)\) void shell\.openExternal/)
    expect(manager).toMatch(/isSafeExternalUrl\(url\)\) void shell\.openExternal\(url\)/)
  })
})

describe('lockDownWindowNavigation', () => {
  function fakeWindow() {
    const listeners: Record<string, (event: { preventDefault: () => void }, url: string) => void> = {}
    let openHandler: ((details: { url: string }) => { action: string }) | undefined
    const win = {
      webContents: {
        setWindowOpenHandler: (fn: typeof openHandler) => { openHandler = fn },
        on: (name: string, fn: (typeof listeners)[string]) => { listeners[name] = fn },
      },
    }
    return { win, listeners, open: (url: string) => openHandler!({ url }) }
  }

  it('denies every window.open, including https links', async () => {
    const { shell } = await import('electron')
    const { win, open } = fakeWindow()
    lockDownWindowNavigation(win as never, 'overlay')
    expect(open('https://evil.example')).toEqual({ action: 'deny' })
    expect(open('file:///etc/passwd')).toEqual({ action: 'deny' })
    expect(shell.openExternal).not.toHaveBeenCalled()
  })

  it('blocks navigation away from the renderer entry', () => {
    const { win, listeners } = fakeWindow()
    lockDownWindowNavigation(win as never, 'overlay', () => false)
    for (const name of ['will-navigate', 'will-redirect']) {
      const preventDefault = vi.fn()
      listeners[name]({ preventDefault }, 'https://evil.example')
      expect(preventDefault, name).toHaveBeenCalled()
    }
  })

  it('allows hash navigation inside the trusted renderer', () => {
    const { win, listeners } = fakeWindow()
    lockDownWindowNavigation(win as never, 'overlay', () => true)
    const preventDefault = vi.fn()
    listeners['will-navigate']({ preventDefault }, 'file:///app/index.html#/overlay')
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
