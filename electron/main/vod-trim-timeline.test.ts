import { describe, expect, it, vi } from 'vitest'
import { nudgeTimelineSyncOffset, recomputeTimelineVideoOffsets } from './riot-local-api'
import { applyVodTrimToTimeline } from './vod-trimmer'
import type { MatchData } from './riot-types'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))

const kill = (ms: number, id: string) => ({ timeSinceGameStartMillis: ms, killer: id, victim: `v-${id}` })

/** Game-clock times chosen so each game's pre-trim video offsets land at 3, 5, 8, 12, 15 and 18 s. */
function base(game: string, extra: Partial<MatchData>, toGame: (videoMs: number) => number): MatchData {
  const at = [3_000, 5_000, 8_000, 12_000, 15_000, 18_000]
  const kills = at.map((v) => kill(toGame(v), `k${v}`))
  return {
    game,
    matchStartTime: 1_000_000,
    recordingStartTime: 1_000_000,
    gameplayStartTime: null,
    startTime: 1_000_000,
    endTime: 1_060_000,
    killEvents: kills.map((k) => ({ ...k })),
    playerKills: kills.map((k) => ({ ...k })),
    playerDeaths: [],
    firstBloods: [],
    spikePlants: [],
    spikeDefuses: [],
    spikeDetonations: [],
    objectiveEvents: [],
    ...extra,
  } as unknown as MatchData
}

const offsets = (t: MatchData) => t.playerKills.map((k) => k.videoOffsetMs)
const ids = (t: MatchData) => t.playerKills.map((k) => (k as unknown as { killer: string }).killer)

const games: Array<[string, () => MatchData]> = [
  // The audited case: CS2 with a demo-measured shift (offset = game time + shift + nudge).
  ['CS2 with demo shift', () => base('cs2', { cs2DemoVideoShiftMs: 0, videoSyncOffsetMs: 0 }, (v) => v)],
  ['CS2 without demo shift', () => base('cs2', { videoSyncOffsetMs: 0 }, (v) => v)],
  ['Deadlock', () => base('deadlock', { videoSyncOffsetMs: 0, recordingStartTime: 1_002_000 }, (v) => v + 2_000)],
  ['LoL', () => base('lol', { videoSyncOffsetMs: 0, recordingStartTime: 1_004_000 }, (v) => v + 4_000)],
  ['Valorant with measured round-timer offset', () => base('valorant', { roundTimerOffsetMs: -10_000, videoSyncOffsetMs: -8_000 }, (v) => v + 10_000)],
  // No measurement: typical 10 s load estimate, default -8 s nudge → offset = game time + 2 s.
  ['Valorant estimated offset', () => base('valorant', { videoSyncOffsetMs: -8_000 }, (v) => v - 2_000)],
]

describe('applyVodTrimToTimeline: events follow the new file start', () => {
  for (const [name, make] of games) {
    it(`${name}: keeps [5 s, 15 s) and moves it to start at 0`, () => {
      const t = make()
      recomputeTimelineVideoOffsets(t)
      expect(offsets(t)).toEqual([3_000, 5_000, 8_000, 12_000, 15_000, 18_000])

      applyVodTrimToTimeline(t, { startSec: 5, endSec: 15 })
      expect(offsets(t)).toEqual([0, 3_000, 7_000])
      expect(ids(t)).toEqual(['k5000', 'k8000', 'k12000'])
      expect(t.killEvents.map((k) => k.videoOffsetMs)).toEqual([0, 3_000, 7_000])

      // A later recompute (app restart, review open) gives the same positions.
      recomputeTimelineVideoOffsets(t)
      expect(offsets(t)).toEqual([0, 3_000, 7_000])

      // Manual sync nudges still move events after a trim.
      nudgeTimelineSyncOffset(t, 500)
      expect(offsets(t)).toEqual([500, 3_500, 7_500])
    })

    it(`${name}: two trims equal one equivalent trim`, () => {
      const once = make()
      recomputeTimelineVideoOffsets(once)
      applyVodTrimToTimeline(once, { startSec: 5, endSec: 15 })
      const twice = make()
      recomputeTimelineVideoOffsets(twice)
      applyVodTrimToTimeline(twice, { startSec: 2, endSec: 16 })
      applyVodTrimToTimeline(twice, { startSec: 3, endSec: 13 })
      expect(offsets(twice)).toEqual(offsets(once))
      expect(ids(twice)).toEqual(ids(once))
      recomputeTimelineVideoOffsets(twice)
      expect(offsets(twice)).toEqual(offsets(once))
    })
  }

  it('keeps game-clock epochs and moves the file start epoch', () => {
    const t = games[0][1]()
    applyVodTrimToTimeline(t, { startSec: 5, endSec: 15 })
    expect(t.matchStartTime).toBe(1_000_000)
    expect(t.recordingStartTime).toBe(1_005_000)
    expect(t.endTime! - t.recordingStartTime).toBe(10_000)
  })

  it('moves objectives and spatial seek points with their events', () => {
    const t = games[2][1]()
    ;(t as unknown as { objectiveEvents: unknown[] }).objectiveEvents = [
      { timeSinceGameStartMillis: 3_000 + 2_000 }, { timeSinceGameStartMillis: 9_000 + 2_000 },
    ]
    ;(t as unknown as { spatialSummary: unknown }).spatialSummary = {
      events: offsets(t).map(() => ({ type: 'kill' })),
    }
    recomputeTimelineVideoOffsets(t)
    applyVodTrimToTimeline(t, { startSec: 5, endSec: 15 })
    expect((t.objectiveEvents ?? []).map((o) => o.videoOffsetMs)).toEqual([4_000])
    expect(t.spatialSummary!.events!.map((e) => e.videoOffsetMs)).toEqual([0, 3_000, 7_000])
  })
})
