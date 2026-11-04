/**
 * Align CS2 demo time to the local recording using what GSI saw live.
 *
 * Demo times are measured from the first round_start (see cs2-demo-parser demo anchor). The old
 * mapping assumed that moment equals `matchStartTime`, the wall clock when GSI first reported a
 * match. GSI reports `warmup` as a live match, so detection usually fires during warmup and every
 * demo event landed 15–40 s too early in the video (owner logs 2026-11-03: Nuke ≈35 s, Dust2 ≈17 s).
 * A multi-kill clip cut from those offsets ends before most of the kills happen.
 *
 * GSI events carry wall-clock positions in the recording (`videoOffsetMs`, about +0.1…0.6 s of
 * delivery lag). Pair them with the same kind of demo event and take the shift most pairs agree on:
 *   videoOffsetMs = demoTimeMs + shiftMs
 * Pairing does not trust round numbers (GSI and the demo can disagree by one around round end).
 */
import type { Cs2LiveSummary } from './cs2-gsi-timeline'
import type { MatchData } from './riot-types'

/** Two points belong to the same event when their shifts agree within this. */
export const CS2_SYNC_TOLERANCE_MS = 1_500
/** Fewest agreeing pairs before we trust the measured shift over the match-start guess. */
export const CS2_SYNC_MIN_PAIRS = 3
/** Share of the live points that must agree (guards against chance matches). */
export const CS2_SYNC_MIN_SHARE = 0.4

export interface Cs2DemoVideoSync {
  /** Add to demo time (ms from the demo anchor) to get the position in the recording. */
  shiftMs: number
  pairs: number
  livePoints: number
}

type Kind = 'kill' | 'death' | 'round_end'

function demoPoints(timeline: Pick<MatchData, 'playerKills' | 'playerDeaths' | 'roundSummaries'>): Record<Kind, number[]> {
  const times = (rows: Array<{ timeSinceGameStartMillis?: number }> | undefined) =>
    (rows ?? []).map((r) => r.timeSinceGameStartMillis).filter((t): t is number => typeof t === 'number' && Number.isFinite(t))
  return {
    kill: times(timeline.playerKills),
    death: times(timeline.playerDeaths),
    round_end: (timeline.roundSummaries ?? [])
      .map((r) => (typeof r.endTime === 'number' && r.endTime > 0 ? Math.round(r.endTime * 1000) : null))
      .filter((t): t is number => t != null),
  }
}

function livePoints(live: Cs2LiveSummary): Record<Kind, number[]> {
  return {
    kill: live.events.filter((e) => e.type === 'kill').map((e) => e.videoOffsetMs),
    death: live.events.filter((e) => e.type === 'death').map((e) => e.videoOffsetMs),
    round_end: (live.roundEnds ?? []).map((e) => e.videoOffsetMs),
  }
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2)
}

/** Per live point, the residual to the nearest demo point of its kind under shift `c`. */
function agreeing(c: number, live: Record<Kind, number[]>, demo: Record<Kind, number[]>): number[] {
  const shifts: number[] = []
  for (const kind of Object.keys(live) as Kind[]) {
    for (const l of live[kind]) {
      let best: number | null = null
      for (const d of demo[kind]) {
        const s = l - d
        if (Math.abs(s - c) <= CS2_SYNC_TOLERANCE_MS && (best == null || Math.abs(s - c) < Math.abs(best - c))) best = s
      }
      if (best != null) shifts.push(best)
    }
  }
  return shifts
}

/**
 * Measure the demo → recording shift from GSI live events, or null when GSI saw too little to agree
 * (old recordings, GSI cfg not loaded). Callers then keep the match-start estimate.
 */
export function estimateCs2DemoVideoShift(
  timeline: Pick<MatchData, 'playerKills' | 'playerDeaths' | 'roundSummaries'>,
  live: Cs2LiveSummary | null | undefined,
): Cs2DemoVideoSync | null {
  if (!live) return null
  const demo = demoPoints(timeline)
  const seen = livePoints(live)
  const liveCount = seen.kill.length + seen.death.length + seen.round_end.length
  if (liveCount < CS2_SYNC_MIN_PAIRS) return null

  let best: number[] = []
  for (const kind of Object.keys(seen) as Kind[]) {
    for (const l of seen[kind]) {
      for (const d of demo[kind]) {
        const support = agreeing(l - d, seen, demo)
        if (support.length > best.length) best = support
      }
    }
  }
  if (best.length < CS2_SYNC_MIN_PAIRS || best.length < Math.ceil(liveCount * CS2_SYNC_MIN_SHARE)) return null
  // Refine around the consensus so one edge pair does not pick the centre.
  const refined = agreeing(median(best), seen, demo)
  const shifts = refined.length >= best.length ? refined : best
  return { shiftMs: median(shifts), pairs: shifts.length, livePoints: liveCount }
}
