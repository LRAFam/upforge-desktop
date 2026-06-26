/** Duel / death window manifest + AI moment observations (moment pipeline). */

export type MomentConfidence = 'high' | 'medium' | 'low'

export interface DuelMomentManifest {
  moment_id: string
  round: number
  video_offset_ms: number
  window_start_ms: number
  window_end_ms: number
  callout: string | null
  isolated: boolean
  trigger?: 'player_death'
  weight?: number
  clip_s3_key?: string
}

export interface DuelMomentObservation {
  moment_id?: string
  round?: number
  callout?: string | null
  video_offset_ms?: number
  isolated?: boolean
  peek_sequence?: string[]
  crosshair_on_commit?: string
  movement_on_commit?: string
  confidence?: MomentConfidence | string
  key_observation?: string
  caveats?: string[]
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
  return manifest.map((m) => ({ ...m, ...(byId.get(m.moment_id) ?? {}) }))
}

export function duelMomentWeightReasons(moment: DuelMomentManifest): string[] {
  const reasons: string[] = []
  if (moment.isolated) reasons.push('Untraded death')
  if (moment.callout && moment.callout !== 'Unknown') reasons.push(`@${moment.callout}`)
  if (typeof moment.weight === 'number' && moment.weight >= 55) reasons.push('High coaching value')
  return reasons
}

export function formatPeekSequence(seq: string[] | undefined): string | null {
  if (!seq?.length) return null
  return seq.map((s) => s.replace(/_/g, ' ')).join(' → ')
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
    { id: 'match_data', label: 'Match data', detail: 'Riot timeline + spatial callouts' },
    {
      id: 'moments',
      label: 'Duel windows',
      detail: momentCount ? `${momentCount} death moments queued` : 'Picking high-value deaths',
    },
    { id: 'vision', label: 'Clip vision', detail: 'Peek & crosshair on each window' },
    { id: 'coach', label: 'Coach synthesis', detail: 'Turning evidence into advice' },
  ]

  const text = (step ?? '').toLowerCase()
  let activeIndex = 0

  if (/synthesi|coach|generat|finaliz|calculat|insight/.test(text) || progress >= 72) {
    activeIndex = 3
  } else if (/duel moment|analysing.*moment|observ|clip/.test(text) || progress >= 50) {
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
