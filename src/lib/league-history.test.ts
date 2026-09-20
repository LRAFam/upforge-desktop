import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../components/CS2StatsPanel.vue', () => ({ default: {} }))
vi.mock('../components/Cs2ValveStatsPanel.vue', () => ({ default: {} }))
vi.mock('../components/CS2SetupPanel.vue', () => ({ default: {} }))
vi.mock('../components/DeadlockStatsPanel.vue', () => ({ default: {} }))
vi.mock('../components/DeadlockDemoPanel.vue', () => ({ default: {} }))
vi.mock('../components/LolStatsPanel.vue', () => ({ default: {} }))

import { gameModule } from './game-modules'

afterEach(() => vi.unstubAllGlobals())
describe('League desktop history', () => {
  it('loads desktop report IDs from the desktop endpoint, not the Riot report table', async () => {
    const reports = [{ id: 42, agent: 'Kindred' }]
    const get = vi.fn().mockResolvedValue(reports)
    const getAnalyses = vi.fn()
    vi.stubGlobal('window', { api: { analyses: { get }, lol: { getAnalyses } } })
    expect(await gameModule('lol').loadAnalyses(50)).toEqual(reports)
    expect(get).toHaveBeenCalledWith(50, 'lol')
    expect(getAnalyses).not.toHaveBeenCalled()
    expect(gameModule('lol').features.coachingDetail).toBe(true)
  })
  it('opens recordings in the app without requiring Riot or OBS', () => {
    const push = vi.fn()
    gameModule('lol').openAnalyze({ push })
    expect(push).toHaveBeenCalledWith({ path: '/recordings', query: { game: 'lol' } })
  })
})
