import { globalShortcut, BrowserWindow } from 'electron'
import log from 'electron-log'

export type HotkeyAction = 'save-clip' | 'toggle-overlay'

const DEFAULT_HOTKEYS: Record<HotkeyAction, string> = {
  'save-clip': 'F9',
  'toggle-overlay': 'F10',
}

export class HotkeyManager {
  private registered: Map<HotkeyAction, string> = new Map()
  private callbacks: Map<HotkeyAction, () => void> = new Map()

  on(action: HotkeyAction, callback: () => void): void {
    this.callbacks.set(action, callback)
  }

  /** Register all hotkeys using current (or default) bindings */
  registerAll(overrides: Partial<Record<HotkeyAction, string>> = {}): void {
    for (const [action, defaultKey] of Object.entries(DEFAULT_HOTKEYS) as [HotkeyAction, string][]) {
      const key = overrides[action] ?? defaultKey
      this._register(action, key)
    }
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
