import { describe, expect, it } from 'vitest'
import {
  buildMatchDataFromLolSnapshot,
  isLolLiveMatchActive,
  normalizeLolGameMode,
  type LolAllGameData,
} from './lol-live-client-api'

const SAMPLE_SNAPSHOT: LolAllGameData = {
  activePlayer: {
    summonerName: 'TestPlayer',
    riotId: 'TestPlayer#EUW',
    level: 11,
  },
  allPlayers: [
    {
      summonerName: 'TestPlayer',
      riotId: 'TestPlayer#EUW',
      championName: 'Ahri',
      team: 'ORDER',
      scores: { kills: 3, deaths: 1, assists: 5, creepScore: 120 },
      level: 11,
    },
    {
      summonerName: 'EnemyMid',
      championName: 'Zed',
      team: 'CHAOS',
      scores: { kills: 2, deaths: 4, assists: 1, creepScore: 95 },
    },
  ],
  events: {
    Events: [
      {
        EventID: 1,
        EventName: 'ChampionKill',
        EventTime: 125.5,
        KillerName: 'TestPlayer',
        VictimName: 'EnemyMid',
        Assisters: [],
      },
    ],
  },
  gameData: {
    gameTime: 840,
    gameMode: 'CLASSIC',
    mapName: "Summoner's Rift",
    mapNumber: 11,
    gameId: 900000042,
  },
}

describe('normalizeLolGameMode', () => {
  it('maps CLASSIC to ranked solo label', () => {
    expect(normalizeLolGameMode('CLASSIC')).toBe('RANKED_SOLO')
  })

  it('passes through ARAM', () => {
    expect(normalizeLolGameMode('ARAM')).toBe('ARAM')
  })
})

describe('isLolLiveMatchActive', () => {
  it('returns true when players and game time are present', () => {
    expect(isLolLiveMatchActive(SAMPLE_SNAPSHOT)).toBe(true)
  })

  it('returns false when game data is missing', () => {
    expect(isLolLiveMatchActive({})).toBe(false)
  })
})

describe('buildMatchDataFromLolSnapshot', () => {
  it('builds lol MatchData with champion, KDA, and gameId', () => {
    const timeline = buildMatchDataFromLolSnapshot(SAMPLE_SNAPSHOT, {
      recordingStartTime: 1_700_000_000_000,
      matchStartTime: 1_699_999_500_000,
    })

    expect(timeline.game).toBe('lol')
    expect(timeline.matchId).toBe('900000042')
    expect(timeline.agent).toBe('Ahri')
    expect(timeline.playerName).toBe('TestPlayer')
    expect(timeline.playerTag).toBe('EUW')
    expect(timeline.finalStats?.kills).toBe(3)
    expect(timeline.finalStats?.deaths).toBe(1)
    expect(timeline.finalStats?.assists).toBe(5)
    expect(timeline.playerKills).toHaveLength(1)
    expect(timeline.playerKills[0]?.killerName).toBe('TestPlayer')
  })
})
