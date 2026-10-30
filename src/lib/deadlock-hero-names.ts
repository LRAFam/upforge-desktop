/**
 * Deadlock hero names for recordings. The match watcher stores `hero_<id>`; names come from the
 * stats the app already fetches (hero_stats + recent_matches). Loaded once per session and only
 * when a Deadlock row is shown; falls back to "Unknown hero", never the raw key.
 */
import { ref } from 'vue'
import { deadlockHeroLabel } from './deadlock'

type KnownHero = { hero_id?: number | null; hero_name?: string | null }

export const deadlockHeroes = ref<KnownHero[]>([])
let loading: Promise<void> | null = null

export function heroesFromStats(stats: unknown): KnownHero[] {
  const s = stats as { hero_stats?: KnownHero[]; recent_matches?: KnownHero[] } | null | undefined
  return [...(s?.hero_stats ?? []), ...(s?.recent_matches ?? [])]
    .filter(h => typeof h?.hero_id === 'number' && typeof h?.hero_name === 'string')
}

export function loadDeadlockHeroesOnce(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    try {
      const res = await window.api?.deadlock?.getStats?.()
      deadlockHeroes.value = heroesFromStats((res as { stats?: unknown } | null)?.stats)
    } catch { /* names fall back to "Unknown hero" */ }
  })()
  return loading
}

/** Label for a Deadlock recording's hero key (`hero_13` → "Haze"). Real names pass through. */
export function deadlockRecordingHero(key: string | null | undefined): string {
  return deadlockHeroLabel(key, deadlockHeroes.value)
}
