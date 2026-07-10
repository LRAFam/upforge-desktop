import { describe, expect, it, vi, beforeEach } from 'vitest'
import fs from 'fs'

vi.mock('@laihoe/demoparser2', () => ({
  parseHeader: vi.fn(),
  parseEvent: vi.fn(),
  parsePlayerInfo: vi.fn(),
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
