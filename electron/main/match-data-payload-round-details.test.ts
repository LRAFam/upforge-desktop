import { describe, expect, it, vi } from 'vitest'

vi.mock('./spatial/map-transforms', () => ({
  worldToNorm: () => ({ x: 0.5, y: 0.5 }),
}))

vi.mock('./riot-local-api', () => ({
  totalRecordingOffsetMs: () => 0,
  recomputeTimelineVideoOffsets: () => {},
  effectiveVideoSyncOffsetMs: () => 0,
}))

vi.mock('./match-plant-telemetry', () => ({
  logPlantCoordStats: () => {},
}))

import { slimRoundDetails } from './match-data-payload'

const raw = {
  roundResults: [
    {
      roundNum: 0, winningTeam: 'Blue',
      playerStats: [
        { subject: 'me', economy: { loadoutValue: 800, spent: 800, remaining: 0, weapon: 'x' },
          damage: [{ receiver: 'e1', damage: 156, headshots: 1, bodyshots: 2, legshots: 0 }], kills: [{}], ability: {} },
        { subject: 'e1', economy: { loadoutValue: 800, spent: 400, remaining: 400 }, damage: [] },
      ],
    },
    { roundNum: 1, winningTeam: 'Red', playerStats: [{ subject: 'me', damage: [{ receiver: 'e2', damage: 30, legshots: 2 }] }] },
  ],
}

describe('slimRoundDetails', () => {
  it('keeps hit regions and economy per round for every player', () => {
    const rounds = slimRoundDetails(raw)!
    expect(rounds).toHaveLength(2)
    expect(rounds[0]).toEqual({
      round: 0, winningTeam: 'Blue',
      players: [
        { subject: 'me', loadoutValue: 800, spent: 800, remaining: 0,
          damage: [{ receiver: 'e1', damage: 156, headshots: 1, bodyshots: 2, legshots: 0 }] },
        { subject: 'e1', loadoutValue: 800, spent: 400, remaining: 400, damage: [] },
      ],
    })
  })

  it('reports missing economy as null and missing hit counts as 0 (not invented)', () => {
    const r = slimRoundDetails(raw)![1].players[0]
    expect(r.loadoutValue).toBeNull()
    expect(r.damage[0]).toEqual({ receiver: 'e2', damage: 30, headshots: 0, bodyshots: 0, legshots: 2 })
  })

  it('returns undefined when Riot sent no rounds', () => {
    expect(slimRoundDetails({})).toBeUndefined()
    expect(slimRoundDetails({ roundResults: [] })).toBeUndefined()
    expect(slimRoundDetails(null)).toBeUndefined()
  })
})
