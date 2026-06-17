import { describe, expect, it } from 'vitest'
import { buildCoachingFacts } from './coaching-facts'
import type { MatchData } from './riot-types'

describe('buildCoachingFacts', () => {
  it('flags zero ultimate casts and ability kill events', () => {
    const timeline = {
      puuid: 'player-1',
      playerName: 'You',
      killEvents: [
        {
          EventID: 1,
          EventName: 'ChampionKill' as const,
          EventTime: 100,
          killerName: 'You',
          victimName: 'Enemy',
          assistants: [],
          killerPuuid: 'player-1',
          victimPuuid: 'enemy-1',
          round: 2,
          abilitySlot: 'ultimate' as const,
          weapon: 'Ultimate',
          videoOffsetMs: 120_000,
        },
      ],
      roundSummaries: [
        {
          roundNumber: 2,
          winningTeam: 'Blue',
          ceremony: null,
          endTime: 0,
          playerStats: { kills: 1, deaths: 0, assists: 0, score: 200 },
          spikePlanted: false,
          spikeSite: null,
          spikePlanter: null,
          spikeDefused: false,
          spikeDefuser: null,
          spikeDetonated: false,
          playerGold: null,
          playerAbilities: null,
          playerGotFirstBlood: false,
          playerWasFirstBlood: false,
          playerSpent: null,
          playerLoadoutValue: null,
          playerWeapon: null,
          playerArmor: null,
          playerDamageDealt: 180,
        },
      ],
      teamSnapshot: [
        {
          summonerName: 'You',
          agent: 'Fade',
          team: 'Blue',
          kills: 1,
          deaths: 0,
          assists: 0,
          score: 200,
          level: 100,
          puuid: 'player-1',
          competitiveTier: 12,
          competitiveTierName: 'Gold 3',
          abilityCasts: { grenade: 2, ability1: 3, ability2: 4, ultimate: 0 },
        },
      ],
    } as unknown as MatchData

    const facts = buildCoachingFacts(timeline)
    expect(facts.matchAbilityCasts?.ultimate).toBe(0)
    expect(facts.abilityKillEvents).toHaveLength(1)
    expect(facts.perRound[0]?.damageDealt).toBe(180)
  })
})
