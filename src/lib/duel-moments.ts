/** Duel / death window manifest + AI moment observations (moment pipeline). */

export type MomentConfidence = 'high' | 'medium' | 'low'

export type DuelMomentTrigger = 'player_death' | 'player_kill'

export interface DuelMomentManifest {
  moment_id: string
  round: number
  video_offset_ms: number
  window_start_ms: number
  window_end_ms: number
  callout: string | null
  isolated: boolean
  trigger?: DuelMomentTrigger
  polarity?: 'negative' | 'positive'
  weight?: number
  clip_s3_key?: string
  /** Kills captured in this window (>1 for multi-kills / aces). */
  kill_count?: number
}

export interface DuelMomentObservation {
  moment_id?: string
  round?: number
  callout?: string | null
  video_offset_ms?: number
  isolated?: boolean
  /** Gemini may return a single enum string or an array depending on model/version. */
  peek_sequence?: string | string[]
  hold_geometry?: string
  crosshair_on_commit?: string
  crosshair_note?: string
  movement_on_commit?: string
  confidence?: MomentConfidence | string
  key_observation?: string
  /** May arrive as a single string from malformed JSON. */
  caveats?: string | string[]
  death_timestamp?: string
}

export type DuelMoment = DuelMomentManifest & DuelMomentObservation

export function mergeDuelMoments(
  manifest: DuelMomentManifest[],
  observations: DuelMomentObservation[] | null | undefined,
): DuelMoment[] {
  if (!manifest.length) return []
  const byId = new Map<string, DuelMomentObservation>()
  for (const obs of observations ?? []) {
    if (obs.moment_id) byId.set(obs.moment_id, obs)
  }
  return manifest.map((m) => normalizeDuelMoment({ ...m, ...(byId.get(m.moment_id) ?? {}) }))
}

export function normalizeStringList(value: string | string[] | undefined | null): string[] {
  if (value == null) return []
  if (Array.isArray(value)) {
    return value.map((s) => String(s).trim()).filter(Boolean)
  }
  const single = String(value).trim()
  return single ? [single] : []
}

export function normalizeDuelMoment<T extends DuelMoment>(moment: T): T {
  return {
    ...moment,
    peek_sequence: normalizePeekSequence(moment.peek_sequence),
    caveats: normalizeStringList(moment.caveats),
  }
}

export function normalizeDuelMoments<T extends DuelMoment>(moments: T[]): T[] {
  return moments.map(normalizeDuelMoment)
}

