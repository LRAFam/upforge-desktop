import { describe, expect, it } from 'vitest'
import {
  assignLolKillSpreeRounds,
  buildMatchDataFromLolSnapshot,
  isLolLiveMatchActive,
  normalizeLolGameMode,
  resolveLolMapName,
  type LolAllGameData,
} from './lol-live-client-api'
import type { KillEvent } from './riot-types'

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
    // Local player is tagged "You" so the VOD viewer can highlight their kills.
    expect(timeline.playerKills[0]?.killerName).toBe('You')
    expect(timeline.playerKills[0]?.victimName).toBe('EnemyMid')
  })

  it('translates the Live Client raw map codename to Summoner\'s Rift', () => {
    const timeline = buildMatchDataFromLolSnapshot(
      { ...SAMPLE_SNAPSHOT, gameData: { ...SAMPLE_SNAPSHOT.gameData!, mapName: 'Map11' } },
      { recordingStartTime: 1_700_000_000_000 },
    )
    expect(timeline.map).toBe("Summoner's Rift")
  })
})

describe('assignLolKillSpreeRounds', () => {
  function killAt(ms: number, killer = 'You'): KillEvent {
    return {
      EventName: 'ChampionKill',
      killerName: killer,
      victimName: 'Enemy',
      assistants: [],
      timeSinceGameStartMillis: ms,
    } as KillEvent
  }

  it('groups the player kills into time-proximity sprees', () => {
    // A triple (rapid), then a lone kill much later.
    const kills = [
      killAt(60_000),
      killAt(63_000),
      killAt(65_000),
      killAt(300_000),
      killAt(64_000, 'Teammate'), // not the player — should stay ungrouped
    ]
    assignLolKillSpreeRounds(kills)

    const mine = kills.filter((k) => k.killerName === 'You')
    // First three are one spree (round 0), the late kill is its own spree (round 1).
    expect(mine[0]?.round).toBe(0)
    expect(mine[1]?.round).toBe(0)
    expect(mine[2]?.round).toBe(0)
    expect(mine[3]?.round).toBe(1)
    // Non-player kill is untouched.
    expect(kills[4]?.round).toBeUndefined()
  })
})

describe('resolveLolMapName', () => {
  it('maps Riot codenames to readable names', () => {
    expect(resolveLolMapName('Map11')).toBe("Summoner's Rift")
    expect(resolveLolMapName('Map12')).toBe('Howling Abyss')
  })

  it('falls back to Summoner\'s Rift for unknown codenames', () => {
    expect(resolveLolMapName('Map99')).toBe("Summoner's Rift")
    expect(resolveLolMapName(null)).toBe("Summoner's Rift")
  })
})
