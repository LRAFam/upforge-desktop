import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const openVod = vi.fn<(router: unknown, id: number, opts?: unknown) => Promise<boolean>>()
vi.mock('./open-vod-review', () => ({ openAnalysisVodReview: (...args: [unknown, number, unknown]) => openVod(...args) }))

import { coachingReviewsLocation, lolAnalysisReportPath, openAnalysisInApp, openDeepLinkAnalysis, openLolAnalysisInApp } from './open-analysis-in-app'
import { openGameAnalysis } from './open-game-analysis'
import type { AnalysisItem } from '../env.d.ts'

function fakeRouter() {
  return { push: vi.fn(async () => undefined) }
}
const windowOpen = vi.fn()

beforeEach(() => {
  openVod.mockReset()
  windowOpen.mockReset()
  vi.stubGlobal('window', { open: windowOpen, api: { lol: { getAnalysis: vi.fn(async () => null) } } })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('openAnalysisInApp (notification click, Home "View results", bell, coach links)', () => {
  it('opens the match page when the timeline loads', async () => {
    openVod.mockResolvedValue(true)
    const router = fakeRouter()
    expect(await openAnalysisInApp(router, 42, { source: 'desktop_notification' })).toBe('match')
    expect(openVod).toHaveBeenCalledWith(router, 42, { source: 'desktop_notification', coachNotes: undefined })
    expect(router.push).not.toHaveBeenCalled()
    expect(windowOpen).not.toHaveBeenCalled()
  })

  it('falls back to Coaching reviews with the analysis selected — never the browser', async () => {
    openVod.mockResolvedValue(false)
    const router = fakeRouter()
    expect(await openAnalysisInApp(router, 42)).toBe('reviews')
    expect(router.push).toHaveBeenCalledWith({ path: '/recordings', query: { view: 'coaching', analysis: '42' } })
    openVod.mockRejectedValue(new Error('offline'))
    expect(await openAnalysisInApp(router, 43)).toBe('reviews')
    expect(windowOpen).not.toHaveBeenCalled()
  })

  it('ignores bad ids', async () => {
    const router = fakeRouter()
    for (const bad of [0, -1, 1.5, Number.NaN]) expect(await openAnalysisInApp(router, bad)).toBeNull()
    expect(router.push).not.toHaveBeenCalled()
  })
})

describe('League stats analyses', () => {
  it('open the in-app League report by Riot match id', async () => {
    expect(lolAnalysisReportPath({ match_id: 'EUW1_7012345678' })).toBe('/report/EUW1_7012345678?game=lol')
    expect(lolAnalysisReportPath({ match_id: '../x' })).toBeNull()
    const router = fakeRouter()
    expect(await openLolAnalysisInApp(router, { id: 9, match_id: 'NA1_55' })).toBe('report')
    expect(router.push).toHaveBeenCalledWith('/report/NA1_55?game=lol')
  })
})

describe('openGameAnalysis (Home / Coaching reviews rows)', () => {
  const row = (over: Partial<AnalysisItem>) => ({ id: 5, status: 'completed', ...over }) as AnalysisItem

  it('Deadlock replay reviews and CS2 web-demo reviews open Coaching reviews in the app', async () => {
    const router = fakeRouter()
    await openGameAnalysis('deadlock', row({ game_mode: 'DEADLOCK', job_id: 'job-1' }), router as never)
    await openGameAnalysis('cs2', row({ job_id: 'job-2' }), router as never)
    expect(router.push).toHaveBeenNthCalledWith(1, coachingReviewsLocation(5))
    expect(router.push).toHaveBeenNthCalledWith(2, coachingReviewsLocation(5))
    expect(openVod).not.toHaveBeenCalled()
    expect(windowOpen).not.toHaveBeenCalled()
  })

  it('Valorant, League and CS2 desktop recordings open the match page', async () => {
    openVod.mockResolvedValue(true)
    const router = fakeRouter()
    await openGameAnalysis('valorant', row({}), router as never)
    await openGameAnalysis('lol', row({}), router as never)
    await openGameAnalysis('cs2', row({ cs2_source: 'desktop_vod' }), router as never)
    expect(openVod).toHaveBeenCalledTimes(3)
    expect(windowOpen).not.toHaveBeenCalled()
  })
})

describe('openDeepLinkAnalysis (upforge://analysis/<game>/<id>)', () => {
  it('League tries the stats analysis first (like the web results page)', async () => {
    ;(window as unknown as { api: { lol: { getAnalysis: ReturnType<typeof vi.fn> } } }).api.lol.getAnalysis.mockResolvedValue({ id: 3, match_id: 'EUW1_1' })
    const router = fakeRouter()
    expect(await openDeepLinkAnalysis(router, { game: 'lol', analysisId: 3 })).toBe('report')
    expect(router.push).toHaveBeenCalledWith('/report/EUW1_1?game=lol')
    expect(openVod).not.toHaveBeenCalled()
  })

  it('other games (and League without a stats analysis) open the VOD analysis in the app', async () => {
    openVod.mockResolvedValue(true)
    const router = fakeRouter()
    expect(await openDeepLinkAnalysis(router, { game: 'valorant', analysisId: 8 })).toBe('match')
    expect(await openDeepLinkAnalysis(router, { game: 'lol', analysisId: 8 })).toBe('match')
    expect(openVod).toHaveBeenCalledWith(router, 8, { source: 'desktop_deep_link_valorant', coachNotes: undefined })
    expect(windowOpen).not.toHaveBeenCalled()
  })
})
