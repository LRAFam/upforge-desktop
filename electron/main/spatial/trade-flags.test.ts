import { describe, expect, it } from 'vitest'
import {
  CS2_TRADE_AFTER_DEATH_MS,
  TRADE_AFTER_DEATH_MS,
  tradeWindowMs,
  countAlliesAliveAtDeath,
  deathWasTraded,
  farFromTeam,
  isUntradedDeath,
  tradesMeasurable,
} from './trade-flags'
import goldenJson from '../__fixtures__/trade-rule-golden.json'

describe('trade flags', () => {
  const allies = new Set(['player', 'ally1', 'ally2'])

  it('counts living allies before removing the victim', () => {
    const events = [
      { victimPuuid: 'ally1', videoOffsetMs: 1000, round: 0 },
      { victimPuuid: 'player', videoOffsetMs: 2000, round: 0 },
    ]
    expect(countAlliesAliveAtDeath(events, 1, 'player', allies)).toBe(1)
  })

  it('last alive => alliesAlive 0', () => {
    const events = [
      { victimPuuid: 'ally1', videoOffsetMs: 1000, round: 0 },
      { victimPuuid: 'ally2', videoOffsetMs: 1500, round: 0 },
      { victimPuuid: 'player', videoOffsetMs: 2000, round: 0 },
    ]
    expect(countAlliesAliveAtDeath(events, 2, 'player', allies)).toBe(0)
  })

  it('marks traded when ally kills the killer within 3s', () => {
    const death = {
      videoOffsetMs: 5000,
      round: 0,
      killerPuuid: 'enemy1',
    }
    const kills = [
      {
        videoOffsetMs: 6500,
        round: 0,
        killerPuuid: 'ally1',
        victimPuuid: 'enemy1',
      },
    ]
    expect(deathWasTraded(death, kills, allies)).toBe(true)
  })

  it('does not mark traded after TRADE_AFTER_DEATH_MS', () => {
    const death = {
      videoOffsetMs: 5000,
      round: 0,
      killerPuuid: 'enemy1',
    }
    const kills = [
      {
        videoOffsetMs: 5000 + TRADE_AFTER_DEATH_MS + 1,
        round: 0,
        killerPuuid: 'ally1',
        victimPuuid: 'enemy1',
      },
    ]
    expect(deathWasTraded(death, kills, allies)).toBe(false)
  })

  it('farFromTeam requires alliesAlive >= 1', () => {
    expect(farFromTeam({ alliesNearby: 0, alliesAlive: 0, traded: false })).toBe(false)
    expect(farFromTeam({ alliesNearby: 0, alliesAlive: 2, traded: true })).toBe(true)
  })

  it('untraded requires alliesAlive >= 1 and !traded', () => {
    expect(isUntradedDeath({ alliesNearby: 0, alliesAlive: 0, traded: false })).toBe(false)
    expect(isUntradedDeath({ alliesNearby: 0, alliesAlive: 1, traded: false })).toBe(true)
    expect(isUntradedDeath({ alliesNearby: 0, alliesAlive: 1, traded: true })).toBe(false)
    // Trade not measured: unknown, never "untraded".
    expect(isUntradedDeath({ alliesNearby: 0, alliesAlive: 1 })).toBe(false)
  })

  it('does not mark traded when an ally kills a different enemy near the body (no radius shortcut)', () => {
    const death = {
      videoOffsetMs: 5000,
      round: 0,
      killerPuuid: 'enemy1',
      spatial: { victimWorld: { x: 0, y: 0 } },
    }
    const kills = [
      {
        videoOffsetMs: 6200,
        round: 0,
        killerPuuid: 'ally1',
        victimPuuid: 'enemy2',
        spatial: { victimWorld: { x: 500, y: 0 } },
      },
    ]
    expect(deathWasTraded(death, kills, allies)).toBe(false)
  })

  it('treats trades as unmeasured when the kill list only has the player\'s own events', () => {
    const ownOnly = [
      { killerPuuid: 'enemy1', victimPuuid: 'player' },
      { killerPuuid: 'player', victimPuuid: 'enemy2' },
    ]
    expect(tradesMeasurable(ownOnly, 'player', allies)).toBe(false)
    expect(tradesMeasurable([...ownOnly, { killerPuuid: 'ally1', victimPuuid: 'enemy1' }], 'player', allies)).toBe(true)
    expect(tradesMeasurable([{ killerPuuid: 'ally1', victimPuuid: 'enemy1' }], 'player', new Set(['player']))).toBe(false)
  })
})

describe('trade window per game', () => {
  const allies = new Set(['player', 'ally1'])
  const death = { victimPuuid: 'player', killerPuuid: 'enemy1', videoOffsetMs: 10_000, round: 2 }
  const lateTrade = [{ killerPuuid: 'ally1', victimPuuid: 'enemy1', videoOffsetMs: 14_500, round: 2 }]

  it('keeps Valorant at 3 s and uses 5 s for CS2', () => {
    expect(TRADE_AFTER_DEATH_MS).toBe(3000)
    expect(CS2_TRADE_AFTER_DEATH_MS).toBe(5000)
    expect(tradeWindowMs('valorant')).toBe(3000)
    expect(tradeWindowMs('cs2')).toBe(5000)
  })

  it('judges a 4.5 s trade by the game window', () => {
    expect(deathWasTraded(death, lateTrade, allies)).toBe(false)
    expect(deathWasTraded(death, lateTrade, allies, tradeWindowMs('cs2'))).toBe(true)
  })
})

// Shared cross-repo golden (same file in upforge-frontend and upforge-api tests), generated from the
// AI service branch card-56-210-trade-claims (services/trade_claims.py). All repos give identical counts.
type GoldenCase = {
  id: string
  own: string
  teams: Record<string, string>
  kills: Array<[number, number, string, string]>
  expect: { traded: number[]; untraded: number[]; last_alive: number[] }
}
const golden = goldenJson as unknown as { rule: { valorant_window_ms: number }; cases: GoldenCase[] }

describe('shared trade golden (AI service card-56-210)', () => {
  it('uses the AI service window', () => {
    expect(TRADE_AFTER_DEATH_MS).toBe(golden.rule.valorant_window_ms)
  })

  for (const c of golden.cases) {
    it(c.id, () => {
      const team = c.teams[c.own]
      const allyPuids = new Set(Object.keys(c.teams).filter(p => c.teams[p] === team))
      const events = c.kills.map(([round, t, killerPuuid, victimPuuid]) => ({
        round, videoOffsetMs: t, killerPuuid, victimPuuid,
        // Positions next to the body: a radius shortcut would wrongly call these trades.
        spatial: { victimWorld: { x: 0, y: 0 } },
      }))
      const got = { traded: [] as number[], untraded: [] as number[], last_alive: [] as number[] }
      for (const death of events.filter(e => e.victimPuuid === c.own)) {
        const sameRound = events.filter(e => e.round === death.round)
        const alive = countAlliesAliveAtDeath(sameRound, sameRound.indexOf(death), c.own, allyPuids)
        const spatial = { alliesAlive: alive, traded: deathWasTraded(death, events, allyPuids) }
        const n = death.round + 1
        if (alive === 0) got.last_alive.push(n)
        else if (isUntradedDeath(spatial)) got.untraded.push(n)
        else if (spatial.traded) got.traded.push(n)
      }
      expect(got).toEqual(c.expect)
    })
  }
})
