import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { StartingGame, StartingReportResponse } from '../../../lib/starting-report'
import { readCache } from '../../../lib/stale-cache'
import { useStartingReport } from './useStartingReport'

afterEach(() => { vi.unstubAllGlobals() })

describe('useStartingReport', () => {
  it('never shows (or caches) a Valorant report on CS2 after a game switch', async () => {
    let answer!: (r: { ok: true; report: StartingReportResponse }) => void
    vi.stubGlobal('window', {
      api: { app: { getStartingReport: vi.fn(() => new Promise(res => { answer = res })) } },
    })
    const game = ref<StartingGame>('valorant')
    const s = useStartingReport(game)
    const pending = s.load()
    game.value = 'cs2'
    expect(s.data.value).toBeNull()
    answer({ ok: true, report: { status: 'ready', game: 'valorant' } })
    await pending
    expect(s.data.value).toBeNull()
    expect(readCache<StartingReportResponse>('starting-report:cs2')).toBeNull()
    expect(readCache<StartingReportResponse>('starting-report:valorant')?.value).toMatchObject({ game: 'valorant' })
    // Switching back shows the cached Valorant report again.
    game.value = 'valorant'
    expect(s.data.value).toMatchObject({ game: 'valorant' })
  })
})
