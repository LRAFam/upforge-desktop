import type { DuelMoment } from './duel-moments'
import { formatPeekSequence } from './duel-moments'

export interface DuelFailureDiagnostics {
  integrity_reason?: string
  moments_requested?: number
  moments_observed?: number
  moments_high_confidence?: number
  moments: DuelMoment[]
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
    moments_high_confidence: typeof d.moments_high_confidence === 'number' ? d.moments_high_confidence : undefined,
    moments: moments as DuelMoment[],
  }
}

export function momentHasVisionSignal(moment: DuelMoment): boolean {
  if ((moment.key_observation ?? '').trim()) return true
  if (Array.isArray(moment.peek_sequence) && moment.peek_sequence.length > 0) return true
  if ((moment.crosshair_on_commit ?? '').trim() && moment.crosshair_on_commit !== 'unknown') return true
  if ((moment.movement_on_commit ?? '').trim() && moment.movement_on_commit !== 'unknown') return true
  return false
}

export function formatMomentVisionLine(moment: DuelMoment): string {
  const parts: string[] = []
  const peek = formatPeekSequence(moment.peek_sequence)
  if (peek) parts.push(peek)
  if (moment.crosshair_on_commit && moment.crosshair_on_commit !== 'unknown') {
    parts.push(`crosshair ${moment.crosshair_on_commit.replace(/_/g, ' ')}`)
  }
  if (moment.movement_on_commit && moment.movement_on_commit !== 'unknown') {
    parts.push(moment.movement_on_commit.replace(/_/g, ' '))
  }
  if (moment.key_observation?.trim()) return moment.key_observation.trim()
  if (parts.length) return parts.join(' · ')
  const caveat = moment.caveats?.find((c) => c.trim())
  if (caveat) return caveat
  return 'No clear vision from this clip'
}

export function diagnosticsSummary(d: DuelFailureDiagnostics): string {
  const req = d.moments_requested ?? d.moments.length
  const obs = d.moments_observed ?? d.moments.filter(momentHasVisionSignal).length
  return `Gemini reviewed ${req} death clip${req === 1 ? '' : 's'} — ${obs} with usable vision signal.`
}
