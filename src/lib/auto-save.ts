/**
 * Debounced auto-save with a visible state, so a section that saves on the server reads the same
 * as the switches beside it that save instantly: no Save button, and a word next to the controls
 * saying whether the change has landed.
 */
import { toRaw } from 'vue'

/**
 * Plain, IPC-safe copy of a settings value. Callers pass Vue reactive state (a `ref`'s value
 * seen by a deep `watch` is a Proxy), and `structuredClone` throws "could not be cloned" on
 * a Proxy. Settings values are JSON data, so a JSON round-trip of the raw object is exact
 * and also strips any nested Proxy.
 */
export function plainCopy<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(toRaw(value))) as T
}

export type AutoSaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'failed' | 'invalid'

export interface AutoSaver<T> {
  /** Call after every change; saves once the value stops changing for `delayMs`. */
  schedule(value: T): void
  /** Save the last scheduled value now (e.g. a Retry button). */
  flush(): Promise<void>
  /** Mark `value` as already saved (after loading), so it is not sent again. */
  markSaved(value: T): void
  dispose(): void
}

export function createAutoSaver<T>(opts: {
  save: (value: T) => Promise<T | void>
  onState: (state: AutoSaveState) => void
  /** Saved value from the server (may be normalised). */
  onSaved?: (value: T) => void
  delayMs?: number
  valid?: (value: T) => boolean
}): AutoSaver<T> {
  const delay = opts.delayMs ?? 600
  let timer: ReturnType<typeof setTimeout> | undefined
  let latest: T | undefined
  let lastSaved: string | null = null
  let disposed = false
  const key = (v: T) => JSON.stringify(v)

  async function run(): Promise<void> {
    clearTimeout(timer)
    timer = undefined
    if (disposed || latest === undefined) return
    const value = plainCopy(latest)
    if (key(value) === lastSaved) { opts.onState('saved'); return }
    if (opts.valid && !opts.valid(value)) { opts.onState('invalid'); return }
    opts.onState('saving')
    try {
      const result = await opts.save(value)
      if (disposed) return
      const saved = (result ?? value) as T
      lastSaved = key(saved)
      // A newer change arrived while saving: keep it pending.
      if (latest !== undefined && key(latest) !== key(value)) { schedule(latest); return }
      opts.onSaved?.(saved)
      opts.onState('saved')
    } catch {
      if (!disposed) opts.onState('failed')
    }
  }

  function schedule(value: T): void {
    latest = plainCopy(value)
    if (key(latest) === lastSaved) { clearTimeout(timer); timer = undefined; return }
    opts.onState('pending')
    clearTimeout(timer)
    timer = setTimeout(() => { void run() }, delay)
  }

  return {
    schedule,
    flush: run,
    markSaved(value) { lastSaved = key(value); latest = plainCopy(value) },
    dispose() { disposed = true; clearTimeout(timer) },
  }
}

export const AUTO_SAVE_LABEL: Record<AutoSaveState, string> = {
  idle: '',
  pending: 'Saving…',
  saving: 'Saving…',
  saved: 'Saved',
  failed: "Couldn't save. Your previous settings still apply.",
  invalid: 'Not saved yet: check the highlighted value.',
}
