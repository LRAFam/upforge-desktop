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
    matchId: 'match-1',
    region: 'eu',
    queueId: 'competitive',
    map: 'Haven',
    agent: 'Jett',
    gameMode: 'COMPETITIVE',
    playerName: 'You',
    playerTag: 'NA1',
    puuid: 'own-puuid',
    matchStartTime: 1_000_000,
    roundScores: [],
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
    expect(replay!.rounds[0]!.frames[0]!.p.find(p => p.i === 0)).toMatchObject({ alive: true, aliveSource: 'event_actor' })
    expect(replay!.rounds[0]!.frames[0]!.p.find(p => p.i === 1)).toMatchObject({ alive: false, aliveSource: 'event_victim' })
    expect(replay!.rounds[0]!.endMs).toBeNull()
  })

  it('does not apply a future death to a plant or infer other players life state', () => {
    const match = baseMatch()
    const raw = match.matchDetails!
    const kills = raw.kills as Array<Record<string, unknown>>
    kills.push({ ...kills[0], gameTime: 60_000, timeSinceGameStartMillis: 60_000, roundTime: 27_000,
      killer: 'enemy-puuid', victim: 'own-puuid' })
    raw.roundResults = [{ roundNum: 0, bombPlanter: 'own-puuid', plantRoundTime: 20_000,
      plantPlayerLocations: kills[0].playerLocations, plantLocation: { x: 100, y: 200 } }]
    const frames = buildMatchRoundReplay(match)!.rounds[0].frames
    expect(frames.map(f => f.k)).toEqual(['kill', 'plant', 'kill'])
    const plant = frames[1]
    expect(plant.p.find(p => p.i === 0)).toMatchObject({ alive: true, aliveSource: 'event_actor' })
    expect(plant.p.find(p => p.i === 1)).toMatchObject({ alive: null, aliveSource: 'unknown' })
  })

  it.each(['DEATHMATCH', 'TEAMDEATHMATCH', 'COMPETITIVE'])('handles later weapon kills after a death in %s without inventing a respawn time', (gameMode) => {
    const match = baseMatch({ gameMode })
    const kills = match.matchDetails!.kills as Array<Record<string, unknown>>
    kills.push({ ...kills[0], timeSinceGameStartMillis: 0, gameTime: 60_000, roundTime: 27_000,
      killer: 'enemy-puuid', victim: 'own-puuid' })
    const frames = buildMatchRoundReplay(match)!.rounds[0].frames
    expect(frames[1].t).toBe(60_000)
    expect(frames[1].p.find(p => p.i === 1)?.alive).toBe(true)
    expect(frames[1].p.find(p => p.i === 0)?.alive).toBe(false)
  })

  it('does not treat a posthumous ability kill as proof the killer is alive', () => {
    const match = baseMatch()
    const kill = (match.matchDetails!.kills as Array<Record<string, unknown>>)[0]
    kill.finishingDamage = { damageType: 'Ability', damageItem: 'Grenade' }
    expect(buildMatchRoundReplay(match)!.rounds[0].frames[0].p.find(p => p.i === 0)?.alive).toBeNull()
  })

  it('keeps objective time unknown when the round has no observed clock anchor', () => {
    const match = baseMatch()
    const locs = (match.matchDetails!.kills as Array<Record<string, unknown>>)[0].playerLocations
    match.matchDetails!.roundResults = [{ roundNum: 1, bombPlanter: 'own-puuid', plantRoundTime: 20_000, plantPlayerLocations: locs }]
    const round = buildMatchRoundReplay(match)!.rounds.find(r => r.r === 1)!
    expect(round.frames[0]).toMatchObject({ t: null, rt: 20_000 })
    expect(round.frames[0].v).toBeUndefined()
    expect(round.endMs).toBeNull()
  })
})
