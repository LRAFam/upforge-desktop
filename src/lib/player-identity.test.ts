import { describe, expect, it } from 'vitest'
import { leagueProfileIcon, normaliseValorantRank, playerIdentity, valorantCardArt, valorantRankIcon, valorantTierIcon } from './player-identity'

const CARD = '9fb348bc-41a0-91ad-8a3e-818035c4e561'

describe('playerIdentity · Valorant', () => {
  it('uses the player card for avatar and banner, rank icon, level and title', () => {
    const id = playerIdentity({ name: 'LRAFam', playerCardId: CARD, agent: 'Jett', rank: 'Platinum 2', level: 212.4, title: ' Ace ' })
    expect(id.avatar).toEqual({ src: `https://media.valorant-api.com/playercards/${CARD}/smallart.png`, kind: 'card' })
    expect(id.avatars.map(a => a.kind)).toEqual(['card', 'agent'])
    expect(id.banner).toBe(`https://media.valorant-api.com/playercards/${CARD}/wideart.png`)
    expect(id.rankIcon).toMatch(/competitivetiers\/.+\/16\/smallicon\.png$/)
    expect(id.rankLabel).toBe('Platinum 2')
    expect(id.level).toBe(212)
    expect(id.title).toBe('Ace')
    expect(id.initial).toBe('L')
  })

  it('falls back to the agent portrait, then the letter', () => {
    expect(playerIdentity({ name: 'bo', agent: 'Omen' }).avatar?.kind).toBe('agent')
    expect(playerIdentity({ name: 'bo', agents: ['', 'Sova'] }).avatar?.src).toContain('/agents/')
    const none = playerIdentity({ name: 'bo' })
    expect(none.avatar).toBeNull()
    expect(none.avatars).toEqual([])
    expect(none.initial).toBe('B')
    expect(none.banner).toBeNull()
    expect(none.rankIcon).toBeNull()
    expect(none.rankLabel).toBeNull()
    expect(none.level).toBeNull()
    expect(none.title).toBeNull()
  })

  it('puts an uploaded https photo first and keeps the card as the next fallback', () => {
    const id = playerIdentity({ name: 'Coach', avatarUrl: 'https://upforge.gg/a.png', playerCardId: CARD, bannerUrl: 'https://upforge.gg/b.png' })
    expect(id.avatars.map(a => a.kind)).toEqual(['photo', 'card'])
    expect(id.banner).toBe('https://upforge.gg/b.png')
    expect(playerIdentity({ avatarUrl: 'http://x/a.png' }).avatar).toBeNull()
    expect(playerIdentity({ avatarUrl: 'javascript:alert(1)' }).avatar).toBeNull()
  })

  it('reads coach-typed ranks and numeric tiers', () => {
    expect(normaliseValorantRank('Immo 3')).toBe('Immortal 3')
    expect(normaliseValorantRank('Asc 1')).toBe('Ascendant 1')
    expect(normaliseValorantRank('immortal 3')).toBe('Immortal 3')
    expect(normaliseValorantRank('RADIANT')).toBe('Radiant')
    expect(normaliseValorantRank('Immortal')).toBe('Immortal')
    expect(normaliseValorantRank('Top 500')).toBeNull()
    expect(playerIdentity({ rank: 'Immo 3' }).rankIcon).toMatch(/\/26\/smallicon\.png$/)
    // No division: label yes, icon no (Immortal 1/2/3 icons differ — never guess).
    expect(playerIdentity({ rank: 'Immortal' })).toMatchObject({ rankLabel: 'Immortal', rankIcon: null })
    expect(playerIdentity({ rankTier: 27 }).rankIcon).toMatch(/\/27\/smallicon\.png$/)
    expect(playerIdentity({ rank: 'Unranked' }).rankLabel).toBeNull()
    expect(valorantRankIcon('Asc 1')).toMatch(/\/21\/smallicon\.png$/)
    expect(valorantRankIcon(null)).toBeNull()
    expect(valorantTierIcon(0)).toBeNull()
    expect(valorantTierIcon(28)).toBeNull()
  })

  it('rejects malformed card ids', () => {
    expect(valorantCardArt('not-a-uuid')).toBeNull()
    expect(valorantCardArt(null)).toBeNull()
    expect(valorantCardArt(CARD, 'large')).toContain('/largeart.png')
  })
})

describe('playerIdentity · other games', () => {
  it('League: profile icon and ranked emblem; no Valorant art', () => {
    const id = playerIdentity({ game: 'lol', name: 'Faker', profileIconId: 29, rank: 'GOLD II', level: 300, playerCardId: CARD, agent: 'Jett' })
    expect(id.avatar).toEqual({ src: leagueProfileIcon(29), kind: 'icon' })
    expect(id.avatars).toHaveLength(1)
    expect(id.banner).toBeNull()
    expect(id.rankIcon).toContain('emblem-gold.png')
    expect(id.rankLabel).toBe('GOLD II')
    expect(id.level).toBe(300)
    expect(playerIdentity({ game: 'league', rank: 'Unranked' })).toMatchObject({ rankIcon: null, rankLabel: null })
    expect(leagueProfileIcon(-1)).toBeNull()
  })

  it('CS2: FACEIT level badge first, Premier as a label, else Valve skill group', () => {
    const faceit = playerIdentity({ game: 'cs2', faceitLevel: 7, premierRating: 15230 })
    expect(faceit.rankLabel).toBe('FACEIT level 7')
    expect(faceit.rankIcon).toBeTruthy()
    expect(faceit.avatar).toBeNull()
    expect(playerIdentity({ game: 'cs2', premierRating: 15230 })).toMatchObject({ rankIcon: null, rankLabel: 'Premier 15,230' })
    expect(playerIdentity({ game: 'cs2', rank: 'Global Elite' }).rankIcon).toBeTruthy()
    expect(playerIdentity({ game: 'cs2' })).toMatchObject({ rankIcon: null, rankLabel: null })
  })

  it('Deadlock: bundled rank badge; no avatar art without data', () => {
    const id = playerIdentity({ game: 'deadlock', name: 'x', rank: 'Archon', rankSubtier: 4 })
    expect(id.rankIcon).toBeTruthy()
    expect(id.rankLabel).toBe('Archon')
    expect(id.avatar).toBeNull()
    expect(playerIdentity({ game: 'deadlock', rank: 'Nope' }).rankIcon).toBeNull()
  })

  it('handles null input', () => {
    const id = playerIdentity(null)
    expect(id).toMatchObject({ name: '', initial: '?', avatar: null, banner: null, rankIcon: null })
  })
})
