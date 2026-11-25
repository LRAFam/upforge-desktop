import { readMainRuntimeSource } from './__tests__/main-runtime-source'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The updater destroys every window before it installs (updater.ts runInstall), but the tray, the
// global shortcut and the macOS dock stay live until before-quit. They must never call into the
// destroyed main window: "Object has been destroyed" there is an uncaught main-process exception.

const trayHandlers: Record<string, () => void> = {}
let menuTemplate: Array<{ label?: string; click?: () => void }> = []

vi.mock('electron', () => {
  class Tray {
    on(name: string, handler: () => void) { trayHandlers[name] = handler; return this }
    setContextMenu() {}
    setToolTip() {}
  }
  return {
    Tray,
    Menu: { buildFromTemplate: (template: typeof menuTemplate) => { menuTemplate = template; return template } },
    nativeImage: { createFromPath: () => ({ resize: () => ({}) }) },
    BrowserWindow: class {},
    screen: {},
  }
})
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('./clip-extractor', () => ({ ClipExtractor: { clipsDir: () => '/tmp/clips' } }))
vi.mock('./shell-open', () => ({ openExternalSafe: vi.fn(), openPathSafe: vi.fn() }))
vi.mock('./funnel-events', () => ({ trackUpgradeClicked: vi.fn() }))

function destroyedWindow() {
  const destroyed = () => { throw new TypeError('Object has been destroyed') }
  return { isDestroyed: () => true, isVisible: vi.fn(destroyed), show: vi.fn(destroyed), focus: vi.fn(destroyed), hide: vi.fn(destroyed) }
}

function liveWindow(visible: boolean) {
  return { isDestroyed: () => false, isVisible: () => visible, show: vi.fn(), focus: vi.fn(), hide: vi.fn() }
}

async function setupTray(current: unknown) {
  const { createTray } = await import('./window-manager')
  const fresh = liveWindow(true)
  const deps = {
    getMainWindow: () => current as never,
    setMainWindow: vi.fn(),
    isRecording: () => false,
    getPendingCount: () => 0,
    createMainWindowFn: vi.fn(() => fresh as never),
  }
  const result = createTray(deps)
  clearInterval(result.refreshInterval)
  const openItem = menuTemplate.find((item) => item.label === 'Open UpForge')
  return { deps, fresh, openItem }
}

describe('tray with a destroyed main window', () => {
  beforeEach(() => { for (const key of Object.keys(trayHandlers)) delete trayHandlers[key] })

  it.each(['click', 'double-click', 'Open UpForge'])('%s opens a new window instead of throwing', async (action) => {
    const destroyed = destroyedWindow()
    const { deps, fresh, openItem } = await setupTray(destroyed)
    const run = action === 'Open UpForge' ? openItem?.click : trayHandlers[action]

    expect(() => run?.()).not.toThrow()
    expect(destroyed.isVisible).not.toHaveBeenCalled()
    expect(destroyed.show).not.toHaveBeenCalled()
    expect(deps.createMainWindowFn).toHaveBeenCalledOnce()
    expect(deps.setMainWindow).toHaveBeenCalledExactlyOnceWith(fresh)
  })

  it('still toggles a live main window on click', async () => {
    const visible = liveWindow(true)
    const shown = await setupTray(visible)
    trayHandlers['click']?.()
    expect(visible.hide).toHaveBeenCalledOnce()
    expect(shown.deps.createMainWindowFn).not.toHaveBeenCalled()

    const hidden = liveWindow(false)
    await setupTray(hidden)
    trayHandlers['click']?.()
    expect(hidden.show).toHaveBeenCalledOnce()
    expect(hidden.focus).toHaveBeenCalledOnce()
  })
})

const indexSource = readMainRuntimeSource('main-lifecycle.ts', 'main-startup.ts')

function runSlice(startMarker: string, _endMarker: string, context: Record<string, unknown>): vm.Context {
  const source = ts.createSourceFile('main-runtime.ts', indexSource, ts.ScriptTarget.Latest, true)
  let statement: ts.ExpressionStatement | undefined
  const visit = (node: ts.Node): void => {
    if (ts.isExpressionStatement(node) && node.getText(source).startsWith(startMarker)) statement = node
    else ts.forEachChild(node, visit)
  }
  visit(source)
  expect(statement, `${startMarker} not found in main runtime`).toBeDefined()
  const code = ts.transpileModule(statement!.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
  const ctx = vm.createContext(context)
  ctx.mainProcess = ctx
  vm.runInContext(code, ctx)
  return ctx
}

describe('macOS dock activate with a destroyed main window', () => {
  const load = (mainWindow: unknown) => {
    const handlers: Record<string, () => void> = {}
    const fresh = liveWindow(true)
    const ctx = runSlice("app.on('activate', () => {", '\n})\n', {
      app: { on: (name: string, handler: () => void) => { handlers[name] = handler } },
      ipcHandlersReady: true,
      mainWindow,
      createMainWindow: vi.fn(() => fresh),
    })
    return { ctx, fresh, activate: handlers['activate']! }
  }

  it('opens a new main window instead of throwing', () => {
    const destroyed = destroyedWindow()
    const { ctx, fresh, activate } = load(destroyed)

    expect(() => activate()).not.toThrow()
    expect(destroyed.show).not.toHaveBeenCalled()
    expect(ctx.createMainWindow).toHaveBeenCalledOnce()
    expect(ctx.mainWindow).toBe(fresh)
  })

  it('still shows a live main window', () => {
    const live = liveWindow(false)
    const { ctx, activate } = load(live)
    activate()
    expect(live.show).toHaveBeenCalledOnce()
    expect(ctx.createMainWindow).not.toHaveBeenCalled()
  })
})

describe('show-window shortcut with a destroyed main window', () => {
  const load = (mainWindow: unknown) => {
    const handlers: Record<string, () => void> = {}
    runSlice("globalShortcut.register('CommandOrControl+Shift+U', () => {", '\n  })\n', {
      globalShortcut: { register: (accelerator: string, handler: () => void) => { handlers[accelerator] = handler } },
      mainWindow,
    })
    return handlers['CommandOrControl+Shift+U']!
  }

  it('does nothing instead of throwing', () => {
    const destroyed = destroyedWindow()
    expect(() => load(destroyed)()).not.toThrow()
    expect(destroyed.show).not.toHaveBeenCalled()
  })

  it('still shows and focuses a live main window', () => {
    const live = liveWindow(false)
    load(live)()
    expect(live.show).toHaveBeenCalledOnce()
    expect(live.focus).toHaveBeenCalledOnce()
  })
})
