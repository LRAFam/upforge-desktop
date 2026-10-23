import { globalShortcut } from 'electron'
import log from 'electron-log'

export type HotkeyAction = 'save-clip' | 'toggle-overlay' | 'take-screenshot'
export type HotkeyBindings = Partial<Record<HotkeyAction, string>>

interface HotkeyPreferences {
  load(): HotkeyBindings | undefined
  save(bindings: HotkeyBindings): void
}

const DEFAULT_HOTKEYS: Record<HotkeyAction, string> = {
  'save-clip': 'F9',
  'toggle-overlay': 'F10',
  'take-screenshot': 'F8',
}

export class HotkeyManager {
  private registered: Map<HotkeyAction, string> = new Map()
  private callbacks: Map<HotkeyAction, () => void> = new Map()
  private bindings = { ...DEFAULT_HOTKEYS }

  constructor(private preferences?: HotkeyPreferences) {}

  on(action: HotkeyAction, callback: () => void): void {
    this.callbacks.set(action, callback)
  }

  /** Register all hotkeys using current (or default) bindings. Returns map of action → success. */
  registerAll(overrides: Partial<Record<HotkeyAction, string>> = {}): Record<HotkeyAction, boolean> {
    const requested = { ...this.bindings, ...this.preferences?.load(), ...overrides }
    const results = {} as Record<HotkeyAction, boolean>
    for (const [action, defaultKey] of Object.entries(DEFAULT_HOTKEYS) as [HotkeyAction, string][]) {
      const key = requested[action] ?? defaultKey
      results[action] = this._register(action, key)
      // Keep a failed startup binding visible so the user can resolve that conflict.
      this.bindings[action] = this.registered.get(action) ?? key
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

  /** Keep the old shortcut working until its replacement has registered. */
  update(action: HotkeyAction, accelerator: string): boolean {
    if (!Object.hasOwn(DEFAULT_HOTKEYS, action)) return false
    if (!this._register(action, accelerator)) return false
    this.bindings[action] = accelerator
    this.preferences?.save({ ...this.bindings })
    return true
  }

  unregisterAll(): void {
    globalShortcut.unregisterAll()
    this.registered.clear()
    log.info('[HotkeyManager] All hotkeys unregistered')
  }

  getBindings(): Record<HotkeyAction, string> {
    return { ...this.bindings }
  }

  private _register(action: HotkeyAction, accelerator: string): boolean {
    const old = this.registered.get(action)
    if (old === accelerator) return true
    try {
      const ok = globalShortcut.register(accelerator, () => {
        log.info(`[HotkeyManager] ${action} triggered (${accelerator})`)
        this.callbacks.get(action)?.()
      })
      if (ok) {
        if (old) globalShortcut.unregister(old)
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
