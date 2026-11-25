import vm from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { compileMainRuntimeFunctions, readMainRuntimeSource } from './__tests__/main-runtime-source'

const factories = [
  ['main-analysis.ts', 'createMainAnalysis'],
  ['main-analysis-notifications.ts', 'createMainAnalysisNotifications'],
  ['main-dev-preview.ts', 'createMainDevPreview'],
  ['main-lifecycle.ts', 'createMainLifecycle'],
  ['main-match-detection.ts', 'createMainMatchDetection'],
  ['main-readiness.ts', 'createMainReadiness'],
  ['main-replay.ts', 'createMainReplay'],
  ['main-session.ts', 'createMainSession'],
  ['main-startup.ts', 'createMainStartup'],
] as const

function factory(file: string, name: string, globals: Record<string, unknown> = {}) {
  const exports: Record<string, (bindings: unknown) => Record<string, () => void>> = {}
  vm.runInNewContext(compileMainRuntimeFunctions(file, [name]), { exports, ...globals })
  return exports[name]!
}

describe('main-process composition', () => {
  it.each(factories)('%s can be composed before application state initializes', (file, name) => {
    const untouched = new Proxy({}, { get() { throw new Error('Read application state before startup') } })
    expect(() => factory(file, name)(untouched)).not.toThrow()
  })

  it('shares live window/account state and writes through to the original bindings', () => {
    const source = ts.createSourceFile('index.ts', readMainRuntimeSource('index.ts'), ts.ScriptTarget.Latest, true)
    const declaration = source.statements.find(node => ts.isVariableStatement(node)
      && node.declarationList.declarations.some(item => ts.isIdentifier(item.name) && item.name.text === 'mainRuntimeBindings'))
    expect(declaration).toBeDefined()
    const compiled = ts.transpileModule(`${declaration!.getText(source)}\nglobalThis.bindings = mainRuntimeBindings`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText
    const initialWindow = { name: 'old window' }
    const nextWindow = { name: 'new window' }
    const context = vm.createContext({ mainWindow: initialWindow, replayScope: 4, isQuitting: false })
    vm.runInContext(compiled, context)
    expect(context.bindings.mainWindow).toBe(initialWindow)
    context.mainWindow = nextWindow
    expect(context.bindings.mainWindow).toBe(nextWindow)
    context.bindings.mainWindow = null
    context.bindings.replayScope++
    context.bindings.isQuitting = true
    expect(context.mainWindow).toBeNull()
    expect(context.replayScope).toBe(5)
    expect(context.isQuitting).toBe(true)
  })

  it('registers one quit coordinator, preserves cancelled work and keeps teardown order', () => {
    const calls: string[] = []
    const handlers = new Map<string, Array<(event: unknown) => void>>()
    let blocked = true
    const note = (name: string) => () => { calls.push(name) }
    const guard = { handleBeforeQuit: () => blocked, confirmThen: vi.fn() }
    const globals = {
      app: { on: (event: string, callback: (event: unknown) => void) => {
        handlers.set(event, [...handlers.get(event) ?? [], callback])
      } },
      createQuitGuard: () => guard,
      setInstallGate: vi.fn(),
      flushAllCataloguesSync: note('catalogues'),
      backgroundWork: { cancel: note('background') },
      clearInterval: note('tray-timer'),
      cancelAllPollingTimers: note('polling'),
      globalShortcut: { unregisterAll: note('shortcuts') },
      destroyOverlay: note('overlay'),
    }
    const state = {
      supportActivity: { flushSync: note('support') },
      replayScope: 9,
      cs2DemoRetrieval: { clear: note('demo') },
      overstepBridge: { disable: note('overstep') },
      isQuitting: false,
      stopObsHealthMonitor: note('obs-monitor'),
      stopInstanceCoordinator: note('instance') as (() => void) | null,
      obsRecorder: { forceStop: note('obsolete-recorder') },
      trayRefreshInterval: 1,
      tray: { destroy: note('tray') } as { destroy(): void } | null,
      gameDetector: { stop: note('detector') },
      hotkeyManager: { unregisterAll: note('hotkeys') },
      discordRPC: { destroy: note('discord') },
    }
    factory('main-lifecycle.ts', 'createMainLifecycle', globals)(state).registerMainLifecycle!()
    expect(handlers.get('before-quit')).toHaveLength(1)
    const quit = handlers.get('before-quit')![0]!
    quit({})
    expect(calls).toEqual([])
    expect(state.isQuitting).toBe(false)
    expect(state.replayScope).toBe(9)

    // The handler must read today's recorder, not the object that existed during registration.
    state.obsRecorder = { forceStop: note('recorder') }
    blocked = false
    quit({})
    expect(calls).toEqual([
      'catalogues', 'support', 'demo', 'overstep', 'background', 'obs-monitor', 'instance',
      'recorder', 'tray-timer', 'tray', 'polling', 'detector', 'hotkeys', 'shortcuts', 'overlay', 'discord',
    ])
    expect(state.isQuitting).toBe(true)
    expect(state.replayScope).toBe(10)
    expect(state.stopInstanceCoordinator).toBeNull()
    expect(state.tray).toBeNull()
  })
})
