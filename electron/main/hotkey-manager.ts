import { globalShortcut, BrowserWindow } from 'electron'
import log from 'electron-log'

export type HotkeyAction = 'save-clip' | 'toggle-overlay' | 'take-screenshot'

const DEFAULT_HOTKEYS: Record<HotkeyAction, string> = {
  'save-clip': 'F9',
  'toggle-overlay': 'F10',
  'take-screenshot': 'F8',
}

export class HotkeyManager {
  private registered: Map<HotkeyAction, string> = new Map()
  private callbacks: Map<HotkeyAction, () => void> = new Map()

  on(action: HotkeyAction, callback: () => void): void {
    this.callbacks.set(action, callback)
  }

  /** Register all hotkeys using current (or default) bindings. Returns map of action → success. */
  registerAll(overrides: Partial<Record<HotkeyAction, string>> = {}): Record<HotkeyAction, boolean> {
    const results = {} as Record<HotkeyAction, boolean>
    for (const [action, defaultKey] of Object.entries(DEFAULT_HOTKEYS) as [HotkeyAction, string][]) {
      const key = overrides[action] ?? defaultKey
      results[action] = this._register(action, key)
    }
    const failed = (Object.entries(results) as [HotkeyAction, boolean][]).filter(([, ok]) => !ok).map(([a]) => a)
    if (failed.length > 0) {
      log.error(`[HotkeyManager] Failed to register hotkeys: ${failed.join(', ')} — they may be claimed by another app`)
    } else {
      log.info('[HotkeyManager] All hotkeys registered successfully')
    }
    return results
  }

  /** Returns true if the given action's hotkey is currently registered */
  isRegistered(action: HotkeyAction): boolean {
    return this.registered.has(action)
  }

  /** Update a single hotkey binding (unregisters old, registers new) */
  update(action: HotkeyAction, accelerator: string): boolean {
    const old = this.registered.get(action)
    if (old) {
      try { globalShortcut.unregister(old) } catch { /* ignore */ }
    }
    return this._register(action, accelerator)
  }

  unregisterAll(): void {
    globalShortcut.unregisterAll()
    this.registered.clear()
    log.info('[HotkeyManager] All hotkeys unregistered')
  }

  getBindings(): Record<HotkeyAction, string> {
    return {
      'save-clip': this.registered.get('save-clip') ?? DEFAULT_HOTKEYS['save-clip'],
      'toggle-overlay': this.registered.get('toggle-overlay') ?? DEFAULT_HOTKEYS['toggle-overlay'],
      'take-screenshot': this.registered.get('take-screenshot') ?? DEFAULT_HOTKEYS['take-screenshot'],
    }
  }

  private _register(action: HotkeyAction, accelerator: string): boolean {
    try {
      const ok = globalShortcut.register(accelerator, () => {
        log.info(`[HotkeyManager] ${action} triggered (${accelerator})`)
        this.callbacks.get(action)?.()
      })
      if (ok) {
        this.registered.set(action, accelerator)
        log.info(`[HotkeyManager] Registered ${action} → ${accelerator}`)
      } else {
        log.warn(`[HotkeyManager] Failed to register ${action} → ${accelerator} (key taken?)`)
      }
      return ok
    } catch (err) {
      log.error(`[HotkeyManager] Error registering ${action} → ${accelerator}:`, err)
      return false
    }
  }
}
