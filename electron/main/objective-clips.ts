/**
 * League objective clips: short clips around Baron, Dragon, Herald, tower and inhibitor takes,
 * from the Live Client objective events. Capped per match (numeric, never unlimited).
 * Voidgrubs are not included: the Live Client event name for them isn't verified yet.
 */
import type { MatchData, ObjectiveEvent, ObjectiveKind } from './riot-types'

export const MAX_OBJECTIVE_CLIPS_PER_MATCH = 4
/** Seconds of video before / after the objective event. */
export const OBJECTIVE_CLIP_BEFORE_MS = 12_000
export const OBJECTIVE_CLIP_AFTER_MS = 6_000

type ClippedKind = Extract<ObjectiveKind, 'baron' | 'dragon' | 'herald' | 'tower' | 'inhibitor'>

/** Bigger swings first. */
const PRIORITY: Record<ClippedKind, number> = { baron: 0, dragon: 1, herald: 2, inhibitor: 3, tower: 4 }

const LABEL: Record<ClippedKind, string> = {
  baron: 'Baron',
  dragon: 'Dragon',
  herald: 'Rift Herald',
  inhibitor: 'Inhibitor',
  tower: 'Tower',
}

function isClipped(kind: ObjectiveKind): kind is ClippedKind {
  return kind in PRIORITY
}

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Plain label from what the live client actually reported (no guessing who took it). */
export function objectiveClipTitle(o: ObjectiveEvent): string {
  const kind = o.kind as ClippedKind
  const detail = kind === 'dragon' && o.detail ? ` (${o.detail})` : ''
  const stolen = o.stolen ? ' · stolen' : ''
  const you = o.killerName === 'You' ? ' · you took it' : ''
  const at = typeof o.timeSinceGameStartMillis === 'number' ? ` · ${clock(o.timeSinceGameStartMillis)}` : ''
  return `${LABEL[kind]}${detail}${stolen}${you}${at}`
}

/** Objectives worth clipping: biggest first, ones you secured first within a kind, capped; no video offset → skipped. */
export function pickObjectiveClips(
  timeline: Pick<MatchData, 'objectiveEvents'> | null | undefined,
  cap = MAX_OBJECTIVE_CLIPS_PER_MATCH,
): ObjectiveEvent[] {
  const limit = Math.max(0, Math.min(cap, MAX_OBJECTIVE_CLIPS_PER_MATCH))
  if (limit === 0) return []
  const time = (o: ObjectiveEvent) => o.timeSinceGameStartMillis ?? o.videoOffsetMs ?? 0
  return (timeline?.objectiveEvents ?? [])
    .filter(o => isClipped(o.kind) && typeof o.videoOffsetMs === 'number' && Number.isFinite(o.videoOffsetMs) && o.videoOffsetMs >= 0)
    .sort((a, b) => {
      const p = PRIORITY[a.kind as ClippedKind] - PRIORITY[b.kind as ClippedKind]
      if (p !== 0) return p
      const mine = Number(b.killerName === 'You') - Number(a.killerName === 'You')
      return mine !== 0 ? mine : time(a) - time(b)
    })
    .slice(0, limit)
}
