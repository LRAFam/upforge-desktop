import { describe, expect, it } from 'vitest'
import {
  TRADE_AFTER_DEATH_MS,
  countAlliesAliveAtDeath,
  deathWasTraded,
  farFromTeam,
  isUntradedDeath,
} from './trade-flags'

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
  })

  it('marks traded when ally kills nearby enemy (proximity fallback)', () => {
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
    expect(deathWasTraded(death, kills, allies)).toBe(true)
  })
})
