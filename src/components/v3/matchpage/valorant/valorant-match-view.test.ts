import { describe, expect, it } from 'vitest'
import { buildValorantMatchView, buyBand, hasMeasured, reviewRoundFor, type ValorantTimelineLike } from './valorant-match-view'

const me = 'me-puuid'
function round(i: number, o: Partial<NonNullable<ValorantTimelineLike['roundSummaries']>[number]> = {}) {
  return { roundNumber: i, winningTeam: 'Blue', ceremony: 'Elimination', spikePlanted: false, playerStats: { kills: 1, deaths: 1 }, playerLoadoutValue: 4500, playerDamageDealt: 150, ...o }
}
const base = (o: Partial<ValorantTimelineLike> = {}): ValorantTimelineLike => ({
  game: 'valorant', gameMode: 'COMPETITIVE', puuid: me,
  teamSnapshot: [{ puuid: me, team: 'Blue' }],
  roundSummaries: [
    round(0, { playerLoadoutValue: 800, playerGotFirstBlood: true }),
    round(1, { winningTeam: 'Red', playerWasFirstBlood: true, playerLoadoutValue: 1200 }),
    round(2, { winningTeam: 'Red', playerWasFirstBlood: true, playerLoadoutValue: 3000, spikePlanted: true, spikeSite: 'A', ceremony: 'Detonate' }),
    round(3, { playerLoadoutValue: 4700 }),
  ],
  kills: [{ round: 0, weapon: 'Vandal' }, { round: 3, weapon: 'Vandal' }, { round: 3, weapon: 'Sheriff' }],
  ...o,
})

describe('buyBand', () => {
  it('uses the AI thresholds and competitive pistol rounds', () => {
    expect(buyBand(0, 800, 'COMPETITIVE')).toBe('pistol')
    expect(buyBand(12, 800, 'COMPETITIVE')).toBe('pistol')
    expect(buyBand(0, 800, 'UNRATED')).toBe('eco')
    expect(buyBand(3, 3900, 'COMPETITIVE')).toBe('full')
    expect(buyBand(3, 2000, 'COMPETITIVE')).toBe('half')
    expect(buyBand(3, 1999, 'COMPETITIVE')).toBe('eco')
    expect(buyBand(3, null, 'COMPETITIVE')).toBeNull()
  })
})

describe('buildValorantMatchView', () => {
  it('builds rounds, duels and economy from the timeline with whole numbers', () => {
    const v = buildValorantMatchView(base())!
    expect(v.roundRows.map(r => r.result)).toEqual(['won', 'lost', 'lost', 'won'])
    expect(v.roundRows[2]).toMatchObject({ plant: 'Planted A', ended: 'Spike detonated', opening: 'lost', buy: 'half' })
    expect(v.headline.find(h => h.label === 'Rounds won')?.value).toBe('2–2')
    expect(v.headline.find(h => h.label === 'ADR')?.value).toBe('150')
    expect(v.duels[0]).toEqual({ label: 'Opening duels won', value: '1 of 3' })
    expect(v.duels[1].value).toBe('1 of 1')
    expect(v.duels[2].value).toBe('0 of 2')
    expect(v.weapons[0]).toEqual({ label: 'Vandal', value: '2 kills' })
    expect(v.weapons[1]).toEqual({ label: 'Sheriff', value: '1 kill' })
    expect(v.economy.map(e => `${e.band}:${e.value}`)).toEqual(['pistol:Won 1 of 1', 'full:Won 1 of 1', 'half:Won 0 of 1', 'eco:Won 0 of 1'])
  })

  it('reads hit regions from matchDetails or the slim upload copy, own rows only', () => {
    const rows = [
      [{ subject: me, damage: [{ receiver: 'x', damage: 150, headshots: 1, bodyshots: 2, legshots: 1 }] }, { subject: 'other', damage: [{ receiver: me, headshots: 9 }] }],
      [{ subject: me, damage: [{ receiver: 'y', damage: 50, headshots: 0, bodyshots: 0, legshots: 0 }] }],
    ]
    const raw = buildValorantMatchView(base({ matchDetails: { roundResults: rows.map(p => ({ playerStats: p })) } }))!
    expect(raw.hits.map(h => `${h.label}:${h.value}`)).toEqual(['Head:25%', 'Body:50%', 'Legs:25%'])
    expect(raw.headline.find(h => h.label === 'Headshot share')?.value).toBe('25%')
    const lite = buildValorantMatchView(base({ matchDetailsLite: { rounds: rows.map(p => ({ players: p })) } }))!
    expect(lite.hits[0].value).toBe('25%')
  })

  it('says Not measured instead of 0 when data is missing', () => {
    const v = buildValorantMatchView(base({
      teamSnapshot: [], finalStats: null,
      roundSummaries: [round(0, { winningTeam: 'Blue', playerLoadoutValue: null, playerDamageDealt: null })],
    }))!
    expect(v.roundRows[0].result).toBe('unknown')
    expect(v.headline.find(h => h.label === 'Rounds won')?.value).toBe('Not measured')
    expect(v.headline.find(h => h.label === 'ADR')?.value).toBe('Not measured')
    expect(v.hits).toEqual([])
    expect(hasMeasured(v.duels.slice(1))).toBe(false)
  })

  it('accepts ALLY/ENEMY winners and ignores other games', () => {
    const v = buildValorantMatchView(base({ teamSnapshot: [], roundSummaries: [round(0, { winningTeam: 'ALLY' }), round(1, { winningTeam: 'ENEMY' })] }))!
    expect(v.roundRows.map(r => r.result)).toEqual(['won', 'lost'])
    expect(buildValorantMatchView({ ...base(), game: 'cs2' })).toBeNull()
    expect(buildValorantMatchView({ ...base(), roundSummaries: [] })).toBeNull()
  })
})

describe('reviewRoundFor', () => {
  it('picks the first lost round where you died first', () => {
    expect(reviewRoundFor(base())).toBe(1)
  })
  it('returns null when there is no such round', () => {
    expect(reviewRoundFor(base({ roundSummaries: [round(0, { playerGotFirstBlood: true })] }))).toBeNull()
  })
})
