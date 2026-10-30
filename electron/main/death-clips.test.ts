import { describe, expect, it } from 'vitest'
import { MAX_DEATH_CLIPS_PER_MATCH, pickDeathClips } from './death-clips'
import type { KillEvent } from './riot-types'

let id = 0
const ev = (round: number, t: number, opts: Partial<KillEvent> = {}): KillEvent => ({
  EventID: ++id, EventName: 'ChampionKill', EventTime: null, killerName: 'x', victimName: 'y', assistants: [],
  round, timeSinceGameStartMillis: t, videoOffsetMs: t + 5000, ...opts,
})

describe('pickDeathClips', () => {
  it('puts opening deaths first, then the rest in match order', () => {
    const d1 = ev(0, 40_000) // not first in round 0
    const d2 = ev(1, 110_000) // first kill of round 1 → opening
    const other = ev(0, 20_000)
    const r = pickDeathClips({ playerDeaths: [d1, d2], killEvents: [other, d1, d2] })
    expect(r.map(p => [p.death.EventID, p.opening])).toEqual([[d2.EventID, true], [d1.EventID, false]])
  })

  it('never returns more than the per-match cap', () => {
    const deaths = Array.from({ length: 12 }, (_, i) => ev(i, i * 100_000))
    expect(pickDeathClips({ playerDeaths: deaths, killEvents: deaths })).toHaveLength(MAX_DEATH_CLIPS_PER_MATCH)
    expect(pickDeathClips({ playerDeaths: deaths, killEvents: deaths }, { cap: 50 })).toHaveLength(MAX_DEATH_CLIPS_PER_MATCH)
  })

  it('skips deaths without a video offset and excluded rounds', () => {
    const noVideo = ev(0, 1000, { videoOffsetMs: undefined })
    const excluded = ev(2, 300_000)
    const kept = ev(3, 400_000)
    const r = pickDeathClips({ playerDeaths: [noVideo, excluded, kept], killEvents: [] }, { excludeRounds: new Set([2]) })
    expect(r.map(p => p.death.EventID)).toEqual([kept.EventID])
  })

  it('returns nothing for an empty or missing timeline', () => {
    expect(pickDeathClips(null)).toEqual([])
    expect(pickDeathClips({ playerDeaths: [], killEvents: [] })).toEqual([])
  })
})
