import { describe, expect, it } from 'vitest'
import { mapDisplayName, modeDisplayName, titleBarGames } from './display-names'

describe('mapDisplayName', () => {
  it('turns raw CS2 map ids into display names', () => {
    expect(mapDisplayName('cs2', 'de_vertigo')).toBe('Vertigo')
    expect(mapDisplayName('cs2', 'DE_VERTIGO')).toBe('Vertigo')
    expect(mapDisplayName('cs2', 'De_vertigo')).toBe('Vertigo')
    expect(mapDisplayName('cs2', 'de_dust2')).toBe('Dust II')
    expect(mapDisplayName('cs2', 'de_mirage')).toBe('Mirage')
    expect(mapDisplayName('cs2', 'cs_office')).toBe('Office')
    expect(mapDisplayName('cs2', 'maps/de_vertigo.bsp')).toBe('Vertigo')
  })

  it('strips the prefix from unknown CS2 maps', () => {
    expect(mapDisplayName('cs2', 'de_new_map')).toBe('New Map')
  })

  it('reads a de_/cs_ prefix as CS2 when the game is unknown', () => {
    expect(mapDisplayName(null, 'de_vertigo')).toBe('Vertigo')
    expect(mapDisplayName('valorant', 'DE_ANCIENT')).toBe('Ancient')
  })

  it('keeps Valorant names and resolves codenames', () => {
    expect(mapDisplayName('valorant', 'Ascent')).toBe('Ascent')
    expect(mapDisplayName('valorant', 'Duality')).toBe('Bind')
    expect(mapDisplayName('valorant', 'range')).toBe('The Range')
  })

  it('keeps proper names for other games and tidies raw ids', () => {
    expect(mapDisplayName('lol', "Summoner's Rift")).toBe("Summoner's Rift")
    expect(mapDisplayName('deadlock', 'street_test')).toBe('Street Test')
  })

  it('returns empty for missing input', () => {
    expect(mapDisplayName('cs2', null)).toBe('')
    expect(mapDisplayName('cs2', '  ')).toBe('')
  })
})

describe('modeDisplayName', () => {
  it('keeps acronyms upper-case', () => {
    expect(modeDisplayName('cs2', 'CS2 VOD')).toBe('CS2 VOD')
    expect(modeDisplayName('cs2', 'cs2_vod')).toBe('CS2 VOD')
    expect(modeDisplayName('cs2', 'CS2 FACEIT')).toBe('CS2 FACEIT')
    expect(modeDisplayName('lol', 'ARAM')).toBe('ARAM')
  })
  it('uses the Valorant queue labels for Valorant', () => {
    expect(modeDisplayName('valorant', 'competitive')).toBe('Competitive')
  })
  it('returns empty for missing input', () => {
    expect(modeDisplayName('cs2', undefined)).toBe('')
  })
})

describe('titleBarGames', () => {
  it('lists the four games with a logo and the v3 accent token', () => {
    const games = titleBarGames()
    expect(games.map(g => g.id)).toEqual(['valorant', 'cs2', 'deadlock', 'lol'])
    expect(games.map(g => g.name)).toEqual(['Valorant', 'CS2', 'Deadlock', 'League'])
    for (const g of games) {
      expect(g.logo).toBeTruthy()
      expect(g.accent).toBe(`var(--uf-game-${g.id})`)
    }
  })
})
