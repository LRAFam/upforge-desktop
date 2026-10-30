/**
 * Stale-while-revalidate cache for screen data (UI v3).
 * Screens render the last known value instantly, then refresh quietly.
 * Scoped per signed-in user; cleared on sign-out. Values must be JSON-safe.
 */
import { ref, shallowRef, type Ref } from 'vue'

const PREFIX = 'uf.cache.v1:'
const MAX_BYTES = 400_000 // per entry; larger payloads stay memory-only
const memory = new Map<string, { at: number; value: unknown }>()
const SCOPE_KEY = 'uf.cache.scope'
// Remember the last signed-in user so screens mounting before auth resolves still hit their cache.
let scope = (() => { try { return localStorage.getItem(SCOPE_KEY) ?? 'anon' } catch { return 'anon' } })()

/** Set on sign-in / account switch. Signing out (null) also clears every cached value. */
export function setCacheScope(userId: string | number | null | undefined, storage: Storage | null = safeStorage()): void {
  const next = userId == null ? 'anon' : String(userId)
  if (next !== scope && scope !== 'anon') clearCache(storage)
  scope = next
  try { storage?.setItem(SCOPE_KEY, next) } catch { /* ignore */ }
}

function storageKey(key: string): string { return `${PREFIX}${scope}:${key}` }

export function readCache<T>(key: string, storage: Storage | null = safeStorage()): { at: number; value: T } | null {
  const k = storageKey(key)
  const hit = memory.get(k)
  if (hit) return hit as { at: number; value: T }
  try {
    const raw = storage?.getItem(k)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: unknown; value?: unknown }
    if (typeof parsed?.at !== 'number' || !('value' in parsed)) return null
    const entry = { at: parsed.at, value: parsed.value as T }
    memory.set(k, entry)
    return entry
  } catch { return null }
}

export function writeCache<T>(key: string, value: T, storage: Storage | null = safeStorage(), now = Date.now()): void {
  const k = storageKey(key)
  const entry = { at: now, value }
  memory.set(k, entry)
  try {
    const raw = JSON.stringify(entry)
    if (raw.length <= MAX_BYTES) storage?.setItem(k, raw)
  } catch { /* quota or non-JSON value: memory only */ }
}

/** Drop every cached screen value (all users). Call on sign-out. */
export function clearCache(storage: Storage | null = safeStorage()): void {
  memory.clear()
  try {
    if (!storage) return
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k?.startsWith(PREFIX)) keys.push(k) }
    keys.forEach(k => storage.removeItem(k))
  } catch { /* ignore */ }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

export interface StaleLoad<T> {
  data: Ref<T | null>
  /** true only when there is nothing to show yet (first ever load) — show the skeleton. */
  loading: Ref<boolean>
  /** true while a background refresh runs over cached data — show at most a quiet indicator. */
  refreshing: Ref<boolean>
  error: Ref<string | null>
  reload: () => Promise<void>
}

/** Load screen data with cache-first rendering. `fetcher` errors keep the cached value visible. */
export function useStaleLoad<T>(key: string | (() => string), fetcher: () => Promise<T>): StaleLoad<T> {
  const keyOf = typeof key === 'function' ? key : () => key
  const cached = readCache<T>(keyOf())
  const data = shallowRef<T | null>(cached ? cached.value : null)
  const loading = ref(!cached)
  const refreshing = ref(false)
  const error = ref<string | null>(null)

  async function reload(): Promise<void> {
    const k = keyOf()
    const hit = readCache<T>(k)
    if (hit && data.value === null) data.value = hit.value
    loading.value = data.value === null
    refreshing.value = !loading.value
    try {
      const value = await fetcher()
      data.value = value
      writeCache(k, value)
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
      refreshing.value = false
    }
  }
  void reload()
  return { data, loading, refreshing, error, reload }
}
