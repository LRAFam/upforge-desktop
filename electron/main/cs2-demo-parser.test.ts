import { describe, expect, it, vi, beforeEach } from 'vitest'
import fs from 'fs'

vi.mock('@laihoe/demoparser2', () => ({
  parseHeader: vi.fn(),
  parseEvent: vi.fn(),
  parsePlayerInfo: vi.fn(),
  parseTicks: vi.fn(() => []),
}))

import { parseEvent, parseHeader, parsePlayerInfo } from '@laihoe/demoparser2'
import { buildCs2TimelineFromDemo, peekCs2DemoHeader } from './cs2-demo-parser'

describe('peekCs2DemoHeader', () => {
  beforeEach(() => {
    vi.mocked(parseHeader).mockReset()
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
  })

  it('returns sanitized map and playback time', () => {
    vi.mocked(parseHeader).mockReturnValue({
      map_name: 'de_dust2',
      client_name: 'CHEWI',
      playback_time: 2400,
    })
    expect(peekCs2DemoHeader('/tmp/match.dem')).toEqual({
      mapName: 'de_dust2',
      clientName: 'CHEWI',
      playbackTime: 2400,
    })
  })
})

describe('buildCs2TimelineFromDemo', () => {
  beforeEach(() => {
    vi.mocked(parseHeader).mockReset()
    vi.mocked(parseEvent).mockReset()
    vi.mocked(parsePlayerInfo).mockReset()
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
  })

  it('builds kill timeline from demoparser2 events', () => {
    vi.mocked(parseHeader).mockReturnValue({
      map_name: 'de_mirage',
      playback_ticks: 128000,
      playback_time: 2000,
    })
    vi.mocked(parsePlayerInfo).mockReturnValue([
      { name: 'CHEWI', steamid: '76561198000000001', team_number: 3 },
      { name: 'Enemy', steamid: '76561198000000002', team_number: 2 },
    ])
    vi.mocked(parseEvent).mockImplementation((_path, eventName) => {
      if (eventName === 'round_start') {
        return [{ tick: 0, total_rounds_played: 1 }]
      }
      if (eventName === 'player_death') {
        return [{
          tick: 6400,
          total_rounds_played: 2,
          attacker_name: 'CHEWI',
          attacker_steamid: '76561198000000001',
          user_name: 'Enemy',
          user_steamid: '76561198000000002',
          weapon: 'ak47',
          headshot: true,
          user_X: 100,
          user_Y: 200,
        }]
      }
      if (eventName === 'round_end') {
        return [{ winner: 'CT', tick: 12800 }, { winner: 'T', tick: 19200 }, { winner: 'CT', tick: 25600 }]
      }
      return []
    })

    const timeline = buildCs2TimelineFromDemo({
      game: 'cs2',
      demoPath: '/tmp/match.dem',
      map: null,
      matchStartTime: 1_700_000_000_000,
      recordingStartTime: 1_700_000_000_000,
      localPlayerName: 'CHEWI',
      skipSpatial: true,
    })

    expect(timeline).not.toBeNull()
    expect(timeline?.map).toBe('de_mirage')
    expect(timeline?.killEvents).toHaveLength(1)
    expect(timeline?.playerKills).toHaveLength(1)
    expect(timeline?.playerKills?.[0]?.killerName).toBe('You')
    expect(timeline?.finalStats?.kills).toBe(1)
    expect(timeline?.matchDetails?.parser).toBe('demoparser2')
    expect(timeline?.killEvents?.[0]?.timeSinceGameStartMillis).toBeGreaterThan(0)
    expect(timeline?.firstBloods).toHaveLength(1)
    expect(timeline?.roundSummaries).toHaveLength(3)
    expect(timeline?.finalScore).toEqual({ allyScore: 2, enemyScore: 1 })
  })

  it('judges round winners against the local side of that round (half-time swap)', () => {
    vi.mocked(parseHeader).mockReturnValue({ map_name: 'de_mirage', playback_ticks: 128000, playback_time: 2000 })
    // playerInfo holds the end-of-match side (CT); the player was T in the first half.
    vi.mocked(parsePlayerInfo).mockReturnValue([
      { name: 'CHEWI', steamid: '76561198000000001', team_number: 3 },
      { name: 'Enemy', steamid: '76561198000000002', team_number: 2 },
    ])
    const kill = (tick: number, round: number, localSide: number) => ({
      tick,
      total_rounds_played: round,
      attacker_name: 'CHEWI',
      attacker_steamid: '76561198000000001',
      attacker_team_num: localSide,
      user_name: 'Enemy',
      user_steamid: '76561198000000002',
      user_team_num: localSide === 2 ? 3 : 2,
      weapon: 'ak47',
    })
    vi.mocked(parseEvent).mockImplementation((_path, eventName) => {
      if (eventName === 'round_start') return [{ tick: 0, total_rounds_played: 0 }]
      if (eventName === 'player_death') return [kill(6400, 0, 2), kill(16000, 1, 3)]
      if (eventName === 'round_end') return [{ winner: 'T', tick: 12800 }, { winner: 'CT', tick: 19200 }]
      return []
    })

    const timeline = buildCs2TimelineFromDemo({
      game: 'cs2',
      demoPath: '/tmp/match.dem',
      map: null,
      matchStartTime: 1_700_000_000_000,
      recordingStartTime: 1_700_000_000_000,
      localPlayerName: 'CHEWI',
      skipSpatial: true,
    })

    expect(timeline?.roundSummaries?.map((r) => r.winningTeam)).toEqual(['ALLY', 'ALLY'])
    expect(timeline?.finalScore).toEqual({ allyScore: 2, enemyScore: 0 })
  })

  it('keys round_end by round number across a restart and drops warmup bomb events', () => {
    vi.mocked(parseHeader).mockReturnValue({ map_name: 'de_mirage', playback_ticks: 128000, playback_time: 2000 })
    vi.mocked(parsePlayerInfo).mockReturnValue([{ name: 'CHEWI', steamid: '76561198000000001', team_number: 3 }])
    vi.mocked(parseEvent).mockImplementation((_path, eventName) => {
      // Round 0 played, then mp_restartgame: round 0 replayed, then round 1.
      if (eventName === 'round_start') {
        return [{ tick: 1000, total_rounds_played: 0 }, { tick: 5000, total_rounds_played: 0 }, { tick: 9000, total_rounds_played: 1 }]
      }
      if (eventName === 'round_end') {
        return [{ winner: 'T', tick: 4000 }, { winner: 'CT', tick: 8000 }, { winner: 'CT', tick: 12000 }]
      }
      if (eventName === 'bomb_planted') {
        return [{ tick: 500, total_rounds_played: 0, is_warmup_period: true, user_name: 'CHEWI' }]
      }
      return []
    })

    const timeline = buildCs2TimelineFromDemo({
      game: 'cs2',
      demoPath: '/tmp/match.dem',
      map: null,
      matchStartTime: 1_700_000_000_000,
      recordingStartTime: 1_700_000_000_000,
      localPlayerName: 'CHEWI',
      skipSpatial: true,
    })

    expect(timeline?.roundSummaries).toHaveLength(2)
    expect(timeline?.spikePlants).toHaveLength(0)
    expect(timeline?.matchDetails?.roundWinners?.get(0)).toBe(3)
    expect(timeline?.matchDetails?.roundWinners?.get(1)).toBe(3)
  })

  it('subtracts demo anchor tick from kill timestamps', () => {
    vi.mocked(parseHeader).mockReturnValue({
      map_name: 'de_dust2',
      playback_ticks: 128000,
      playback_time: 2000,
    })
    vi.mocked(parsePlayerInfo).mockReturnValue([])
    vi.mocked(parseEvent).mockImplementation((_path, eventName) => {
      if (eventName === 'round_start') {
        return [{ tick: 1600, total_rounds_played: 1 }]
      }
      if (eventName === 'player_death') {
        return [{
          tick: 8000,
          total_rounds_played: 1,
          attacker_name: 'CHEWI',
          attacker_steamid: '76561198000000001',
          user_name: 'Enemy',
          user_steamid: '76561198000000002',
          weapon: 'ak47',
        }]
      }
      if (eventName === 'round_end') {
        return [{ winner: 'CT', tick: 12000 }]
      }
      return []
    })

    const timeline = buildCs2TimelineFromDemo({
      game: 'cs2',
      demoPath: '/tmp/anchored.dem',
      map: null,
      matchStartTime: 1_000,
      recordingStartTime: 1_000,
      localPlayerName: 'CHEWI',
      skipSpatial: true,
    })

    expect(timeline?.matchDetails?.demoAnchorTick).toBe(1600)
    expect(timeline?.killEvents?.[0]?.timeSinceGameStartMillis).toBe(100_000)
  })

  it('anchors to round zero so first-round deaths retain their actual timestamps', () => {
    vi.mocked(parseHeader).mockReturnValue({
      map_name: 'de_cache', playback_ticks: 128000, playback_time: 2000,
    })
    vi.mocked(parsePlayerInfo).mockReturnValue([])
    vi.mocked(parseEvent).mockImplementation((_path, eventName) => {
      if (eventName === 'round_start') {
        return [
          { tick: 1600, total_rounds_played: 0 },
          { tick: 8000, total_rounds_played: 1 },
        ]
      }
      if (eventName === 'player_death') {
        return [3200, 4800, 9600].map((tick, index) => ({
          tick,
          total_rounds_played: index < 2 ? 0 : 1,
          attacker_name: 'Enemy', attacker_steamid: '76561198000000002',
          user_name: 'CHEWI', user_steamid: '76561198000000001', weapon: 'ak47',
        }))
      }
      if (eventName === 'round_end') return [{ winner: 'CT', tick: 7000 }]
      return []
    })

    const timeline = buildCs2TimelineFromDemo({
      game: 'cs2', demoPath: '/tmp/round-zero.dem', map: null,
      matchStartTime: 1_700_000_000_000, recordingStartTime: 1_700_000_000_000,
      localPlayerName: 'CHEWI', skipSpatial: true,
    })

    expect(timeline?.matchDetails?.demoAnchorTick).toBe(1600)
    expect(timeline?.playerDeaths.map(event => event.videoOffsetMs)).toEqual([25_000, 50_000, 125_000])
  })

  it('returns null when no events are found', () => {
    vi.mocked(parseHeader).mockReturnValue({ map_name: 'de_dust2' })
    vi.mocked(parsePlayerInfo).mockReturnValue([])
    vi.mocked(parseEvent).mockReturnValue([])

    const timeline = buildCs2TimelineFromDemo({
      game: 'cs2',
      demoPath: '/tmp/empty.dem',
      map: null,
      matchStartTime: null,
      recordingStartTime: 0,
      skipSpatial: true,
    })

    expect(timeline).toBeNull()
  })
})
