/**
 * Finished analyses the player hasn't opened yet (kept by the main process).
 * Drives the Matches badge and the Home "Coaching ready" line; cleared when the analysis is opened.
 */
import { computed, ref } from 'vue'

export interface ReadyAnalysisItem {
  analysisId: number
  game: string
  label: string
  map: string | null
  readyAt: string
}

const items = ref<ReadyAnalysisItem[]>([])
let started = false

function set(next: unknown) {
  items.value = Array.isArray(next) ? next as ReadyAnalysisItem[] : []
}

function start() {
  if (started || typeof window === 'undefined' || !window.api) return
  started = true
  void window.api.analyses?.ready?.().then(set).catch(() => {})
  window.api.on?.('analyses:ready-changed', (...args: unknown[]) => set(args[0]))
  // Account switch swaps the list in main; reload it.
  window.api.on?.('session:user-changed', () => { void window.api.analyses?.ready?.().then(set).catch(() => {}) })
}

/** Clear one analysis from the "ready" list (call when the player opens it). */
export function markAnalysisSeen(analysisId: number | null | undefined): void {
  if (typeof analysisId !== 'number' || !items.value.some(r => r.analysisId === analysisId)) return
  items.value = items.value.filter(r => r.analysisId !== analysisId)
  void window.api?.analyses?.markSeen?.(analysisId).catch(() => {})
}

export function useReadyAnalyses() {
  start()
  return {
    items,
    count: computed(() => items.value.length),
    newest: computed(() => items.value[0] ?? null),
  }
}
