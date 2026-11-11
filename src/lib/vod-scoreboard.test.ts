import { describe, expect, it } from 'vitest'
import { resolveScoreboardPlayer, groupScoreboardPlayers, formatScoreboardStat, inferOwnTeamFromScore, resolveOwnTeam } from './vod-scoreboard'
import type { TeamPlayerSnapshot } from '../../electron/main/riot-types'

const players = [
  { summonerName: 'Ally', team: 'ORDER', puuid: null },
  { summonerName: 'RecordedPlayer', team: 'ORDER', puuid: null },
  { summonerName: 'Enemy', team: 'CHAOS', puuid: null },
] as TeamPlayerSnapshot[]

describe('recorded scoreboard identity', () => {
  it('resolves a legacy League recording with null PUUIDs without marking every player as You', () => {
    const own = resolveScoreboardPlayer(players, 'lol', null, 'RecordedPlayer')
    expect(own).toBe(players[1])
    expect(groupScoreboardPlayers(players, own).map(g => [g.label, g.players.length]))
      .toEqual([['Allies', 2], ['Enemies', 1]])
  })
  it('uses captured identity after account switches and does not guess from empty or duplicate names', () => {
    expect(resolveScoreboardPlayer(players, 'lol', 'current-account', null)).toBeNull()
    expect(resolveScoreboardPlayer([...players, players[1]!], 'lol', null, 'RecordedPlayer')).toBeNull()
    const captured = players.map((p, i) => ({ ...p, isLocalPlayer: i === 1 }))
    expect(resolveScoreboardPlayer(captured, 'lol', 'current-account', 'Enemy')).toBe(captured[1])
  })
  it('requires a nonempty matching PUUID for other games', () => {
    expect(resolveScoreboardPlayer(players, 'valorant', null, 'RecordedPlayer')).toBeNull()
    const roster = players.map((p, i) => ({ ...p, puuid: `p${i}` }))
    expect(resolveScoreboardPlayer(roster, 'valorant', 'p1', null)).toBe(roster[1])
  })
  it('keeps actual teams without guessing allies when local identity is unknown', () => {
    expect(groupScoreboardPlayers(players, null).map(g => [g.label, g.players.length]))
      .toEqual([['Team ORDER', 2], ['Team CHAOS', 1]])
  })
  it('distinguishes missing statistics from measured zero', () => {
    expect(formatScoreboardStat(undefined)).toBe('—')
    expect(formatScoreboardStat(null)).toBe('—')
    expect(formatScoreboardStat(NaN)).toBe('—')
    expect(formatScoreboardStat(0)).toBe('0')
    expect(formatScoreboardStat(14256)).toBe('14,256')
  })
})

describe('inferOwnTeamFromScore', () => {
  const rounds = [
    ...Array.from({ length: 13 }, () => ({ winningTeam: 'Blue' })),
    ...Array.from({ length: 3 }, () => ({ winningTeam: 'Red' })),
  ]
  it('picks the team whose round wins match the ally score', () => {
    expect(inferOwnTeamFromScore(rounds, { allyScore: 13, enemyScore: 3 })).toBe('Blue')
    expect(inferOwnTeamFromScore(rounds, { allyScore: 3, enemyScore: 13 })).toBe('Red')
  })
  it('gives up on a missing score, a draw or no exact match', () => {
    expect(inferOwnTeamFromScore(rounds, null)).toBeNull()
    expect(inferOwnTeamFromScore(rounds, { allyScore: 8, enemyScore: 8 })).toBeNull()
    expect(inferOwnTeamFromScore(rounds, { allyScore: 12, enemyScore: 4 })).toBeNull()
  })
})

describe('resolveScoreboardPlayer puuid case', () => {
  it('matches the recording player regardless of puuid case', () => {
    const players = [{ puuid: 'abc-DEF', team: 'Blue' }] as unknown as Parameters<typeof resolveScoreboardPlayer>[0]
    expect(resolveScoreboardPlayer(players, 'valorant', 'ABC-def', null)?.team).toBe('Blue')
  })
})

describe('resolveOwnTeam', () => {
  const rounds = [{ winningTeam: 'Blue' }, { winningTeam: 'Blue' }, { winningTeam: 'Red' }]
  it('uses the final-stats team when the scoreboard is empty and there is no score (real 13–3 upload)', () => {
    expect(resolveOwnTeam(null, 'Blue', rounds, null)).toBe('Blue')
  })
  it('prefers the scoreboard row, then falls back to the score', () => {
    expect(resolveOwnTeam('Red', 'Blue', rounds, null)).toBe('Red')
    expect(resolveOwnTeam(null, null, rounds, { allyScore: 1, enemyScore: 2 })).toBe('Red')
    expect(resolveOwnTeam(null, null, rounds, null)).toBeNull()
  })
})
