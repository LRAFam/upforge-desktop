import { beforeEach, describe, expect, it } from 'vitest'
import { clearCache, setCacheScope } from '../../lib/stale-cache'
import { matchRouteKey, recallMatchSummary, rememberMatchSummary, summaryFromRow, summaryFromTimeline } from './match-summary'

beforeEach(() => { clearCache(); setCacheScope(1) })

describe('match summary', () => {
  it('keys a match page route by its source', () => {
    expect(matchRouteKey({ timelineId: '42' })).toBe('analysis:42')
    expect(matchRouteKey({ archiveId: 'abc' })).toBe('archive:abc')
    expect(matchRouteKey({ id: 'rec1' })).toBe('recording:rec1')
    expect(matchRouteKey({ timelineId: 'x' })).toBeNull()
    expect(matchRouteKey({})).toBeNull()
  })

  it('reads result, score and K/D/A only from the match data', () => {
    const s = summaryFromTimeline({ game: 'valorant', map: 'Summit', agent: 'Fade', gameMode: 'competitive', finalScore: { allyScore: 13, enemyScore: 10 }, finalStats: { kills: 29, deaths: 15, assists: 8 } })
    expect(s).toMatchObject({ map: 'Summit', ally: 13, enemy: 10, won: true, kills: 29, deaths: 15, assists: 8 })
    expect(summaryFromTimeline({ finalScore: { allyScore: 12, enemyScore: 12 } })?.won).toBeNull()
  })

  it('a row without match data gives map and agent but no invented result', () => {
    expect(summaryFromRow({ game: 'cs2', map: 'Mirage', agent: null, gameMode: 'premier', timeline: null }))
      .toMatchObject({ game: 'cs2', map: 'Mirage', won: null, ally: null, kills: null })
  })

  it('remembers the summary per signed-in user', () => {
    rememberMatchSummary('analysis:42', summaryFromTimeline({ map: 'Bind' }))
    expect(recallMatchSummary('analysis:42')?.map).toBe('Bind')
    setCacheScope(2)
    expect(recallMatchSummary('analysis:42')).toBeNull()
  })
})
