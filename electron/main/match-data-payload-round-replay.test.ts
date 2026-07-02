import { describe, expect, it, vi } from 'vitest'

vi.mock('./spatial/map-transforms', () => ({
  worldToNorm: () => ({ x: 0.5, y: 0.5 }),
}))

vi.mock('./riot-local-api', () => ({
  totalRecordingOffsetMs: () => 0,
  recomputeTimelineVideoOffsets: () => {},
  effectiveVideoSyncOffsetMs: () => 0,
}))

vi.mock('./match-plant-telemetry', () => ({
  logPlantCoordStats: () => {},
}))

import { prepareMatchDataForUpload } from './match-data-payload'
import type { MatchData } from './riot-types'

function timelineWithKills(): MatchData {
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
            { subject: 'own-puuid', location: { x: 90, y: 190 } },
            { subject: 'enemy-puuid', location: { x: 100, y: 200 } },
          ],
          finishingDamage: { damageType: 'Weapon', damageItem: 'Vandal' },
        },
      ],
      roundResults: [{ roundNum: 0, winningTeam: 'Blue' }],
      players: [
        { subject: 'own-puuid', gameName: 'You', characterId: 'add6443a-41bd-e414-f6ad-e58d267f4e95', teamId: 'Blue' },
        { subject: 'enemy-puuid', gameName: 'Enemy', characterId: '569fdd95-4d10-43ab-ca70-79becc718b46', teamId: 'Red' },
      ],
    },
  }
}

describe('prepareMatchDataForUpload roundReplay', () => {
  it('includes roundReplay on upload payload', () => {
    const upload = prepareMatchDataForUpload(timelineWithKills())
    expect(upload?.roundReplay?.rounds.length).toBeGreaterThan(0)
    expect(upload?.matchDetails).toBeUndefined()
  })
})
