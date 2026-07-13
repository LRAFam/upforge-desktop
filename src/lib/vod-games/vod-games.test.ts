import { describe, expect, it } from 'vitest'
import { getAgentImage } from '../valorant'
import { getChampionImage } from '../lol'
import {
  buildPlayerLookup,
  getVodAdapter,
  tagStripLower,
} from './index'

describe('getVodAdapter', () => {
  it('resolves each game and its round support', () => {
    expect(getVodAdapter('valorant').supportsRounds).toBe(true)
    expect(getVodAdapter('cs2').supportsRounds).toBe(true)
    expect(getVodAdapter('deadlock').supportsRounds).toBe(false)
    expect(getVodAdapter('lol').supportsRounds).toBe(false)
  })

  it('normalizes aliases and defaults to Valorant', () => {
    expect(getVodAdapter('counter-strike').id).toBe('cs2')
    expect(getVodAdapter('league_of_legends').id).toBe('lol')
    expect(getVodAdapter(null).id).toBe('valorant')
    expect(getVodAdapter('unknown-game').id).toBe('valorant')
  })

  it('exposes LoL as a continuous, non-spike timeline', () => {
    const lol = getVodAdapter('lol')
    expect(lol.timelineUnitLabel).toBe('Moment')
    expect(lol.extraEventKinds).toContain('dragon')
    expect(lol.extraEventKinds).not.toContain('plant')
  })
})

describe('tagStripLower', () => {
  it('strips the Riot #tag and lower-cases', () => {
    expect(tagStripLower('EnemyMid#EUW')).toBe('enemymid')
    expect(tagStripLower('  Ahri Main ')).toBe('ahri main')
    expect(tagStripLower(null)).toBe('')
  })
})

describe('buildPlayerLookup', () => {
  it('keys the roster by puuid and by tag-stripped name', () => {
    const lookup = buildPlayerLookup(
      [
        { summonerName: 'EnemyMid#EUW', agent: 'Zed', puuid: 'p-zed' },
        { summonerName: 'Support', agent: 'Thresh', puuid: null },
      ],
      'Jinx',
    )
    expect(lookup.byPuuid.get('p-zed')).toBe('Zed')
    expect(lookup.bySummonerName.get('enemymid')).toBe('Zed')
    expect(lookup.bySummonerName.get('support')).toBe('Thresh')
    expect(lookup.ownAgent).toBe('Jinx')
  })
})

describe('valorant/cs2 portrait resolution (by puuid)', () => {
  it('returns the agent image for a matched puuid', () => {
    const adapter = getVodAdapter('valorant')
    const lookup = buildPlayerLookup([{ puuid: 'p1', agent: 'Jett' }], null)
    expect(adapter.portraitImageFor({ puuid: 'p1' }, lookup)).toBe(getAgentImage('Jett'))
  })

  it('returns empty string when the puuid is unknown', () => {
    const adapter = getVodAdapter('valorant')
    const lookup = buildPlayerLookup([], null)
    expect(adapter.portraitImageFor({ puuid: 'missing' }, lookup)).toBe('')
  })
})

describe('lol portrait resolution (by name)', () => {
  it('uses the own champion for the local "You" player', () => {
    const adapter = getVodAdapter('lol')
    const lookup = buildPlayerLookup([], 'Jinx')
    expect(adapter.portraitImageFor({ name: 'You' }, lookup)).toBe(getChampionImage('Jinx'))
  })

  it('resolves other players by tag-stripped name', () => {
    const adapter = getVodAdapter('lol')
    const lookup = buildPlayerLookup([{ summonerName: 'EnemyMid#EUW', agent: 'Zed' }], 'Jinx')
    expect(adapter.portraitImageFor({ name: 'EnemyMid#EUW' }, lookup)).toBe(getChampionImage('Zed'))
    expect(adapter.portraitImageFor({ name: 'EnemyMid' }, lookup)).toBe(getChampionImage('Zed'))
  })

  it('returns empty string for an unknown champion', () => {
    const adapter = getVodAdapter('lol')
    const lookup = buildPlayerLookup([], null)
    expect(adapter.portraitImageFor({ name: 'Ghost' }, lookup)).toBe('')
  })
})
