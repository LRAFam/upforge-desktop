import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'

vi.mock('@laihoe/demoparser2', () => ({
  parseHeader: vi.fn(), parseEvent: vi.fn(), parsePlayerInfo: vi.fn(), parseTicks: vi.fn(() => []),
}))

import { parseEvent, parseHeader, parsePlayerInfo } from '@laihoe/demoparser2'
import { buildCs2TimelineFromDemo } from './cs2-demo-parser'
import { resetCs2IdentityState, setCs2SteamIdSaver, setKnownCs2Identity } from './cs2-identity-state'

const ME = '76561198000000001'
const ENEMY = '76561198000000002'

function demo(players: Array<{ name: string; steamid: string; team_number: number }>) {
  vi.mocked(parseHeader).mockReturnValue({ map_name: 'de_mirage', playback_ticks: 128000, playback_time: 2000 })
  vi.mocked(parsePlayerInfo).mockReturnValue(players)
  vi.mocked(parseEvent).mockImplementation((_p, name) => {
    if (name === 'round_start') return [{ tick: 0, total_rounds_played: 1 }]
    if (name === 'player_death') {
      return [{ tick: 6400, total_rounds_played: 1, attacker_name: players[0]!.name, attacker_steamid: ME, user_name: 'Enemy', user_steamid: ENEMY, weapon: 'ak47' }]
    }
    if (name === 'round_end') return [{ winner: 'CT', tick: 12800 }]
    return []
  })
}
const build = (localPlayerName: string | null) => buildCs2TimelineFromDemo({
  game: 'cs2', demoPath: '/tmp/m.dem', map: null, matchStartTime: 1_700_000_000_000,
  recordingStartTime: 1_700_000_000_000, localPlayerName, skipSpatial: true,
})

beforeEach(() => {
  resetCs2IdentityState()
  vi.spyOn(fs, 'existsSync').mockReturnValue(true)
})

describe('CS2 demo local player identity', () => {
  it('matches the saved Steam64 even when the player renamed', () => {
    setKnownCs2Identity(ME, 'api')
    demo([{ name: 'NewName', steamid: ME, team_number: 3 }, { name: 'Enemy', steamid: ENEMY, team_number: 2 }])
    const t = build('OldName')
    expect(t?.playerKills).toHaveLength(1)
    expect(t?.playerName).toBe('NewName')
  })

  it('saves the Steam64 after a confident name match when none is saved', () => {
    const save = vi.fn().mockResolvedValue(undefined)
    setCs2SteamIdSaver(save)
    setKnownCs2Identity(null, 'faceit')
    demo([{ name: 'Rook', steamid: ME, team_number: 3 }, { name: 'Enemy', steamid: ENEMY, team_number: 2 }])
    build('rook')
    expect(save).toHaveBeenCalledExactlyOnceWith(ME)
  })

  it('does not save from the account-name fallback', () => {
    const save = vi.fn().mockResolvedValue(undefined)
    setCs2SteamIdSaver(save)
    setKnownCs2Identity(null, 'account')
    demo([{ name: 'Rook', steamid: ME, team_number: 3 }, { name: 'Enemy', steamid: ENEMY, team_number: 2 }])
    build('Rook')
    expect(save).not.toHaveBeenCalled()
  })
})
