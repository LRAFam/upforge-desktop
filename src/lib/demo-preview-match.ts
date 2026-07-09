import { normalizeCs2MapKey, cs2MapDisplayName } from './cs2-maps'

export interface RecordingDemoHint {
  map: string | null
  kills: number | null
  deaths: number | null
  allyScore: number | null
  enemyScore: number | null
}

export interface DemoPreviewInput {
  ok: boolean
  map: string | null
  kills: number | null
  deaths: number | null
  assists?: number
  allyScore: number
  enemyScore: number
  won: boolean | null
  partialParse?: boolean
  totalKillEvents?: number
  identityWarning?: string
}

export type DemoPreviewConfidence = 'strong' | 'possible' | 'weak' | 'mismatch'

export interface DemoPreviewAssessment {
  confidence: DemoPreviewConfidence
  headline: string
  details: string[]
}

function mapsMatch(recordingMap: string | null, demoMap: string | null): boolean | null {
  const a = normalizeCs2MapKey(recordingMap)
  const b = normalizeCs2MapKey(demoMap)
  if (!a || !b) return null
  return a === b
}

function scoreLine(ally: number | null, enemy: number | null): string | null {
  if (ally == null || enemy == null) return null
  return `${ally}–${enemy}`
}

export function buildRecordingDemoHint(recording: {
  map?: string | null
  timeline?: {
    map?: string | null
    finalStats?: { kills?: number; deaths?: number } | null
    finalScore?: { allyScore?: number; enemyScore?: number } | null
  } | null
}): RecordingDemoHint {
  const timeline = recording.timeline
  return {
    map: recording.map ?? timeline?.map ?? null,
    kills: timeline?.finalStats?.kills ?? null,
    deaths: timeline?.finalStats?.deaths ?? null,
    allyScore: timeline?.finalScore?.allyScore ?? null,
    enemyScore: timeline?.finalScore?.enemyScore ?? null,
  }
}

export function assessDemoPreviewMatch(
  preview: DemoPreviewInput,
  hint: RecordingDemoHint,
): DemoPreviewAssessment {
  if (!preview.ok) {
    return {
      confidence: 'weak',
      headline: 'Could not preview this replay',
      details: [],
    }
  }

  if (preview.partialParse) {
    const details: string[] = []
    if (preview.map) {
      details.push(`Header map: ${cs2MapDisplayName(preview.map) || preview.map}`)
    }
    details.push('Wait for Steam to finish downloading, then rescan')
    return {
      confidence: 'weak',
      headline: 'Replay still downloading or damaged',
      details,
    }
  }

  if (preview.identityWarning) {
    const details: string[] = [preview.identityWarning]
    if (preview.totalKillEvents && preview.totalKillEvents > 0) {
      details.push(`${preview.totalKillEvents} kills in replay — match kills shown below`)
    }
    const mapMatch = mapsMatch(hint.map, preview.map)
    if (mapMatch) {
      details.unshift(`Map matches (${cs2MapDisplayName(preview.map ?? '') || preview.map})`)
    }
    return {
      confidence: mapMatch ? 'possible' : 'weak',
      headline: 'Replay parsed — set your Steam name for your stats',
      details,
    }
  }

  const details: string[] = []
  const mapMatch = mapsMatch(hint.map, preview.map)
  const kdaMatch = hint.kills != null
    && hint.deaths != null
    && preview.kills != null
    && preview.deaths != null
    && hint.kills === preview.kills
    && hint.deaths === preview.deaths
  const scoreMatch = hint.allyScore != null
    && hint.enemyScore != null
    && hint.allyScore === preview.allyScore
    && hint.enemyScore === preview.enemyScore

  if (mapMatch === false) {
    const vodMap = cs2MapDisplayName(hint.map ?? '') || hint.map || 'another map'
    const demoMap = cs2MapDisplayName(preview.map ?? '') || preview.map || 'different map'
    return {
      confidence: 'mismatch',
      headline: 'Different map',
      details: [`Your VOD: ${vodMap}`, `This replay: ${demoMap}`],
    }
  }

  if (mapMatch) {
    details.push(`Map matches (${cs2MapDisplayName(preview.map ?? '') || preview.map})`)
  }
  if (kdaMatch) {
    details.push(`K/D matches your VOD (${preview.kills}/${preview.deaths})`)
  } else if (preview.kills != null && preview.deaths != null) {
    details.push(`Replay stats: ${preview.kills}/${preview.deaths}/${preview.assists ?? 0}`)
  }
  if (scoreMatch) {
    details.push(`Score matches (${preview.allyScore}–${preview.enemyScore})`)
  } else {
    const line = scoreLine(preview.allyScore, preview.enemyScore)
    if (line) details.push(`Replay score: ${line}`)
  }

  const vodScore = scoreLine(hint.allyScore, hint.enemyScore)
  if (vodScore && !scoreMatch) {
    details.unshift(`Your VOD score: ${vodScore}`)
  }
  if (hint.kills != null && hint.deaths != null && !kdaMatch) {
    details.unshift(`Your VOD K/D: ${hint.kills}/${hint.deaths}`)
  }

  if (mapMatch && (kdaMatch || scoreMatch)) {
    return { confidence: 'strong', headline: 'Looks like this match', details }
  }
  if (mapMatch || kdaMatch || scoreMatch) {
    return { confidence: 'possible', headline: 'Might be this match', details }
  }

  return {
    confidence: 'weak',
    headline: 'Check the kill list below',
    details: details.length ? details : ['Compare rounds and kills to what you remember from this VOD'],
  }
}

export function recordingHintLabel(hint: RecordingDemoHint, game: string): string {
  const parts: string[] = []
  if (hint.map && game === 'cs2') {
    parts.push(cs2MapDisplayName(hint.map) || hint.map)
  } else if (hint.map) {
    parts.push(hint.map)
  }
  const score = scoreLine(hint.allyScore, hint.enemyScore)
  if (score) parts.push(score)
  if (hint.kills != null && hint.deaths != null) {
    parts.push(`${hint.kills}/${hint.deaths} K/D`)
  }
  return parts.length ? parts.join(' · ') : 'Recorded match'
}
