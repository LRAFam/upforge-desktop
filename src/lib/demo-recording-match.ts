export interface DemoFileInfo {
  name: string
  path: string
  sizeBytes: number
  modifiedAt: number
}

export interface DemoRecordingContext {
  recordedAt: number
  matchStartTime?: number | null
  map?: string | null
}

export type DemoCandidateFit = 'best' | 'possible' | 'unlikely'

export interface RankedDemoCandidate extends DemoFileInfo {
  score: number
  recommended: boolean
  fit: DemoCandidateFit
  timingLabel: string
  timingDetail: string
}

const MATCH_BUFFER_MS = 5 * 60_000
const DOWNLOAD_WINDOW_MS = 6 * 60 * 60_000

export function resolveMatchStartMs(ctx: DemoRecordingContext): number {
  const raw = ctx.matchStartTime
  if (raw != null) {
    return raw > 1e12 ? raw : raw * 1000
  }
  return ctx.recordedAt - 45 * 60_000
}

function describeTiming(mtime: number, matchStart: number, recordedAt: number): string {
  if (mtime < matchStart) {
    const mins = Math.max(1, Math.round((matchStart - mtime) / 60_000))
    return `${mins} min before this match started`
  }
  if (mtime <= recordedAt) {
    const mins = Math.round((recordedAt - mtime) / 60_000)
    if (mins <= 1) return 'Saved near the end of this match'
    return `${mins} min before your recording ended`
  }
  const mins = Math.round((mtime - recordedAt) / 60_000)
  if (mins <= 1) return 'Right after you stopped recording'
  return `${mins} min after your recording ended`
}

function classifyFit(mtime: number, matchStart: number, recordedAt: number, minDist: number): DemoCandidateFit {
  if (mtime < matchStart - MATCH_BUFFER_MS) return 'unlikely'
  if (mtime > recordedAt + DOWNLOAD_WINDOW_MS) return 'unlikely'
  if (mtime >= matchStart && mtime <= recordedAt + 20 * 60_000 && minDist <= 25 * 60_000) {
    return 'best'
  }
  if (minDist <= 90 * 60_000) return 'possible'
  return 'unlikely'
}

function timingLabelFor(mtime: number, matchStart: number, recordedAt: number): string {
  if (mtime < matchStart) return 'Different match'
  if (mtime <= recordedAt) return 'Saved during match'
  if (mtime <= recordedAt + 45 * 60_000) return 'Downloaded after match'
  return 'Downloaded later'
}

export function rankDemosForRecording(
  demos: DemoFileInfo[],
  ctx: DemoRecordingContext,
): RankedDemoCandidate[] {
  const matchStart = resolveMatchStartMs(ctx)
  const recordedAt = ctx.recordedAt
  const matchEnd = recordedAt

  const targets = [
    matchEnd - 2 * 60_000,
    matchEnd + 8 * 60_000,
    matchEnd + 25 * 60_000,
  ]

  const ranked = demos.map((demo) => {
    const mtime = demo.modifiedAt
    const minDist = Math.min(...targets.map((target) => Math.abs(mtime - target)))
    let score = 10_000 - minDist
    if (mtime < matchStart) score -= 80_000
    if (mtime > recordedAt + DOWNLOAD_WINDOW_MS) score -= 120_000

    const fit = classifyFit(mtime, matchStart, recordedAt, minDist)

    return {
      ...demo,
      score,
      recommended: false,
      fit,
      timingLabel: timingLabelFor(mtime, matchStart, recordedAt),
      timingDetail: describeTiming(mtime, matchStart, recordedAt),
    }
  }).sort((a, b) => b.score - a.score)

  const best = ranked[0]
  if (best && best.fit !== 'unlikely') {
    const secondScore = ranked[1]?.score ?? Number.NEGATIVE_INFINITY
    best.recommended = best.score - secondScore >= 3 * 60_000 || ranked.length === 1
  }

  return ranked
}
