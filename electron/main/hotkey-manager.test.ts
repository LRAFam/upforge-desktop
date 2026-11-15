import { beforeEach, describe, expect, it, vi } from 'vitest'

const shortcuts = vi.hoisted(() => ({ register: vi.fn(), unregister: vi.fn(), unregisterAll: vi.fn() }))
vi.mock('electron', () => ({ globalShortcut: shortcuts }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
import { HotkeyManager } from './hotkey-manager'

beforeEach(() => {
  vi.clearAllMocks()
  shortcuts.register.mockReturnValue(true)
})

describe('hotkey recovery', () => {
  it('keeps the working shortcut when the replacement is claimed by another app', () => {
    const manager = new HotkeyManager()
    manager.registerAll()
    shortcuts.register.mockReturnValueOnce(false)
    expect(manager.update('save-clip', 'F11')).toBe(false)
    expect(shortcuts.unregister).not.toHaveBeenCalled()
    expect(manager.isRegistered('save-clip')).toBe(true)
    expect(manager.getBindings()['save-clip']).toBe('F9')
  })

  it('acquires the replacement before releasing the working shortcut', () => {
    const manager = new HotkeyManager()
    manager.registerAll()
    expect(manager.update('save-clip', 'F11')).toBe(true)
    expect(shortcuts.unregister).toHaveBeenCalledWith('F9')
    expect(shortcuts.register.mock.invocationCallOrder.at(-1)).toBeLessThan(shortcuts.unregister.mock.invocationCallOrder[0]!)
    expect(manager.getBindings()['save-clip']).toBe('F11')
  })

  it('recovers an initial F9 conflict with a new binding and invokes the callback', () => {
    const manager = new HotkeyManager()
    const save = vi.fn()
    manager.on('save-clip', save)
    shortcuts.register.mockReturnValueOnce(false)
    expect(manager.registerAll()['save-clip']).toBe(false)
    expect(manager.isRegistered('save-clip')).toBe(false)
    expect(manager.update('save-clip', 'F11')).toBe(true)
    shortcuts.register.mock.calls.at(-1)![1]()
    expect(save).toHaveBeenCalledOnce()
  })

  it('treats selecting the current shortcut as a no-op', () => {
    const manager = new HotkeyManager()
    manager.registerAll()
    shortcuts.register.mockClear()
    expect(manager.update('save-clip', 'F9')).toBe(true)
    expect(shortcuts.register).not.toHaveBeenCalled()
    expect(shortcuts.unregister).not.toHaveBeenCalled()
  })
})

describe('hotkey retry after a conflict clears', () => {
  it('re-claims F9 once the other app releases it', () => {
    const manager = new HotkeyManager()
    shortcuts.register.mockReturnValueOnce(false)
    manager.registerAll()
    expect(manager.isRegistered('save-clip')).toBe(false)
    expect(manager.retryFailed()).toEqual(['save-clip'])
    expect(manager.isRegistered('save-clip')).toBe(true)
    expect(shortcuts.register.mock.calls.at(-1)![0]).toBe('F9')
  })

  it('does not touch keys that are already registered', () => {
    const manager = new HotkeyManager()
    manager.registerAll()
    shortcuts.register.mockClear()
    expect(manager.retryFailed()).toEqual([])
    expect(shortcuts.register).not.toHaveBeenCalled()
  })

  it('reports nothing recovered while the key is still taken', () => {
    const manager = new HotkeyManager()
    shortcuts.register.mockReturnValueOnce(false)
    manager.registerAll()
    shortcuts.register.mockReturnValueOnce(false)
    expect(manager.retryFailed()).toEqual([])
    expect(manager.isRegistered('save-clip')).toBe(false)
  })
})
