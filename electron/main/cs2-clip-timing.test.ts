/**
 * Owner bug 2026-11-03 (v3.2.6, de_dust2): the round-19 4K clip was ~1 min long but showed only the
 * first kill. GSI calls warmup a live match, so matchStartTime is taken in warmup, while demo time
 * starts at the first round_start. Every demo event landed (warmup remainder) seconds too early.
 * See docs/debug/cs2-clip-timing-2026-11-03.md.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'

vi.mock('@laihoe/demoparser2', () => ({
  parseHeader: vi.fn(),
  parseEvent: vi.fn(),
  parsePlayerInfo: vi.fn(),
  parseTicks: vi.fn(() => []),
}))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => '/tmp' } }))

import { parseEvent, parseHeader, parsePlayerInfo } from '@laihoe/demoparser2'
import { buildCs2TimelineFromDemo } from './cs2-demo-parser'
import { estimateCs2DemoVideoShift } from './cs2-demo-video-sync'
import { recomputeTimelineVideoOffsets } from './riot-local-api'
import { combinedKillClipWindow } from './clip-timing'
import type { Cs2LiveSummary } from './cs2-gsi-timeline'

const TICK = 64
const ME = '76561198272284660'
const ENEMIES = ['76561190000000011', '76561190000000012', '76561190000000013', '76561190000000014', '76561190000000015']

// Wall clock (owner's Dust2 match): GSI saw "warmup" at 21:50:20.572 and OBS started 8.6 s later.
const MATCH_DETECTED = 1_793_742_620_572
const RECORDING_START = MATCH_DETECTED + 8_634
// Warmup still had 30 s to run: round one (demo anchor) starts here.
const ROUND_ONE_EPOCH = MATCH_DETECTED + 30_000
const ANCHOR_TICK = 65
/** GSI delivery lag (buffer 0.1 s + throttle up to 0.5 s). */
const GSI_LAG_MS = 300

const tickAt = (secFromAnchor: number) => ANCHOR_TICK + Math.round(secFromAnchor * TICK)
const epochAt = (secFromAnchor: number) => ROUND_ONE_EPOCH + Math.round(secFromAnchor * 1000)
const videoAt = (secFromAnchor: number) => epochAt(secFromAnchor) - RECORDING_START

// Rounds (seconds from the anchor). Round 2 (index 1): 4K at 12, 19, 31, 44 s after freeze end.
const ROUND_STARTS = [0, 110, 215, 320]
const FREEZE_MS = 15
const ROUND_ENDS = [100, 205, 310, 420]
const FOUR_K = [12, 19, 31, 44].map((s) => ROUND_STARTS[1]! + FREEZE_MS + s)

interface Death { sec: number; round: number; attacker: string; victim: string }
const DEATHS: Death[] = [
  { sec: 40, round: 0, attacker: ME, victim: ENEMIES[0]! },
  { sec: 52, round: 0, attacker: ENEMIES[1]!, victim: ME },
  ...FOUR_K.map((sec, i) => ({ sec, round: 1, attacker: ME, victim: ENEMIES[i]! })),
  { sec: 270, round: 2, attacker: ENEMIES[2]!, victim: ME },
  { sec: 350, round: 3, attacker: ME, victim: ENEMIES[3]! },
  { sec: 371, round: 3, attacker: ENEMIES[4]!, victim: ME },
]

function mockDemo() {
  vi.mocked(parseHeader).mockReturnValue({ map_name: 'de_dust2' }) // CS2 headers carry no playback_time → 64 tick
  vi.mocked(parsePlayerInfo).mockReturnValue([
    { name: 'LRAFam', steamid: ME, team_number: 2 },
    ...ENEMIES.map((steamid, i) => ({ name: `Enemy${i}`, steamid, team_number: 3 })),
  ])
  vi.mocked(parseEvent).mockImplementation((_path, eventName) => {
    if (eventName === 'round_start') return ROUND_STARTS.map((s, i) => ({ tick: tickAt(s), total_rounds_played: i }))
    if (eventName === 'round_freeze_end') return ROUND_STARTS.map((s, i) => ({ tick: tickAt(s + FREEZE_MS), total_rounds_played: i }))
    if (eventName === 'round_end') return ROUND_ENDS.map((s, i) => ({ tick: tickAt(s), winner: i % 2 ? 'CT' : 'T', reason: 9, total_rounds_played: i }))
    if (eventName === 'player_death') {
      return DEATHS.map((d) => ({
        tick: tickAt(d.sec),
        total_rounds_played: d.round,
        attacker_name: d.attacker === ME ? 'LRAFam' : 'Enemy',
        attacker_steamid: d.attacker,
        user_name: d.victim === ME ? 'LRAFam' : 'Enemy',
        user_steamid: d.victim,
        weapon: 'ak47',
      }))
    }
    return []
  })
}

/** What Cs2GsiTracker records live: recording-relative wall-clock positions. */
function liveSummary(): Cs2LiveSummary {
  const mine = DEATHS.filter((d) => d.attacker === ME || d.victim === ME)
  return {
    source: 'gsi',
    events: mine.map((d) => ({
      type: d.attacker === ME ? 'kill' as const : 'death' as const,
      round: d.round,
      videoOffsetMs: videoAt(d.sec) + GSI_LAG_MS,
    })),
    roundEnds: ROUND_ENDS.map((s, i) => ({ round: i, videoOffsetMs: videoAt(s) + GSI_LAG_MS })),
    rounds: [],
    stats: null,
    allyScore: null,
    enemyScore: null,
  }
}

