import { ref, type Ref } from 'vue'
import type { StartingGame, StartingReportResponse } from '../../../lib/starting-report'
import { readCache, writeCache } from '../../../lib/stale-cache'

/** Generate at most once per game per app session (the API also limits and stores it). */
const triedThisSession = new Set<StartingGame>()

export function useStartingReport(game: Ref<StartingGame>) {
  const cacheKey = () => `starting-report:${game.value}`
  const data = ref<StartingReportResponse | null>(readCache<StartingReportResponse>(cacheKey())?.value ?? null)
  const loading = ref(data.value === null)
  const generating = ref(false)

  async function load(opts: { generate?: boolean } = {}): Promise<void> {
    const g = game.value
    loading.value = data.value === null
    const got = await window.api?.app?.getStartingReport?.(g).catch(() => null)
    if (got?.ok) { data.value = got.report; writeCache(cacheKey(), got.report) }
    loading.value = false
    const status = data.value?.status
    if (opts.generate && (status === 'none' || status === 'insufficient' || !data.value) && !triedThisSession.has(g)) {
      triedThisSession.add(g)
      generating.value = true
      const res = await window.api?.app?.generateStartingReport?.(g).catch(() => null)
      generating.value = false
      if (res?.ok) { data.value = res.report; writeCache(cacheKey(), res.report) }
    }
  }

  async function dismiss(): Promise<void> {
    if (data.value) data.value = { ...data.value, dismissed: true }
    await window.api?.app?.dismissStartingReport?.(game.value).catch(() => null)
  }

  return { data, loading, generating, load, dismiss }
}
