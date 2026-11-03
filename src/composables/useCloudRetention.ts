/**
 * Shared cloud-retention state (GET /account/cloud-retention), read by the Cloud storage page,
 * Matches, the match page and post-game. One cache-first load (`useStaleLoad`) per window, refreshed
 * quietly at most every 30 s; an older API (404) leaves `summary` null so screens render as before.
 */
import { computed, type ComputedRef, type Ref } from 'vue'
import { useStaleLoad, type StaleLoad } from '../lib/stale-cache'
import { expiringSoonLine, keepTimeLine, SAVES_PAUSED_FALLBACK, type RetentionSummary } from '../lib/cloud-retention'

const KEY = 'cloud-retention'
const FRESH_MS = 30_000

async function fetchSummary(): Promise<RetentionSummary | null> {
  const api = (window as { api?: Window['api'] }).api
  if (!api?.cloudStorage?.retention) return null
  const result = await api.cloudStorage.retention()
  if (result.ok) return result.data
  if (result.unavailable) return null
  throw new Error(result.error)
}

let shared: StaleLoad<RetentionSummary | null> | null = null
let lastLoaded = 0
let inFlight: Promise<void> | null = null

function load(): StaleLoad<RetentionSummary | null> {
  if (!shared) {
    shared = useStaleLoad<RetentionSummary | null>(KEY, fetchSummary)
    lastLoaded = Date.now()
    const reset = () => { if (shared) { shared.data.value = null; lastLoaded = 0 } }
    const api = (window as { api?: Window['api'] }).api
    api?.on?.('session:user-changed', () => { reset(); void refresh(true) })
    api?.on?.('auth:session-expired', reset)
  }
  return shared
}

async function refresh(force = false): Promise<void> {
  const s = load()
  if (inFlight) return inFlight
  if (!force && Date.now() - lastLoaded < FRESH_MS) return
  lastLoaded = Date.now()
  inFlight = s.reload().finally(() => { inFlight = null })
  return inFlight
}

export interface CloudRetentionState {
  summary: Ref<RetentionSummary | null>
  loading: Ref<boolean>
  error: Ref<string | null>
  /** Before launch (or an older API) there are no countdowns anywhere. */
  started: ComputedRef<boolean>
  /** "Free: each video kept 14 days" / "Kept while you're subscribed". */
  keepTime: ComputedRef<string | null>
  /** New "keep in cloud" saves are paused (quota full). Analysis is never paused. */
  savesPaused: ComputedRef<boolean>
  savesPausedMessage: ComputedRef<string | null>
  /** "2 videos leave the cloud soon · first in 3 days", or null. */
  expiringLine: ComputedRef<string | null>
  refresh: (force?: boolean) => Promise<void>
}

export function useCloudRetention(): CloudRetentionState {
  const s = load()
  void refresh()
  const summary = s.data
  return {
    summary,
    loading: s.loading,
    error: s.error,
    started: computed(() => summary.value?.started === true),
    keepTime: computed(() => (summary.value?.started ? keepTimeLine(summary.value) : null)),
    savesPaused: computed(() => summary.value?.saves_paused === true),
    savesPausedMessage: computed(() => (summary.value?.saves_paused ? summary.value.saves_paused_message ?? SAVES_PAUSED_FALLBACK : null)),
    expiringLine: computed(() => expiringSoonLine(summary.value)),
    refresh,
  }
}

/** Tests only. */
export function resetCloudRetentionForTests(): void { shared = null; lastLoaded = 0; inFlight = null }
