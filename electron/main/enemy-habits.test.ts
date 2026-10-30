import { describe, expect, it, vi } from 'vitest'
vi.mock('./spatial/callout-resolver', () => ({ resolveCallout: () => ({ callout: 'Unknown' }) }))
import { computeEnemyHabits, MIN_REPEATS } from './enemy-habits'
import type { MatchRoundReplay } from './round-replay'

const player = (team: string) => ({ puuid: team + Math.random(), name: 'p', agent: null, team, nameSource: 'match_record' as const })
const players = [player('Blue'), player('Red'), player('Red')]
const kill = (actor: number, x: number) => ({
  t: null, rt: 0, k: 'kill' as const, actorIndex: actor,
  p: [{ i: actor, x, y: 0.5, world: { x: 0, y: 0 }, alive: true, aliveSource: 'event_actor' as const }],
})
const replay = (rounds: Array<Array<ReturnType<typeof kill>>>): MatchRoundReplay => ({
  schemaVersion: 2, positionSource: 'riot_event_snapshots', stateSemantics: 'after_event; null alive means unknown; no inferred respawns or resurrections',
  map: 'Bind', players, ownPlayerIndex: 0, rounds: rounds.map((frames, r) => ({ r, frames, endMs: null })),
})
const resolve = (_m: string, p: { x: number }) => ({ callout: p.x < 0.5 ? 'A Short' : 'B Long' })

describe('computeEnemyHabits', () => {
  it('counts enemy kills and opening kills by callout, ignoring your team', () => {
    const rounds = Array.from({ length: 4 }, () => [kill(1, 0.2), kill(0, 0.9), kill(2, 0.8)])
    const h = computeEnemyHabits(replay(rounds), resolve)!
    expect(h.enemyKills).toBe(8)
    expect(h.openingKills).toBe(4)
    expect(h.rows).toEqual([
      { callout: 'A Short', kills: 4, openingKills: 4 },
      { callout: 'B Long', kills: 4, openingKills: 0 },
    ])
  })
  it(`only reports callouts that repeat at least ${MIN_REPEATS} times`, () => {
    const h = computeEnemyHabits(replay([[kill(1, 0.2)], [kill(1, 0.2)]]), resolve)!
    expect(h.rows).toEqual([])
  })
  it('returns null without your player or replay', () => {
    expect(computeEnemyHabits(null, resolve)).toBeNull()
    expect(computeEnemyHabits({ ...replay([]), ownPlayerIndex: undefined }, resolve)).toBeNull()
  })
})
