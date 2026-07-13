import { describe, expect, it } from 'vitest'
import { assignKillSpreeRounds, ensureClipKillRounds } from './kill-clip-grouping'
import type { KillEvent, MatchData } from './riot-types'

function killAt(ms: number, killer = 'You'): KillEvent {
  return {
    EventName: 'ChampionKill',
    killerName: killer,
    victimName: 'Enemy',
    assistants: [],
    timeSinceGameStartMillis: ms,
  } as KillEvent
}

function lolTimeline(killEvents: KillEvent[]): MatchData {
  return {
    game: 'lol',
    killEvents,
    playerKills: killEvents.filter((k) => k.killerName === 'You'),
    playerDeaths: [],
  } as MatchData
}

describe('assignKillSpreeRounds', () => {
  it('groups player kills into time-proximity sprees', () => {
    const kills = [killAt(60_000), killAt(63_000), killAt(65_000), killAt(300_000)]
    assignKillSpreeRounds(kills)
    expect(kills[0]?.round).toBe(0)
    expect(kills[1]?.round).toBe(0)
    expect(kills[2]?.round).toBe(0)
    expect(kills[3]?.round).toBe(1)
  })
})

describe('ensureClipKillRounds', () => {
  it('assigns spree rounds for LoL timelines with ungrouped kills', () => {
    const timeline = lolTimeline([killAt(10_000), killAt(12_000), killAt(14_000)])
    ensureClipKillRounds(timeline)
    expect(timeline.killEvents![0]?.round).toBe(0)
    expect(timeline.killEvents![2]?.round).toBe(0)
  })

  it('skips round-based games', () => {
    const timeline = {
      game: 'valorant',
      killEvents: [killAt(10_000)],
    } as MatchData
    ensureClipKillRounds(timeline)
    expect(timeline.killEvents![0]?.round).toBeUndefined()
  })

  it('re-groups when all player kills share round -1', () => {
    const k1 = killAt(10_000)
    const k2 = killAt(12_000)
    const k3 = killAt(200_000)
    k1.round = -1
    k2.round = -1
    k3.round = -1
    const timeline = lolTimeline([k1, k2, k3])
    ensureClipKillRounds(timeline)
    expect(k1.round).toBe(0)
    expect(k2.round).toBe(0)
    expect(k3.round).toBe(1)
  })
})