function build(cs2Live: Cs2LiveSummary | null) {
  const timeline = buildCs2TimelineFromDemo({
    game: 'cs2',
    demoPath: '/tmp/dust2.dem',
    map: 'de_dust2',
    matchStartTime: MATCH_DETECTED,
    recordingStartTime: RECORDING_START,
    localPlayerName: 'LRAFam',
    skipSpatial: true,
    cs2Live,
  })!
  // buildTimelineFromDemo does this right after parsing.
  recomputeTimelineVideoOffsets(timeline)
  return timeline
}

describe('CS2 multi-kill clip covers every kill (demo → video alignment)', () => {
  beforeEach(() => {
    vi.mocked(parseHeader).mockReset()
    vi.mocked(parseEvent).mockReset()
    vi.mocked(parsePlayerInfo).mockReset()
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    mockDemo()
  })

  it('places the 4K clip around all four kills when GSI saw the match live', () => {
    const timeline = build(liveSummary())
    const fourK = timeline.playerKills.filter((k) => k.round === 1)
    expect(fourK).toHaveLength(4)

    const window = combinedKillClipWindow(fourK.map((k) => k.videoOffsetMs!), 'multikill')!
    for (const sec of FOUR_K) {
      const truth = videoAt(sec)
      expect(truth).toBeGreaterThanOrEqual(window.startMs + 5_000) // pre-roll before the first kill
      expect(truth).toBeLessThanOrEqual(window.startMs + window.durationMs - 10_000) // post-roll after the last
    }
    // Every demo event lands within GSI lag of the truth.
    for (const [i, k] of fourK.entries()) {
      expect(Math.abs(k.videoOffsetMs! - videoAt(FOUR_K[i]!))).toBeLessThanOrEqual(1_000)
    }
    expect(timeline.cs2Live).toBeTruthy()
  })

  it('keeps the shift through a later recompute (VOD nudge path)', () => {
    const timeline = build(liveSummary())
    const before = timeline.playerKills.map((k) => k.videoOffsetMs)
    recomputeTimelineVideoOffsets(timeline)
    expect(timeline.playerKills.map((k) => k.videoOffsetMs)).toEqual(before)
  })

  it('without GSI keeps the match-start estimate (documents the warmup error)', () => {
    const timeline = build(null)
    expect(timeline.cs2DemoVideoShiftMs).toBeUndefined()
    const k = timeline.playerKills.find((x) => x.round === 1)!
    // 30 s of warmup the estimate cannot see.
    expect(videoAt(FOUR_K[0]!) - k.videoOffsetMs!).toBe(30_000)
  })
})

describe('estimateCs2DemoVideoShift', () => {
  const demo = {
    playerKills: [10_000, 70_000, 75_000].map((t) => ({ timeSinceGameStartMillis: t })),
    playerDeaths: [90_000].map((t) => ({ timeSinceGameStartMillis: t })),
    roundSummaries: [{ endTime: 100 }, { endTime: 205 }],
  } as never

  it('ignores round numbers and outliers, and needs agreement', () => {
    const live: Cs2LiveSummary = {
      source: 'gsi',
      events: [
        { type: 'kill', round: 5, videoOffsetMs: 31_200 },
        { type: 'kill', round: 1, videoOffsetMs: 91_400 },
        { type: 'kill', round: 1, videoOffsetMs: 96_100 },
        { type: 'death', round: 1, videoOffsetMs: 111_300 },
        { type: 'kill', round: 2, videoOffsetMs: 400_000 }, // no demo partner
      ],
      roundEnds: [{ round: 0, videoOffsetMs: 121_300 }],
      rounds: [], stats: null, allyScore: null, enemyScore: null,
    }
    const sync = estimateCs2DemoVideoShift(demo, live)!
    expect(sync.pairs).toBe(5)
    expect(Math.abs(sync.shiftMs - 21_300)).toBeLessThanOrEqual(200)
  })

  it('returns null when too few points agree', () => {
    const live: Cs2LiveSummary = {
      source: 'gsi',
      events: [{ type: 'kill', round: 0, videoOffsetMs: 5_000 }, { type: 'death', round: 0, videoOffsetMs: 500_000 }],
      rounds: [], stats: null, allyScore: null, enemyScore: null,
    }
    expect(estimateCs2DemoVideoShift(demo, live)).toBeNull()
    expect(estimateCs2DemoVideoShift(demo, null)).toBeNull()
  })
})

describe('combinedKillClipWindow', () => {
  it('runs from pre-roll before the first kill to post-roll after the last', () => {
    expect(combinedKillClipWindow([60_000, 92_000], 'multikill')).toEqual({ startMs: 52_000, durationMs: 58_000 })
  })
  it('never cuts off the last kill of a long ace', () => {
    const w = combinedKillClipWindow([10_000, 130_000], 'ace')!
    expect(w.startMs + w.durationMs).toBeGreaterThanOrEqual(133_000)
  })
})