export function formatMomentClock(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function duelMomentKillCount(moment: Pick<DuelMomentManifest, 'kill_count' | 'moment_id'>): number {
  if (typeof moment.kill_count === 'number' && moment.kill_count > 0) {
    return moment.kill_count
  }
  return 1
}

export function isWinDuelMoment(
  moment: Pick<DuelMomentManifest, 'trigger' | 'polarity' | 'moment_id'>,
): boolean {
  if (moment.trigger === 'player_kill' || moment.polarity === 'positive') return true
  return (moment.moment_id ?? '').startsWith('kill-')
}

export function formatKillStreakLabel(count: number): string | null {
  if (count <= 1) return null
  if (count === 2) return 'Double kill'
  if (count === 3) return 'Triple kill'
  if (count === 4) return 'Quad kill'
  if (count >= 5) return 'Ace'
  return `${count}-kill streak`
}

export function duelMomentKindLabel(moment: Pick<DuelMomentManifest, 'kill_count' | 'trigger' | 'polarity' | 'moment_id'>): string {
  const count = duelMomentKillCount(moment)
  if (isWinDuelMoment(moment)) {
    return formatKillStreakLabel(count) ?? 'Opening pick'
  }
  return 'Death'
}

export function duelMomentKindBadgeClass(
  moment: Pick<DuelMomentManifest, 'trigger' | 'polarity' | 'moment_id'>,
): string {
  if (isWinDuelMoment(moment)) {
    return 'text-emerald-200 bg-emerald-500/15 border-emerald-500/30'
  }
  return 'text-red-300 bg-red-500/10 border-red-500/30'
}

export function duelMomentTimestampLabel(
  moment: Pick<DuelMomentManifest, 'video_offset_ms' | 'kill_count' | 'trigger' | 'polarity' | 'moment_id'>,
): string {
  const clock = formatMomentClock(moment.video_offset_ms)
  if (isWinDuelMoment(moment)) {
    const streak = formatKillStreakLabel(duelMomentKillCount(moment))
    return streak ? `${streak} @ ${clock}` : `Kill @ ${clock}`
  }
  return `Death @ ${clock}`
}

export function duelMomentWindowDurationLabel(
  moment: Pick<DuelMomentManifest, 'window_start_ms' | 'window_end_ms'>,
): string {
  const start = formatMomentClock(moment.window_start_ms)
  const end = formatMomentClock(moment.window_end_ms)
  const durationSec = Math.max(1, Math.round((moment.window_end_ms - moment.window_start_ms) / 1000))
  return `Clip ${start}–${end} (${durationSec}s)`
}

export function duelMomentScrubberTitle(
  moment: Pick<DuelMomentManifest, 'round' | 'callout' | 'kill_count' | 'trigger' | 'polarity' | 'moment_id'>,
): string {
  const parts = [`R${moment.round}`, duelMomentKindLabel(moment)]
  if (moment.callout) parts.push(moment.callout)
  const count = duelMomentKillCount(moment)
  if (count > 1) parts.push(`${count} kills`)
  return parts.join(' · ')
}

export function duelMomentScrubberBandClass(
  moment: Pick<DuelMomentManifest, 'trigger' | 'polarity' | 'moment_id'>,
  active: boolean,
): string {
  if (isWinDuelMoment(moment)) {
    return active
      ? 'bg-emerald-500/40 ring-1 ring-emerald-300/50 border-emerald-400/35'
      : 'border-emerald-400/30 bg-emerald-500/20 hover:bg-emerald-500/35'
  }
  return active
    ? 'bg-orange-500/40 ring-1 ring-orange-300/50'
    : 'border-orange-400/30 bg-orange-500/20 hover:bg-orange-500/35'
}

export function duelMomentScrubberMarkerClass(
  moment: Pick<DuelMomentManifest, 'trigger' | 'polarity' | 'moment_id'>,
): string {
  if (isWinDuelMoment(moment)) {
    return 'bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
  }
  return 'bg-orange-300 shadow-[0_0_8px_rgba(251,146,60,0.6)]'
}

export function duelMomentWeightReasons(moment: DuelMomentManifest): string[] {
  const reasons: string[] = []
  if (isWinDuelMoment(moment)) {
    const streak = formatKillStreakLabel(duelMomentKillCount(moment))
    if (streak) reasons.push(streak)
    else reasons.push('Won duel')
  } else if (moment.isolated) {
    reasons.push('Untraded death')
  }
  if (moment.callout && moment.callout !== 'Unknown') reasons.push(`@${moment.callout}`)
  if (typeof moment.weight === 'number' && moment.weight >= 55) reasons.push('High coaching value')
  return reasons
}

export function normalizePeekSequence(seq: string | string[] | undefined | null): string[] {
  if (seq == null) return []
  if (Array.isArray(seq)) {
    return seq.map((s) => String(s).trim()).filter(Boolean)
  }
  const single = String(seq).trim()
  return single ? [single] : []
}

export function formatPeekSequence(seq: string | string[] | undefined | null): string | null {
  const items = normalizePeekSequence(seq)
  if (!items.length) return null
  return items.map((s) => s.replace(/_/g, ' ')).join(' → ')
}

export function confidenceTone(confidence: string | undefined): 'high' | 'medium' | 'low' {
  if (confidence === 'high' || confidence === 'medium') return confidence
  return 'low'
}

export type PipelineStageId = 'match_data' | 'moments' | 'vision' | 'coach'

export interface PipelineStage {
  id: PipelineStageId
  label: string
  detail: string
}

export function pipelineStagesFromStep(
  step: string | null | undefined,
  progress: number,
  momentCount = 0,
): { stages: PipelineStage[]; activeIndex: number } {
  const stages: PipelineStage[] = [
    { id: 'match_data', label: 'Match data', detail: 'Timeline + stats from your match' },
    {
      id: 'moments',
      label: 'Duel windows',
      detail: momentCount ? `${momentCount} moments queued` : 'Picking high-value fights',
    },
    { id: 'vision', label: 'Clip vision', detail: 'Peek & crosshair on each window' },
    { id: 'coach', label: 'Coach synthesis', detail: 'Turning evidence into advice' },
  ]

  const text = (step ?? '').toLowerCase()
  let activeIndex = 0

  if (/synthesi|coach|generat|finaliz|calculat|insight/.test(text)) {
    activeIndex = 3
  } else if (/duel moment|analysing.*moment|observ|clip/.test(text) || (progress >= 50 && progress < 72)) {
    activeIndex = 2
  } else if (/download|recording|prepar|handoff|upload/.test(text) || progress >= 25) {
    activeIndex = 1
  } else if (/match data|queued|processing/.test(text) || progress > 0) {
    activeIndex = 0
  }

  if (/duel moment (\d+)/i.test(step ?? '')) {
    const m = (step ?? '').match(/duel moment (\d+)\/(\d+)/i)
    if (m) stages[2].detail = `Watching clip ${m[1]} of ${m[2]}`
    activeIndex = 2
  }

  return { stages, activeIndex }
}
