import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MATCH_SEARCH, MATCH_SEARCH_KEY, dateWords, inPeriod, matchesQuery, matchesSearch, readMatchSearch,
  saveMatchSearch, searchActive, searchHaystack,
} from './match-search'

const NOW = Date.parse('2026-11-25T12:00:00Z')
const DAY = 86_400_000
const bindJett = { map: 'Bind', agent: 'Jett', mode: 'Competitive', result: 'victory win', game: 'Valorant', playedMs: Date.parse('2026-11-22T18:00:00Z'), recorded: true }

describe('match search', () => {
  it('finds a match by map, agent, mode, result and date words', () => {
    const hay = searchHaystack(bindJett)
    for (const q of ['bind', 'JETT', 'jett bind', 'competitive', 'victory', '22 nov', 'november', 'sunday', '22/11']) {
      expect(matchesQuery(hay, q), q).toBe(true)
    }
    expect(matchesQuery(hay, 'jett ascent')).toBe(false)
  })
  it('has no date words for an unknown date', () => {
    expect(dateWords(0)).toBe('')
  })
  it('filters by played date window; unknown dates only under Any time', () => {
    expect(inPeriod(NOW - 3 * DAY, '7d', NOW)).toBe(true)
    expect(inPeriod(NOW - 10 * DAY, '7d', NOW)).toBe(false)
    expect(inPeriod(NOW - 60 * DAY, '90d', NOW)).toBe(true)
    expect(inPeriod(NOW - 120 * DAY, 'older', NOW)).toBe(true)
    expect(inPeriod(NOW - 10 * DAY, 'older', NOW)).toBe(false)
    expect(inPeriod(0, '30d', NOW)).toBe(false)
    expect(inPeriod(0, 'any', NOW)).toBe(true)
  })
  it('combines mode, recorded and text', () => {
    const s = { ...DEFAULT_MATCH_SEARCH }
    expect(matchesSearch(bindJett, s, NOW)).toBe(true)
    expect(matchesSearch(bindJett, { ...s, mode: 'Unrated' }, NOW)).toBe(false)
    expect(matchesSearch(bindJett, { ...s, mode: 'Competitive', query: 'bind' }, NOW)).toBe(true)
    expect(matchesSearch(bindJett, { ...s, recorded: 'not_recorded' }, NOW)).toBe(false)
    expect(matchesSearch({ ...bindJett, recorded: false }, { ...s, recorded: 'not_recorded' }, NOW)).toBe(true)
    expect(matchesSearch(bindJett, { ...s, period: '7d', query: 'jett' }, NOW)).toBe(true)
  })
  it('knows when anything is set', () => {
    expect(searchActive(DEFAULT_MATCH_SEARCH)).toBe(false)
    expect(searchActive({ ...DEFAULT_MATCH_SEARCH, query: '  ' })).toBe(false)
    expect(searchActive({ ...DEFAULT_MATCH_SEARCH, period: '30d' })).toBe(true)
  })
})

describe('saved match filters', () => {
  const store = () => {
    const data: Record<string, string> = {}
    return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v } }
  }
  it('round-trips the filters and status chip', () => {
    const s = store()
    saveMatchSearch(s, { query: 'bind', period: '30d', mode: 'Competitive', recorded: 'recorded', status: 'analysed' })
    expect(readMatchSearch(s)).toEqual({ query: 'bind', period: '30d', mode: 'Competitive', recorded: 'recorded', status: 'analysed' })
  })
  it('falls back to defaults for missing, broken or odd values', () => {
    expect(readMatchSearch(store())).toEqual(DEFAULT_MATCH_SEARCH)
    const s = store()
    s.data[MATCH_SEARCH_KEY] = '{not json'
    expect(readMatchSearch(s)).toEqual(DEFAULT_MATCH_SEARCH)
    s.data[MATCH_SEARCH_KEY] = JSON.stringify({ query: 5, period: 'forever', recorded: 'maybe' })
    expect(readMatchSearch(s)).toEqual(DEFAULT_MATCH_SEARCH)
    expect(readMatchSearch(null)).toEqual(DEFAULT_MATCH_SEARCH)
  })
})
