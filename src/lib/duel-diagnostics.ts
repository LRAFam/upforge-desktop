import type { DuelMoment } from './duel-moments'
import { formatPeekSequence } from './duel-moments'

export interface DuelFailureDiagnostics {
  integrity_reason?: string
  moments_requested?: number
  moments_observed?: number
  moments_high_confidence?: number
  clips_uploaded?: number
  clips_requested?: number | null
  moments: DuelMoment[]
}

function structuredFieldHasSignal(value: unknown): boolean {
  const text = String(value ?? '').trim().toLowerCase()
  return text !== '' && text !== 'unknown'
}

export function parseDuelFailureDiagnostics(raw: unknown): DuelFailureDiagnostics | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const moments = d.moments
  if (!Array.isArray(moments) || moments.length === 0) return null
  return {
    integrity_reason: typeof d.integrity_reason === 'string' ? d.integrity_reason : undefined,
    moments_requested: typeof d.moments_requested === 'number' ? d.moments_requested : moments.length,
    moments_observed: typeof d.moments_observed === 'number' ? d.moments_observed : undefined,
    moments_high_confidence:
      typeof d.moments_high_confidence === 'number' ? d.moments_high_confidence : undefined,
    clips_uploaded: typeof d.clips_uploaded === 'number' ? d.clips_uploaded : undefined,
    clips_requested:
      typeof d.clips_requested === 'number' ? d.clips_requested : undefined,
    moments: moments as DuelMoment[],
  }
}

export function momentHasVisionSignal(moment: DuelMoment): boolean {
  if ((moment.key_observation ?? '').trim()) return true
  if (Array.isArray(moment.peek_sequence) && moment.peek_sequence.some(structuredFieldHasSignal)) {
    return true
  }
  if (structuredFieldHasSignal(moment.crosshair_on_commit)) return true
  return structuredFieldHasSignal(moment.movement_on_commit)
}

export function momentClipUploaded(moment: DuelMoment): boolean {
  return Boolean(moment.clip_s3_key?.trim())
}

export function formatMomentVisionLine(moment: DuelMoment): string {
  const parts: string[] = []
  const peek = formatPeekSequence(moment.peek_sequence)
  if (peek) parts.push(peek)
  if (structuredFieldHasSignal(moment.crosshair_on_commit)) {
    parts.push(`crosshair ${String(moment.crosshair_on_commit).replace(/_/g, ' ')}`)
  }
  if (structuredFieldHasSignal(moment.movement_on_commit)) {
    parts.push(String(moment.movement_on_commit).replace(/_/g, ' '))
  }
  if (moment.key_observation?.trim()) return moment.key_observation.trim()
  if (parts.length) return parts.join(' · ')
  const caveat = moment.caveats?.find((c) => c.trim())
  if (caveat) return caveat
  if (!momentClipUploaded(moment)) return 'No duel clip uploaded — AI used full recording window'
  return 'Gemini returned no peek/crosshair signal from this clip'
}

export function diagnosticsSummary(d: DuelFailureDiagnostics): string {
  const req = d.moments_requested ?? d.moments.length
  const obs = d.moments_observed ?? d.moments.filter(momentHasVisionSignal).length
  const clipLine =
    d.clips_uploaded != null && d.clips_requested != null
      ? ` ${d.clips_uploaded}/${d.clips_requested} duel clips uploaded.`
      : ''
  return `Gemini reviewed ${req} death window${req === 1 ? '' : 's'} — ${obs} with usable vision signal.${clipLine}`
}

export function duelSeekMs(moment: DuelMoment): number | null {
  const offset = moment.video_offset_ms
  if (offset == null || Number.isNaN(offset)) return null
  return Math.max(0, offset - 4000)
}

export function formatDebugReport(d: DuelFailureDiagnostics): string {
  const lines = [diagnosticsSummary(d)]
  if (d.integrity_reason) lines.push(`Reason: ${d.integrity_reason}`)
  for (const moment of d.moments) {
    const rnd = moment.round ?? '?'
    const callout = moment.callout && moment.callout !== 'Unknown' ? ` @ ${moment.callout}` : ''
    const clip = momentClipUploaded(moment) ? 'clip=yes' : 'clip=no'
    const signal = momentHasVisionSignal(moment) ? 'signal=yes' : 'signal=no'
    const offset =
      moment.video_offset_ms != null ? ` t=${Math.round(moment.video_offset_ms / 1000)}s` : ''
    lines.push(`- R${rnd}${callout}${offset} [${clip}, ${signal}] ${formatMomentVisionLine(moment)}`)
  }
  return lines.join('\n')
}
