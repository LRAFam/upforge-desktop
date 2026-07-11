/**
 * Select high-value duel windows for moment-based vision coaching.
 * Death windows (teachable mistakes) + win windows (repeatable habits).
 */
import type { KillEvent, MatchData } from './riot-types'

export type DuelMomentTrigger = 'player_death' | 'player_kill'

export interface DuelMomentManifest {
  moment_id: string
  round: number
  video_offset_ms: number
  window_start_ms: number
  window_end_ms: number
  callout: string | null
  isolated: boolean
  trigger: DuelMomentTrigger
  polarity: 'negative' | 'positive'
  weight: number
  /** S3 key when desktop pre-uploads the duel window MP4. */
  clip_s3_key?: string
  /** Number of kills captured in this window (>1 for multi-kills / aces). */
  kill_count?: number
}

export const DUEL_WINDOW_BEFORE_MS = 8000
/** Through the kill — Riot death timestamps often land ~1s before POV resolution; keep under ~3s to avoid spectator cam. */
export const DUEL_WINDOW_AFTER_MS = 2000
export const MAX_DUEL_MOMENTS = 8
export const MAX_WIN_DUEL_MOMENTS = 3
const MIN_MOMENT_GAP_MS = 4000
const TRADE_WINDOW_MS = 12_000
/** Consecutive same-round kills within this gap are treated as one multi-kill sequence. */
export const MULTI_KILL_GAP_MS = 6000
/** Cap a single duel clip so a long spree can't produce a runaway window. */
export const MAX_DUEL_WINDOW_MS = 45_000

function deathWeight(death: KillEvent): number {
  let weight = 30
  if (death.spatial?.isolated) weight += 35
  if (death.spatial?.callout && death.spatial.callout !== 'Unknown') weight += 10
  const allies = death.spatial?.alliesNearby ?? 0
  if (allies === 0) weight += 10
  return weight
}

function killWeight(kill: KillEvent, roundKillIndex: number, traded: boolean): number {
  let weight = 35
  if (roundKillIndex === 0) weight += 25
  if (roundKillIndex >= 1) weight += 20
  if (traded) weight += 20
  const weapon = (kill.weapon ?? '').toLowerCase()
  if (weapon.includes('operator') || weapon.includes('marshal')) weight += 12
  if (kill.spatial?.callout && kill.spatial.callout !== 'Unknown') weight += 10
  return weight
}

function roundDisplay(event: KillEvent): number {
  const r = event.round
  if (typeof r === 'number' && r >= 0) return r + 1
  return 0
}

function isTradeKill(kill: KillEvent, deaths: KillEvent[]): boolean {
  const round = kill.round
  const offset = kill.videoOffsetMs
  if (round == null || offset == null) return false

  return deaths.some((death) => {
    if (death.round !== round || death.videoOffsetMs == null) return false
    const delta = offset - death.videoOffsetMs
    return delta > 0 && delta <= TRADE_WINDOW_MS
  })
}

function buildMomentManifest(
  event: KillEvent,
  weight: number,
  trigger: DuelMomentTrigger,
  polarity: 'negative' | 'positive',
  idPrefix: string,
): DuelMomentManifest {
  const offset = event.videoOffsetMs!
  const windowStart = Math.max(0, offset - DUEL_WINDOW_BEFORE_MS)
  const windowEnd = offset + DUEL_WINDOW_AFTER_MS

  return {
    moment_id: `${idPrefix}-r${roundDisplay(event)}-${offset}`,
    round: roundDisplay(event),
    video_offset_ms: offset,
    window_start_ms: windowStart,
    window_end_ms: windowEnd,
    callout: event.spatial?.callout ?? null,
    isolated: event.spatial?.isolated ?? false,
    trigger,
    polarity,
    weight,
  }
}

function pickSpacedMoments<T extends { video_offset_ms: number }>(
  scored: Array<{ item: T; weight: number }>,
  limit: number,
): T[] {
  const picked: T[] = []
  const usedOffsets: number[] = []

  for (const { item } of scored.sort((a, b) => b.weight - a.weight)) {
    if (picked.length >= limit) break
    if (usedOffsets.some((t) => Math.abs(t - item.video_offset_ms) < MIN_MOMENT_GAP_MS)) continue
    picked.push(item)
    usedOffsets.push(item.video_offset_ms)
  }

  return picked.sort((a, b) => a.video_offset_ms - b.video_offset_ms)
}

/**
 * Pick up to `limit` death moments ranked by coaching value (untraded > repeat callouts).
 */
