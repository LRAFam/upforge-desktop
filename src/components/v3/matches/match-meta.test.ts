import { describe, expect, it } from 'vitest'
import { dedupeAnalysesByMatch, formatMatchDate, groupByMatchDate, matchDateGroup, matchDateMs, matchMapArt, matchMapLabel, matchRowArt } from './match-meta'

// Monday 2 Nov 2026, 12:00 local time.
const now = new Date(2026, 10, 2, 12, 0).getTime()
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime()

describe('matchDateMs', () => {
  it('takes the earliest known timestamp (a match is never played after it was uploaded or analysed)', () => {
    // Summit 13–10: archive uploaded 5 Sept, analysed again on 24 Sept → the match date is 5 Sept.
    expect(matchDateMs('2026-09-24T21:27:16Z', Date.parse('2026-09-05T00:16:53Z'))).toBe(Date.parse('2026-09-05T00:16:53Z'))
  })
  it('ignores missing and invalid values', () => {
    expect(matchDateMs(null, undefined, '', 'nope', 0)).toBe(0)
    expect(matchDateMs(null, '2026-09-24T00:00:00Z')).toBe(Date.parse('2026-09-24T00:00:00Z'))
  })
})

describe('matchDateGroup', () => {
  it('uses real groups with the same wording everywhere', () => {
    expect(matchDateGroup(at(2026, 10, 2, 9), now)).toBe('Today')
    expect(matchDateGroup(at(2026, 10, 1), now)).toBe('Last week') // Sunday before a Monday
    expect(matchDateGroup(at(2026, 9, 27), now)).toBe('Last week')
    expect(matchDateGroup(at(2026, 9, 25), now)).toBe('October')
    expect(matchDateGroup(at(2026, 8, 5), now)).toBe('September')
    expect(matchDateGroup(at(2025, 11, 30), now)).toBe('December 2025')
    expect(matchDateGroup(0, now)).toBe('Date unknown')
  })
  it('puts earlier days of the current week in This week', () => {
    const thursday = new Date(2026, 10, 5, 12).getTime()
    expect(matchDateGroup(at(2026, 10, 3), thursday)).toBe('This week')
  })
})

describe('groupByMatchDate', () => {
  it('sorts newest first and keeps one group per label', () => {
    const items = [{ d: at(2026, 8, 5) }, { d: at(2026, 10, 2, 8) }, { d: at(2026, 8, 24) }, { d: at(2026, 7, 29) }]
    const groups = groupByMatchDate(items, i => i.d, now)
    expect(groups.map(g => [g.label, g.items.length])).toEqual([['Today', 1], ['September', 2], ['August', 1]])
    expect(groups[1].items[0].d).toBe(at(2026, 8, 24))
  })
})

describe('formatMatchDate', () => {
  it('is relative for the last week, then a short day + month', () => {
    expect(formatMatchDate(now - 3 * 3_600_000, now)).toBe('3h ago')
    expect(formatMatchDate(at(2026, 8, 5), now)).toBe('5 Sept')
    expect(formatMatchDate(at(2025, 8, 5), now)).toBe('5 Sept 2025')
    expect(formatMatchDate(0, now)).toBe('')
  })
})

describe('matchMapLabel / matchMapArt', () => {
  it('never shows a raw CS2 map key', () => {
    expect(matchMapLabel('cs2', 'de_vertigo')).toBe('Vertigo')
    expect(matchMapLabel('cs2', 'de_dust2')).toBe('Dust II')
    expect(matchMapLabel('valorant', 'Summit')).toBe('Summit')
  })
  it('falls back to the CS2 card art when a map has no radar art', () => {
    expect(matchMapArt('cs2', 'de_vertigo')).toMatch(/cs2-card-bg/)
    expect(matchMapArt('cs2', 'de_mirage')).toMatch(/de_mirage/)
  })
})

describe('dedupeAnalysesByMatch', () => {
  it('collapses re-runs of the same match to the newest scored one', () => {
    const list = [
      { id: 634, match_id: 'ef4d', overall_score: 50, created_at: '2026-09-22T20:36:29Z' },
      { id: 633, match_id: 'ef4d', overall_score: null, created_at: '2026-09-22T19:12:45Z' },
      { id: 632, match_id: 'ef4d', overall_score: null, created_at: '2026-09-22T18:27:16Z' },
      { id: 625, match_id: '47a8', overall_score: 60, created_at: '2026-09-20T00:42:10Z' },
      { id: 1, match_id: null, overall_score: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 2, match_id: null, overall_score: null, created_at: '2026-01-01T00:00:00Z' },
    ]
    expect(dedupeAnalysesByMatch(list).map(a => a.id)).toEqual([634, 625, 1, 2])
  })
  it('prefers a scored run over a newer unscored one', () => {
    const list = [
      { id: 553, match_id: '2d79', overall_score: null, created_at: '2026-08-16T22:30:43Z' },
      { id: 550, match_id: '2d79', overall_score: 50, created_at: '2026-08-16T19:06:04Z' },
    ]
    expect(dedupeAnalysesByMatch(list).map(a => a.id)).toEqual([550])
  })
})

describe('matchRowArt', () => {
  const rec = (game: string, agent: string | null, map: string | null) => ({ game, agent, map, timeline: null }) as never
  it('Valorant: map splash backdrop with the agent full portrait', () => {
    const a = matchRowArt(rec('valorant', 'Jett', 'Bind'))
    expect(a.backdrop).toMatch(/maps\/.+\/splash\.png$/)
    expect(a.figure).toMatch(/agents\/.+\/fullportrait\.png$/)
    expect(a.icon).toBe('')
  })
  it('League: champion splash as the backdrop', () => {
    expect(matchRowArt(rec('lol', 'Ahri', "Summoner's Rift")).backdrop).toMatch(/champion\/splash\/Ahri_0\.jpg$/)
  })
  it('Valorant without an agent: map only', () => {
    expect(matchRowArt(rec('valorant', null, 'Bind'))).toMatchObject({ figure: '', icon: '' })
  })
})
