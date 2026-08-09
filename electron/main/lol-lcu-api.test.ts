import { describe, expect, it } from 'vitest'
import {
  candidateLolLockfilePaths,
  normalizeLolQueueId,
  parseGameflowSession,
  parseLolLockfileContent,
  resolveLolFilterMode,
} from './lol-lcu-api'

describe('parseLolLockfileContent', () => {
  it('parses Name:PID:Port:Password:Protocol', () => {
    expect(parseLolLockfileContent('LeagueClient:1234:54321:abcSecret:https', 'C:\\lockfile')).toEqual({
      path: 'C:\\lockfile',
      port: 54321,
      password: 'abcSecret',
    })
  })

  it('rejects malformed content', () => {
    expect(parseLolLockfileContent('bad', 'x')).toBeNull()
  })
})

describe('normalizeLolQueueId', () => {
  it('maps ranked / aram / arena', () => {
    expect(normalizeLolQueueId(420)).toEqual({ gameMode: 'RANKED_SOLO', queueLabel: 'Ranked Solo/Duo' })
    expect(normalizeLolQueueId(450)).toEqual({ gameMode: 'ARAM', queueLabel: 'ARAM' })
    expect(normalizeLolQueueId(1700)).toEqual({ gameMode: 'ARENA', queueLabel: 'Arena' })
    expect(normalizeLolQueueId(400)).toEqual({ gameMode: 'NORMAL', queueLabel: 'Normal Draft' })
  })

  it('maps ARAM: Mayhem queues to ARAM', () => {
    expect(normalizeLolQueueId(2400)).toEqual({ gameMode: 'ARAM', queueLabel: 'ARAM: Mayhem' })
    expect(normalizeLolQueueId(2401).gameMode).toBe('ARAM')
    expect(normalizeLolQueueId(2405).gameMode).toBe('ARAM')
  })
})

describe('resolveLolFilterMode', () => {
  it('maps KIWI / Mayhem + Howling Abyss to ARAM', () => {
    expect(resolveLolFilterMode({ liveGameMode: 'KIWI', mapId: 12 })).toBe('ARAM')
    expect(resolveLolFilterMode({ queueId: 2400, liveGameMode: 'KIWI' })).toBe('ARAM')
    expect(resolveLolFilterMode({ queueId: 450 })).toBe('ARAM')
  })

  it('collapses ranked/normals to CLASSIC for settings filter', () => {
    expect(resolveLolFilterMode({ queueId: 420 })).toBe('CLASSIC')
    expect(resolveLolFilterMode({ queueId: 400 })).toBe('CLASSIC')
  })
})

describe('parseGameflowSession', () => {
  it('reads phase and queue from gameData', () => {
    expect(parseGameflowSession({
      phase: 'ChampSelect',
      gameData: { queue: { id: 420 }, map: { id: 11 } },
    })).toEqual({ phase: 'ChampSelect', queueId: 420, mapId: 11 })
  })
})

describe('candidateLolLockfilePaths', () => {
  it('includes Windows Riot Games paths', () => {
    const paths = candidateLolLockfilePaths('win32', {
      ProgramFiles: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    })
    expect(paths.some((p) => p.includes('League of Legends') && p.endsWith('lockfile'))).toBe(true)
  })
})