export function pickDuelMoments(
  timeline: MatchData | null,
  limit = MAX_DUEL_MOMENTS,
): DuelMomentManifest[] {
  if (!timeline?.playerDeaths?.length) return []

  const calloutCounts = new Map<string, number>()
  for (const d of timeline.playerDeaths) {
    const c = d.spatial?.callout
    if (c && c !== 'Unknown') {
      calloutCounts.set(c, (calloutCounts.get(c) ?? 0) + 1)
    }
  }

  const scored = timeline.playerDeaths
    .filter((d) => d.videoOffsetMs != null && d.videoOffsetMs >= 0)
    .map((death) => {
      const callout = death.spatial?.callout ?? null
      let weight = deathWeight(death)
      if (callout && (calloutCounts.get(callout) ?? 0) >= 2) weight += 15
      return {
        item: buildMomentManifest(death, weight, 'player_death', 'negative', 'death'),
        weight,
      }
    })

  return pickSpacedMoments(scored, limit)
}

interface KillSequence {
  kills: KillEvent[]
  round: number
  firstOffset: number
  lastOffset: number
}

/**
 * Group consecutive same-round kills into sequences so a multi-kill / ace becomes
 * ONE window that spans from the first kill through the last — instead of a single
 * kill clip that cuts off the rest of the spree.
 */
function groupKillSequences(kills: KillEvent[]): KillSequence[] {
  const valid = kills
    .filter((k) => k.videoOffsetMs != null && k.videoOffsetMs >= 0)
    .sort((a, b) => a.videoOffsetMs! - b.videoOffsetMs!)

  const sequences: KillSequence[] = []
  for (const kill of valid) {
    const offset = kill.videoOffsetMs!
    const round = kill.round ?? -1
    const current = sequences[sequences.length - 1]
    if (
      current &&
      current.round === round &&
      offset - current.lastOffset <= MULTI_KILL_GAP_MS
    ) {
      current.kills.push(kill)
      current.lastOffset = offset
    } else {
      sequences.push({ kills: [kill], round, firstOffset: offset, lastOffset: offset })
    }
  }

  return sequences
}

function buildSequenceManifest(
  seq: KillSequence,
  traded: boolean,
): { item: DuelMomentManifest; weight: number } {
  const primary = seq.kills[0]!
  const killCount = seq.kills.length
  const roundNum = roundDisplay(primary)

  const windowStart = Math.max(0, seq.firstOffset - DUEL_WINDOW_BEFORE_MS)
  const windowEnd = Math.min(
    windowStart + MAX_DUEL_WINDOW_MS,
    seq.lastOffset + DUEL_WINDOW_AFTER_MS,
  )

  let weight = killWeight(primary, 0, traded)
  if (killCount >= 2) weight += 20 * (killCount - 1)

  return {
    item: {
      moment_id: `kill-r${roundNum}-${seq.firstOffset}`,
      round: roundNum,
      video_offset_ms: seq.firstOffset,
      window_start_ms: windowStart,
      window_end_ms: windowEnd,
      callout: primary.spatial?.callout ?? null,
      isolated: primary.spatial?.isolated ?? false,
      trigger: 'player_kill',
      polarity: 'positive',
      weight,
      kill_count: killCount,
    },
    weight,
  }
}

/**
 * Pick up to `limit` won-duel windows (opening picks, trades, multi-kills/aces).
 * Multi-kills are grouped into a single window spanning the whole spree.
 */
export function pickWinDuelMoments(
  timeline: MatchData | null,
  limit = MAX_WIN_DUEL_MOMENTS,
): DuelMomentManifest[] {
  if (!timeline?.playerKills?.length) return []

  const deaths = timeline.playerDeaths ?? []
  const sequences = groupKillSequences(timeline.playerKills)

  const scored = sequences.map((seq) => {
    const traded = isTradeKill(seq.kills[0]!, deaths)
    return buildSequenceManifest(seq, traded)
  })

  return pickSpacedMoments(scored, limit)
}

const DUEL_CLIP_GAMES = new Set<MatchData['game']>(['valorant', 'cs2', 'deadlock'])

export function duelMomentsForUpload(timeline: MatchData | null): DuelMomentManifest[] {
  if (!timeline || !DUEL_CLIP_GAMES.has(timeline.game)) return []

  return [...pickDuelMoments(timeline), ...pickWinDuelMoments(timeline)].sort(
    (a, b) => a.video_offset_ms - b.video_offset_ms,
  )
}
