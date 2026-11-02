import { describe, expect, it } from 'vitest'
import { lolLoadout, lolProfileIconId, lolRecentErrorText, normalizeLolRecent, LOL_RECENT_ERROR_TITLE } from './lol-recent'

const match = {
  match_id: 'EUW1_1', queue_id: 420, champion: 'Ahri', role: 'MIDDLE', lane: 'MIDDLE', win: true,
  kills: 7, deaths: 2, assists: 9, game_duration_seconds: 1880, game_creation: 1,
}

describe('normalizeLolRecent', () => {
  it('reads an older API body (matches only) as complete with no error', () => {
    expect(normalizeLolRecent({ success: true, matches: [match] })).toEqual({ matches: [match], error: null, errorReason: null, partial: false })
  })

  it('keeps Riot being down apart from "no games"', () => {
    const down = normalizeLolRecent({ success: true, matches: [], error: 'riot_unavailable', error_reason: 'rate_limited', partial: false })
    expect(down).toMatchObject({ error: 'riot_unavailable', errorReason: 'rate_limited', matches: [] })
    const none = normalizeLolRecent({ success: true, matches: [], error: null })
    expect(none.error).toBeNull()
  })

  it('falls back to a generic reason and ignores unknown values', () => {
    expect(normalizeLolRecent({ error: 'riot_unavailable', error_reason: 'weird' }).errorReason).toBe('riot_error')
    expect(normalizeLolRecent({ error: 'something_else', error_reason: 'rate_limited' })).toMatchObject({ error: null, errorReason: null })
    expect(normalizeLolRecent(null)).toEqual({ matches: [], error: null, errorReason: null, partial: false })
  })

  it('flags partial lists', () => {
    expect(normalizeLolRecent({ matches: [match], partial: true }).partial).toBe(true)
  })
})

describe('lolRecentErrorText', () => {
  it('says the reason in plain words, with no raw codes', () => {
    for (const reason of ['rate_limited', 'bad_key', 'riot_down', 'unreachable', 'not_configured', 'riot_error'] as const) {
      const text = lolRecentErrorText({ error: 'riot_unavailable', errorReason: reason })
      expect(text).not.toMatch(/_/)
      expect(text).toMatch(/try again/i)
    }
    expect(lolRecentErrorText({ error: 'riot_unavailable', errorReason: 'rate_limited' })).toContain('minute')
    expect(lolRecentErrorText({ error: 'request_failed', errorReason: null })).toContain('connection')
    expect(LOL_RECENT_ERROR_TITLE).toBe('Couldn’t reach Riot right now')
  })
})

describe('lolLoadout', () => {
  it('puts spells first, items in slot order without empties, and the trinket last', () => {
    const l = lolLoadout({ items: [3089, 0, 3020, 0, 0, 4645, 3340], summoner_spells: [4, 14] })!
    expect(l.spells.map(s => s.label)).toEqual(['Flash', 'Ignite'])
    expect(l.spells[0].src).toMatch(/\/img\/spell\/SummonerFlash\.png$/)
    expect(l.items.map(i => i.src.match(/item\/(\d+)\.png$/)![1])).toEqual(['3089', '3020', '4645'])
    expect(l.trinket?.src).toMatch(/item\/3340\.png$/)
  })

  it('leaves out unknown spells and returns null when nothing is known (older API)', () => {
    expect(lolLoadout({ items: [0, 0, 0, 0, 0, 0, 0], summoner_spells: [999, 0] })).toBeNull()
    expect(lolLoadout({})).toBeNull()
    expect(lolLoadout(null)).toBeNull()
    expect(lolLoadout({ items: [0, 0, 0, 0, 0, 0, 3364] })).toMatchObject({ items: [], spells: [] })
  })
})

describe('lolProfileIconId', () => {
  it('takes the first profile icon Riot sent, else null', () => {
    expect(lolProfileIconId([{ profile_icon_id: null }, { profile_icon_id: 5367 }])).toBe(5367)
    expect(lolProfileIconId([{}])).toBeNull()
    expect(lolProfileIconId(undefined)).toBeNull()
  })
})
