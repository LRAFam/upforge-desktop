import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HotkeyManager, type HotkeyAction } from './hotkey-manager'

const shortcuts = vi.hoisted(() => ({
  active: new Map<string, () => void>(),
  taken: new Set<string>(),
}))
vi.mock('electron', () => ({ globalShortcut: {
  register: vi.fn((key: string, callback: () => void) => {
    if (shortcuts.taken.has(key) || shortcuts.active.has(key)) return false
    shortcuts.active.set(key, callback)
    return true
  }),
  unregister: vi.fn((key: string) => shortcuts.active.delete(key)),
  unregisterAll: vi.fn(() => shortcuts.active.clear()),
} }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

beforeEach(() => { shortcuts.active.clear(); shortcuts.taken.clear(); vi.clearAllMocks() })

describe('hotkey conflict recovery', () => {
  it('keeps the working shortcut when its replacement is taken', () => {
    const manager = new HotkeyManager()
    const bookmark = vi.fn()
    manager.on('save-clip', bookmark)
    manager.registerAll()
    shortcuts.taken.add('F7')
    expect(manager.update('save-clip', 'F7')).toBe(false)
    expect(manager.isRegistered('save-clip')).toBe(true)
    shortcuts.active.get('F9')?.()
    expect(bookmark).toHaveBeenCalledOnce()
    expect(manager.getBindings()['save-clip']).toBe('F9')
  })

  it('keeps another action working when the requested shortcut belongs to it', () => {
    const manager = new HotkeyManager()
    const screenshot = vi.fn()
    manager.on('take-screenshot', screenshot)
    manager.registerAll()
    expect(manager.update('save-clip', 'F8')).toBe(false)
    expect(shortcuts.active.has('F9')).toBe(true)
    shortcuts.active.get('F8')?.()
    expect(screenshot).toHaveBeenCalledOnce()
  })

  it('can register twice without turning working shortcuts into failures', () => {
    const manager = new HotkeyManager()
    manager.registerAll()
    expect(manager.registerAll()).toEqual({ 'save-clip': true, 'toggle-overlay': true, 'take-screenshot': true })
  })

  it('restores a user-selected conflict workaround after restart', () => {
    let saved: Partial<Record<HotkeyAction, string>> = {}
    const preferences = { load: () => saved, save: vi.fn((bindings) => { saved = { ...bindings } }) }
    shortcuts.taken.add('F9')
    const first = new HotkeyManager(preferences)
    expect(first.registerAll()['save-clip']).toBe(false)
    expect(first.update('save-clip', 'CommandOrControl+F9')).toBe(true)
    first.unregisterAll()
    const restarted = new HotkeyManager(preferences)
    const bookmark = vi.fn()
    restarted.on('save-clip', bookmark)
    expect(restarted.registerAll()['save-clip']).toBe(true)
    expect(restarted.getBindings()['save-clip']).toBe('CommandOrControl+F9')
    shortcuts.active.get('CommandOrControl+F9')?.()
    expect(bookmark).toHaveBeenCalledOnce()
  })

  it('retains the selected binding and failed status when it is taken at restart', () => {
    const preferences = { load: () => ({ 'save-clip': 'F7' }), save: vi.fn() }
    shortcuts.taken.add('F7')
    const manager = new HotkeyManager(preferences)
    expect(manager.registerAll()['save-clip']).toBe(false)
    expect(manager.isRegistered('save-clip')).toBe(false)
    expect(manager.getBindings()['save-clip']).toBe('F7')
    expect(preferences.save).not.toHaveBeenCalled()
  })
})
