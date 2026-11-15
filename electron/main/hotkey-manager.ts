import { globalShortcut } from 'electron'
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
  /** Keys we tried to claim at startup; used to retry once another app releases them. */
  private wanted: Map<HotkeyAction, string> = new Map()

  on(action: HotkeyAction, callback: () => void): void {
    this.callbacks.set(action, callback)
  }

  /** Register all hotkeys using current (or default) bindings. Returns map of action → success. */
  registerAll(overrides: Partial<Record<HotkeyAction, string>> = {}): Record<HotkeyAction, boolean> {
    const results = {} as Record<HotkeyAction, boolean>
    for (const [action, defaultKey] of Object.entries(DEFAULT_HOTKEYS) as [HotkeyAction, string][]) {
      const key = overrides[action] ?? defaultKey
      this.wanted.set(action, key)
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

  /**
   * Try again to claim keys that failed (e.g. another app held F9 and has since closed).
   * Returns the actions that are registered now but were not before.
   */
  retryFailed(): HotkeyAction[] {
    const recovered: HotkeyAction[] = []
    for (const [action, key] of this.wanted) {
      if (this.registered.has(action)) continue
      if (this._register(action, key)) recovered.push(action)
    }
    return recovered
  }

  /** Keep the working binding until its replacement has been acquired. */
  update(action: HotkeyAction, accelerator: string): boolean {
    const old = this.registered.get(action)
    if (old === accelerator) return true
    if (!this._register(action, accelerator)) return false
    this.wanted.set(action, accelerator)
    if (old) {
      try { globalShortcut.unregister(old) } catch { /* ignore */ }
    }
    return true
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
