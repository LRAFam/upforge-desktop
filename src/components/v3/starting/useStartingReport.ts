import { ref, watch, type Ref } from 'vue'
import type { StartingGame, StartingReportResponse } from '../../../lib/starting-report'
import { readCache, writeCache } from '../../../lib/stale-cache'

/** Generate at most once per game per app session (the API also limits and stores it). */
const triedThisSession = new Set<StartingGame>()

export function useStartingReport(game: Ref<StartingGame>) {
  const keyFor = (g: StartingGame) => `starting-report:${g}`
  const cached = (g: StartingGame) => readCache<StartingReportResponse>(keyFor(g))?.value ?? null
  const data = ref<StartingReportResponse | null>(cached(game.value))
  const loading = ref(data.value === null)
  const generating = ref(false)
  // A report belongs to one game: on switch show the new game's cache, never the old report.
  watch(game, (g) => {
    data.value = cached(g)
    loading.value = data.value === null
    generating.value = false
  }, { flush: 'sync' })
  /** Store a reply only if the player is still on the game it was asked for. */
  const accept = (g: StartingGame, report: StartingReportResponse) => {
    writeCache(keyFor(g), report)
    if (game.value === g) data.value = report
  }

  /** `retry`: the player pressed Try again, so a failed generate may run once more this session. */
  async function load(opts: { generate?: boolean; retry?: boolean } = {}): Promise<void> {
    const g = game.value
    loading.value = data.value === null
    const got = await window.api?.app?.getStartingReport?.(g).catch(() => null)
    if (got?.ok) accept(g, got.report)
    if (game.value !== g) return
    loading.value = false
    const status = data.value?.status
    if (opts.generate && (status === 'none' || status === 'insufficient' || !data.value) && (opts.retry || !triedThisSession.has(g))) {
      triedThisSession.add(g)
      generating.value = true
      const res = await window.api?.app?.generateStartingReport?.(g).catch(() => null)
      if (game.value === g) generating.value = false
      if (res?.ok) accept(g, res.report)
    }
  }

  async function dismiss(): Promise<void> {
    if (data.value) data.value = { ...data.value, dismissed: true }
    await window.api?.app?.dismissStartingReport?.(game.value).catch(() => null)
  }

  return { data, loading, generating, load, dismiss }
}
