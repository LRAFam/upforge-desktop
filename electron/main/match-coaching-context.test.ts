import { describe, expect, it } from 'vitest'
import { buildTeamComp, buildRankSnapshot } from './match-coaching-context'
import type { MatchData } from './riot-types'

describe('match-coaching-context', () => {
  it('splits ally and enemy agents from team snapshot', () => {
    const timeline = {
      puuid: 'me',
      finalStats: { team: 'Blue' },
      teamSnapshot: [
        { puuid: 'me', agent: 'Jett', team: 'Blue' },
        { puuid: 'a2', agent: 'Sova', team: 'Blue' },
        { puuid: 'e1', agent: 'Reyna', team: 'Red' },
      ],
    } as unknown as MatchData

    const comp = buildTeamComp(timeline)
    expect(comp.allyAgents).toEqual(['Jett', 'Sova'])
    expect(comp.enemyAgents).toEqual(['Reyna'])
  })

  it('builds rank snapshot from team row and RR history', () => {
    const timeline = {
      puuid: 'me',
      teamSnapshot: [
        { puuid: 'me', competitiveTier: 12, competitiveTierName: 'Gold 3' },
      ],
    } as unknown as MatchData

    const snap = buildRankSnapshot(timeline, [{ rank: 'Gold 2', rr: 45, elo: 0 }])
    expect(snap?.competitiveTierName).toBe('Gold 3')
    expect(snap?.rr).toBe(45)
  })

  it('uses the captured League local-player flag when PUUIDs are missing', () => {
    const timeline = { game: 'lol', puuid: null, teamSnapshot: [
      { puuid: null, agent: 'Zed', team: 'CHAOS', isLocalPlayer: false },
      { puuid: null, agent: 'Ahri', team: 'ORDER', isLocalPlayer: true },
      { puuid: null, agent: 'Lux', team: 'ORDER', isLocalPlayer: false },
      { puuid: null, agent: 'Jax', team: 'UNKNOWN', isLocalPlayer: false },
    ] } as unknown as MatchData
    expect(buildTeamComp(timeline)).toEqual({ allyAgents: ['Ahri', 'Lux'], enemyAgents: ['Zed'] })
  })

  it('leaves team context empty when the recorded player cannot be identified', () => {
    const timeline = { game: 'lol', puuid: null, teamSnapshot: [
      { puuid: null, agent: 'Zed', team: 'CHAOS', isLocalPlayer: false },
      { puuid: null, agent: 'Ahri', team: 'ORDER', isLocalPlayer: false },
    ] } as unknown as MatchData
    expect(buildTeamComp(timeline)).toEqual({ allyAgents: [], enemyAgents: [] })
  })

  it('does not attach Valorant rank history to League coaching', () => {
    const timeline = { game: 'lol', puuid: null, teamSnapshot: [] } as unknown as MatchData
    expect(buildRankSnapshot(timeline, [{ rank: 'Gold 2', rr: 45, elo: 1200 }])).toBeNull()
  })
})
