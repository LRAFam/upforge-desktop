/**
 * One shared, cached copy of the student coach hub for v3 surfaces (Home, match page,
 * sidebar badge, notifications). Cache-first via stale-cache; refreshes at most once a minute
 * unless forced, and never runs two requests at once.
 */
import { shallowRef } from 'vue'
import { readCache, writeCache } from '../../../lib/stale-cache'
import type { StudentHub } from './roster-flow'

const CACHE_KEY = 'roster:student-hub'
const MIN_GAP_MS = 60_000

const hub = shallowRef<StudentHub | null>(readCache<StudentHub>(CACHE_KEY)?.value ?? null)
let lastFetch = 0
let inflight: Promise<StudentHub | null> | null = null

export async function refreshStudentHub(force = false): Promise<StudentHub | null> {
  if (inflight) return inflight
  if (!force && Date.now() - lastFetch < MIN_GAP_MS && hub.value) return hub.value
  const get = window.api?.coach?.getStudentHub
  if (!get) return hub.value
  inflight = get()
    .then((res) => {
      const next = res as unknown as StudentHub
      hub.value = next
      writeCache(CACHE_KEY, next)
      return next
    })
    .catch(() => hub.value) // signed out / offline: keep what we had
    .finally(() => { lastFetch = Date.now(); inflight = null })
  return inflight
}

export function useStudentHub() {
  if (!hub.value) {
    const cached = readCache<StudentHub>(CACHE_KEY)?.value
    if (cached) hub.value = cached
  }
  return { hub, refresh: refreshStudentHub }
}
