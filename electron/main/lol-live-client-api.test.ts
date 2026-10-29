import { describe, expect, it, vi } from 'vitest'
import {
  assignLolKillSpreeRounds,
  buildLolObjectiveEvents,
  buildMatchDataFromLolSnapshot,
  isLolLiveMatchActive,
  normalizeLolGameMode,
  resolveLolMapName,
  type LolAllGameData,
  type LolLiveGameEvent,
  LoLLiveClientApi,
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

it('keeps the starting account after the client closes and resets it for the next match', async () => {
  vi.useFakeTimers()
  const api = new LoLLiveClientApi()
  try {
    vi.spyOn(api, 'fetchAllGameData').mockResolvedValue(SAMPLE_SNAPSHOT)
    api.start(1000, {
      account: { gameName: 'TestPlayer', tagLine: 'EUW', platform: 'EUW1' },
      matchId: 'EUW1_900000042', queueId: 420,
    })
    const ended = vi.fn(); api.onMatchEnded = ended
    await vi.advanceTimersByTimeAsync(1)
    vi.mocked(api.fetchAllGameData).mockResolvedValue(null)
    await vi.advanceTimersByTimeAsync(9000)
    expect(ended).toHaveBeenCalledOnce()
    const first = await api.stop()
    expect(first).toMatchObject({ lolAccount: { gameName: 'TestPlayer', platform: 'EUW1' }, matchId: 'EUW1_900000042', queueId: '420' })
    vi.mocked(api.fetchAllGameData).mockResolvedValue(SAMPLE_SNAPSHOT)
    api.start(2000)
    await vi.advanceTimersByTimeAsync(1)
    expect((await api.stop())?.lolAccount).toBeUndefined()
    expect(first?.lolAccount?.gameName).toBe('TestPlayer')
  } finally { api.cancel(); vi.useRealTimers(); vi.restoreAllMocks() }
})

it('ignores a previous match poll that finishes after account switching', async () => {
  vi.useFakeTimers()
  const api = new LoLLiveClientApi()
  let resolveOld!: (data: LolAllGameData) => void
  try {
    vi.spyOn(api, 'fetchAllGameData')
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
      .mockResolvedValue(SAMPLE_SNAPSHOT)
    api.start(1000)
    api.start(2000)
    await vi.advanceTimersByTimeAsync(1)
    resolveOld({ ...SAMPLE_SNAPSHOT, gameData: { ...SAMPLE_SNAPSHOT.gameData!, gameId: 99 } })
    await vi.advanceTimersByTimeAsync(1)
    expect((await api.stop())?.matchId).toBe('900000042')
  } finally { api.cancel(); vi.useRealTimers(); vi.restoreAllMocks() }
})

describe('normalizeLolGameMode', () => {
  it('keeps CLASSIC as Summoner\'s Rift (ranked + normals share one Live Client mode)', () => {
    expect(normalizeLolGameMode('CLASSIC')).toBe('CLASSIC')
  })

  it('passes through ARAM', () => {
    expect(normalizeLolGameMode('ARAM')).toBe('ARAM')
  })

  it('maps Cherry / Arena to ARENA', () => {
    expect(normalizeLolGameMode('CHERRY')).toBe('ARENA')
  })

  it('maps KIWI (ARAM variant) to ARAM', () => {
    expect(normalizeLolGameMode('KIWI')).toBe('ARAM')
  })
})

describe('isLolLiveMatchActive', () => {
  it('does not start another recording from a completed game still exposed by the client', () => {
    expect(isLolLiveMatchActive({ ...SAMPLE_SNAPSHOT, events: { Events: [
      { EventID: 99, EventName: 'GameEnd', EventTime: 840, Result: 'Win' },
    ] } })).toBe(false)
  })

  it('does not treat a loading-screen clock or invalid clock as gameplay', () => {
    for (const gameTime of [0, -1, Infinity, NaN]) {
      expect(isLolLiveMatchActive({ ...SAMPLE_SNAPSHOT, gameData: { ...SAMPLE_SNAPSHOT.gameData!, gameTime } })).toBe(false)
    }
  })
  it('returns true when players and game time are present', () => {
    expect(isLolLiveMatchActive(SAMPLE_SNAPSHOT)).toBe(true)
  })

  it('returns false when game data is missing', () => {
    expect(isLolLiveMatchActive({})).toBe(false)
  })
})

describe('buildMatchDataFromLolSnapshot', () => {
  it('keeps Riot tags distinct for kills, deaths and objectives', () => {
    const snapshot = structuredClone(SAMPLE_SNAPSHOT)
    snapshot.allPlayers![1] = { ...snapshot.allPlayers![1]!, summonerName: 'TestPlayer', riotId: 'TestPlayer#OTHER' }
    snapshot.events = { Events: [
      { EventID: 1, EventName: 'ChampionKill', EventTime: 10, KillerName: 'TestPlayer#OTHER', VictimName: 'TestPlayer#EUW' },
      { EventID: 2, EventName: 'ChampionKill', EventTime: 20, KillerName: 'TestPlayer#EUW', VictimName: 'TestPlayer#OTHER' },
      { EventID: 3, EventName: 'ChampionKill', EventTime: 30, KillerName: 'TestPlayer', VictimName: 'EnemyMid' },
      { EventID: 4, EventName: 'DragonKill', EventTime: 40, KillerName: 'TestPlayer#OTHER' },
    ] }
    const timeline = buildMatchDataFromLolSnapshot(snapshot, { recordingStartTime: 1000 })
    expect(timeline.playerKills.map(event => event.EventID)).toEqual([2])
    expect(timeline.playerDeaths.map(event => event.EventID)).toEqual([1])
    expect(timeline.killEvents[2]?.killerName).toBe('TestPlayer')
    expect(timeline.objectiveEvents?.[0]?.killerName).toBe('TestPlayer#OTHER')
  })

  it('does not substitute another Riot tag when the active account is absent', () => {
    const snapshot = structuredClone(SAMPLE_SNAPSHOT)
    snapshot.activePlayer!.riotId = 'TestPlayer#MISSING'
    const timeline = buildMatchDataFromLolSnapshot(snapshot, { recordingStartTime: 1000 })
    expect(timeline.agent).toBeNull()
    expect(timeline.lolLocalReview).toBeNull()
    expect(timeline.playerKills).toEqual([])
    expect(timeline.teamSnapshot.some(player => player.isLocalPlayer)).toBe(false)
  })

  it('accepts unique legacy tagless identity but rejects an ambiguous name', () => {
    const snapshot = structuredClone(SAMPLE_SNAPSHOT)
    snapshot.activePlayer = { summonerName: 'testplayer' }
    expect(buildMatchDataFromLolSnapshot(snapshot, { recordingStartTime: 1000 }).agent).toBe('Ahri')
    snapshot.allPlayers![1] = { ...snapshot.allPlayers![1]!, summonerName: 'TestPlayer', riotId: 'TestPlayer#OTHER' }
    expect(buildMatchDataFromLolSnapshot(snapshot, { recordingStartTime: 1000 }).agent).toBeNull()
  })

  it('does not treat an opponent literally named You as the recorded player', () => {
    const snapshot = structuredClone(SAMPLE_SNAPSHOT)
    snapshot.allPlayers![1]!.summonerName = 'You'
    snapshot.events = { Events: [{ EventID: 1, EventName: 'ChampionKill', EventTime: 10,
      KillerName: 'You', VictimName: 'TestPlayer#EUW' }] }
    const timeline = buildMatchDataFromLolSnapshot(snapshot, { recordingStartTime: 1000 })
    expect(timeline.playerKills).toEqual([])
    expect(timeline.playerDeaths).toHaveLength(1)
  })

  it('captures League scoreboard identity and measured stats without inventing damage', () => {
    const timeline = buildMatchDataFromLolSnapshot(SAMPLE_SNAPSHOT, { recordingStartTime: 1000 })
    expect(timeline.teamSnapshot.map(p => p.isLocalPlayer)).toEqual([true, false])
    expect(timeline.teamSnapshot[0]?.summonerName).toBe('TestPlayer#EUW')
    expect(timeline.finalStats?.summonerName).toBe('TestPlayer#EUW')
    expect(timeline.teamSnapshot.map(p => p.creepScore)).toEqual([120, 95])
    expect(timeline.teamSnapshot[0]?.damageDealt).toBeNull()
    expect(timeline.teamSnapshot[0]?.damageTaken).toBeNull()
    expect(timeline.teamSnapshot[0]?.visionScore).toBeNull()
  })

  it('does not assign the first player when local identity is absent', () => {
    const timeline = buildMatchDataFromLolSnapshot({ ...SAMPLE_SNAPSHOT, activePlayer: {} }, { recordingStartTime: 1000 })
    expect(timeline.agent).toBeNull()
    expect(timeline.teamSnapshot.some(p => p.isLocalPlayer)).toBe(false)
  })
  it('builds lol MatchData with champion, KDA, and gameId', () => {
    const timeline = buildMatchDataFromLolSnapshot(SAMPLE_SNAPSHOT, {
      recordingStartTime: 1_700_000_000_000,
      matchStartTime: 1_699_999_500_000,
    })

    expect(timeline.game).toBe('lol')
    expect(timeline.lolLocalReview).toEqual({
      source: 'live_client', version: 1, champion: 'Ahri', map: "Summoner's Rift",
      duration_seconds: 840, kills: 3, deaths: 1, assists: 5, cs: 120,
    })
    expect(timeline.matchId).toBe('900000042')
    expect(timeline.agent).toBe('Ahri')
    expect(timeline.playerName).toBe('TestPlayer')
    expect(timeline.playerTag).toBe('EUW')
    expect(timeline.finalStats?.kills).toBe(3)
    expect(timeline.finalStats?.deaths).toBe(1)
    expect(timeline.finalStats?.assists).toBe(5)
    expect(timeline.finalStats?.creepScore).toBe(120)
    expect(timeline.playerKills).toHaveLength(1)
    // Local player is tagged "You" so the VOD viewer can highlight their kills.
    expect(timeline.playerKills[0]?.killerName).toBe('You')
    expect(timeline.playerKills[0]?.victimName).toBe('EnemyMid')
  })

  it('anchors event videoOffsetMs to the in-game clock zero (loading gap added back)', () => {
    // Game clock zero was 30s after recording started (loading screen).
    const recordingStartTime = 1_700_000_000_000
    const gameClockZeroEpoch = recordingStartTime + 30_000
    const timeline = buildMatchDataFromLolSnapshot(SAMPLE_SNAPSHOT, {
      recordingStartTime,
      gameClockZeroEpoch,
    })
    // Event at 125.5s of game clock -> 125.5s + 30s loading = 155.5s into the VOD.
    expect(timeline.playerKills[0]?.videoOffsetMs).toBe(155_500)
    // Clock-zero epoch is stored as matchStartTime so recompute stays correct.
    expect(timeline.matchStartTime).toBe(gameClockZeroEpoch)
  })

  it('translates the Live Client raw map codename to Summoner\'s Rift', () => {
    const timeline = buildMatchDataFromLolSnapshot(
      { ...SAMPLE_SNAPSHOT, gameData: { ...SAMPLE_SNAPSHOT.gameData!, mapName: 'Map11' } },
      { recordingStartTime: 1_700_000_000_000 },
    )
    expect(timeline.map).toBe("Summoner's Rift")
  })

  it('maps GameEnd Result Win to timeline.win === true', () => {
    const snapshot: LolAllGameData = {
      ...SAMPLE_SNAPSHOT,
      events: {
        Events: [
          ...(SAMPLE_SNAPSHOT.events?.Events ?? []),
          { EventID: 2, EventName: 'GameEnd', EventTime: 840, Result: 'Win' },
        ],
      },
    }
    const timeline = buildMatchDataFromLolSnapshot(snapshot, {
      recordingStartTime: 1_700_000_000_000,
    })
    expect(timeline.win).toBe(true)
    expect(timeline.matchResult).toBe('win')
  })

  it('maps GameEnd WinningTeam for local ORDER team to a win', () => {
    const snapshot: LolAllGameData = {
      ...SAMPLE_SNAPSHOT,
      events: {
        Events: [
          ...(SAMPLE_SNAPSHOT.events?.Events ?? []),
          { EventID: 2, EventName: 'GameEnd', EventTime: 840, WinningTeam: 'ORDER' },
        ],
      },
    }
    const timeline = buildMatchDataFromLolSnapshot(snapshot, {
      recordingStartTime: 1_700_000_000_000,
    })
    expect(timeline.win).toBe(true)
    expect(timeline.matchResult).toBe('win')
  })
})

describe('assignLolKillSpreeRounds', () => {
  function killAt(ms: number, killer = 'You'): KillEvent {
    return {
      EventID: 0,
      EventName: 'ChampionKill',
      EventTime: ms / 1000,
      killerName: killer,
      victimName: 'Enemy',
      assistants: [],
      timeSinceGameStartMillis: ms,
    }
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

describe('buildLolObjectiveEvents', () => {
  const events: LolLiveGameEvent[] = [
    { EventID: 10, EventName: 'ChampionKill', EventTime: 60, KillerName: 'TestPlayer', VictimName: 'Zed' },
    { EventID: 11, EventName: 'DragonKill', EventTime: 300, KillerName: 'TestPlayer', DragonType: 'Fire', Stolen: 'False' },
    { EventID: 12, EventName: 'BaronKill', EventTime: 1500, KillerName: 'EnemyJgl', Stolen: 'True' },
    { EventID: 13, EventName: 'TurretKilled', EventTime: 500, KillerName: 'TestPlayer', TurretKilled: 'Turret_T1_C_07_A' },
    { EventID: 14, EventName: 'Multikill', EventTime: 62, KillerName: 'TestPlayer', KillStreak: 3 },
    { EventID: 15, EventName: 'Ace', EventTime: 610, Acer: 'TestPlayer', AcingTeam: 'ORDER' },
  ]

  const isLocal = (name: string): boolean => name === 'TestPlayer'

  it('extracts only objective/highlight events and skips kills', () => {
    const objectives = buildLolObjectiveEvents(events, {
      isLocal,
      gameClockZeroEpoch: 1_700_000_000_000,
      recordingStartTime: 1_700_000_000_000,
    })
    expect(objectives.map((o) => o.kind)).toEqual([
      'dragon', 'baron', 'tower', 'multikill', 'ace',
    ])
  })

  it('tags the local player as "You", parses stolen + detail, and anchors offsets', () => {
    const objectives = buildLolObjectiveEvents(events, {
      isLocal,
      gameClockZeroEpoch: 1_700_000_000_000,
      recordingStartTime: 1_700_000_000_000,
    })
    const dragon = objectives.find((o) => o.kind === 'dragon')!
    expect(dragon.killerName).toBe('You')
    expect(dragon.detail).toBe('Fire')
    expect(dragon.stolen).toBe(false)
    // 300s of game clock with zero loading gap -> 300s into the VOD.
    expect(dragon.videoOffsetMs).toBe(300_000)

    const baron = objectives.find((o) => o.kind === 'baron')!
    expect(baron.killerName).toBe('EnemyJgl')
    expect(baron.stolen).toBe(true)

    const multi = objectives.find((o) => o.kind === 'multikill')!
    expect(multi.detail).toBe('Triple Kill')

    const ace = objectives.find((o) => o.kind === 'ace')!
    expect(ace.killerName).toBe('You')
    expect(ace.team).toBe('ORDER')
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
