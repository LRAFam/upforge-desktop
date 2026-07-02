import { describe, expect, it, vi } from 'vitest'

vi.mock('./spatial/map-transforms', () => ({
  worldToNorm: () => ({ x: 0.5, y: 0.5 }),
}))

vi.mock('./riot-local-api', () => ({
  totalRecordingOffsetMs: () => 0,
}))

import { buildMatchRoundReplay } from './round-replay'
import type { MatchData } from './riot-types'

function baseMatch(overrides: Partial<MatchData> = {}): MatchData {
  return {
    game: 'valorant',
    map: 'Haven',
    agent: 'Jett',
    gameMode: 'COMPETITIVE',
    playerName: 'You',
    playerTag: 'NA1',
    puuid: 'own-puuid',
    events: [],
    killEvents: [],
    playerKills: [],
    playerDeaths: [],
    spikePlants: [],
    spikeDefuses: [],
    spikeDetonations: [],
    firstBloods: [],
    roundSummaries: [],
    finalStats: null,
    teamSnapshot: [
      {
        summonerName: 'You',
        agent: 'Jett',
        team: 'Blue',
        kills: 1,
        deaths: 0,
        assists: 0,
        score: 200,
        level: 100,
        puuid: 'own-puuid',
        competitiveTier: 12,
        competitiveTierName: 'Gold 1',
        abilityCasts: null,
      },
      {
        summonerName: 'Enemy',
        agent: 'Sage',
        team: 'Red',
        kills: 0,
        deaths: 1,
        assists: 0,
        score: 0,
        level: 100,
        puuid: 'enemy-puuid',
        competitiveTier: 12,
        competitiveTierName: 'Gold 1',
        abilityCasts: null,
      },
    ],
    startTime: Date.now(),
    endTime: Date.now(),
    recordingStartTime: 1_000_000,
    gameplayStartTime: 1_000_000,
    matchDetails: {
      kills: [
        {
          round: 0,
          gameTime: 45_000,
          roundTime: 12_000,
          timeSinceGameStartMillis: 45_000,
          killer: 'own-puuid',
          victim: 'enemy-puuid',
          victimLocation: { x: 100, y: 200 },
          playerLocations: [
            { subject: 'own-puuid', location: { x: 90, y: 190 }, viewRadians: 1.2 },
            { subject: 'enemy-puuid', location: { x: 100, y: 200 }, viewRadians: 3.4 },
          ],
          finishingDamage: { damageType: 'Weapon', damageItem: 'Vandal' },
        },
      ],
      roundResults: [
        {
          roundNum: 0,
          winningTeam: 'Blue',
          plantRoundTime: 0,
          defuseRoundTime: 0,
        },
      ],
      players: [
        { subject: 'own-puuid', gameName: 'You', characterId: 'add6443a-41bd-e414-f6ad-e58d267f4e95', teamId: 'Blue' },
        { subject: 'enemy-puuid', gameName: 'Enemy', characterId: '569fdd95-4d10-43ab-ca70-79becc718b46', teamId: 'Red' },
      ],
    },
    ...overrides,
  }
}

describe('buildMatchRoundReplay', () => {
  it('returns null without kills', () => {
    const match = baseMatch({ matchDetails: { kills: [] } })
    expect(buildMatchRoundReplay(match)).toBeNull()
  })

  it('builds kill keyframes with player positions', () => {
    const replay = buildMatchRoundReplay(baseMatch())
    expect(replay).not.toBeNull()
    expect(replay!.rounds).toHaveLength(1)
    expect(replay!.rounds[0]!.frames).toHaveLength(1)
    expect(replay!.rounds[0]!.frames[0]!.k).toBe('kill')
    expect(replay!.rounds[0]!.frames[0]!.p.length).toBeGreaterThanOrEqual(2)
  })
})
