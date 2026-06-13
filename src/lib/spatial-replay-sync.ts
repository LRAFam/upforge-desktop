import type {
  MatchSpatialSummary,
  SiteHotspot,
  SpatialHotspot,
  SpatialTimelineEvent,
} from './spatial-types'

/** Seconds around the event timestamp to treat as a hit. */
export const SPATIAL_EVENT_HIT_WINDOW_SEC = 0.35

export function spatialPreRollSeconds(type: SpatialTimelineEvent['type']): number {
  return type === 'death' ? 4 : 2
}

export function adjustedSpatialVideoMs(
  ev: SpatialTimelineEvent,
  syncOffsetMs = 0,
): number | null {
  const ms = ev.videoOffsetMs
  if (ms == null || Number.isNaN(ms)) return null
  return ms + syncOffsetMs
}

export function spatialEventVideoSeconds(
  ev: SpatialTimelineEvent,
  syncOffsetMs = 0,
): number | null {
  const ms = adjustedSpatialVideoMs(ev, syncOffsetMs)
  return ms == null ? null : ms / 1000
}

export function isSpatialEventNearPlayback(
  ev: SpatialTimelineEvent,
  currentTimeSec: number,
  syncOffsetMs = 0,
): boolean {
  const eventSec = spatialEventVideoSeconds(ev, syncOffsetMs)
  if (eventSec == null) return false
  const preRoll = spatialPreRollSeconds(ev.type)
  return (
    Math.abs(currentTimeSec - eventSec) < SPATIAL_EVENT_HIT_WINDOW_SEC
    || (currentTimeSec >= eventSec - preRoll && currentTimeSec <= eventSec + 0.5)
  )
}

/** Nearest spatial event at playback time (prefers exact hit, then pre-roll window). */
export function findSpatialEventNearPlayback(
  events: SpatialTimelineEvent[],
  currentTimeSec: number,
  syncOffsetMs = 0,
): { ev: SpatialTimelineEvent; index: number } | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    if (!ev) continue
    const sec = spatialEventVideoSeconds(ev, syncOffsetMs)
    if (sec == null) continue
    if (Math.abs(currentTimeSec - sec) < SPATIAL_EVENT_HIT_WINDOW_SEC) {
      return { ev, index: i }
    }
  }
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    if (!ev) continue
    if (isSpatialEventNearPlayback(ev, currentTimeSec, syncOffsetMs)) {
      return { ev, index: i }
    }
  }
  return null
}

/** Events that have occurred at or before current playback time. Events without timestamps stay visible. */
export function filterEventsByPlayback(
  events: SpatialTimelineEvent[],
  currentTimeSec: number,
  syncOffsetMs = 0,
): SpatialTimelineEvent[] {
  const currentMs = currentTimeSec * 1000
  return events.filter((ev) => {
    const ms = adjustedSpatialVideoMs(ev, syncOffsetMs)
    if (ms == null) return true
    return ms <= currentMs + 80
  })
}

function buildDeathHotspots(deaths: SpatialTimelineEvent[]): SpatialHotspot[] {
  const counts = new Map<string, number>()
  for (const e of deaths) {
    if (e.callout === 'Unknown') continue
    counts.set(e.callout, (counts.get(e.callout) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([callout, count]) => ({ callout, count, type: 'death' as const }))
    .sort((a, b) => b.count - a.count)
}

function buildKillHotspots(kills: SpatialTimelineEvent[]): SpatialHotspot[] {
  const counts = new Map<string, number>()
  for (const e of kills) {
    if (e.callout === 'Unknown') continue
    counts.set(e.callout, (counts.get(e.callout) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([callout, count]) => ({ callout, count, type: 'kill' as const }))
    .sort((a, b) => b.count - a.count)
}

function buildSiteHotspotsFromDeaths(deaths: SpatialTimelineEvent[]): SiteHotspot[] {
  const bySite = new Map<string, { count: number; xs: number[]; ys: number[] }>()
  for (const d of deaths) {
    if (!d.site || d.site === 'Spawn') continue
    const bucket = bySite.get(d.site) ?? { count: 0, xs: [], ys: [] }
    bucket.count++
    bucket.xs.push(d.norm.x)
    bucket.ys.push(d.norm.y)
    bySite.set(d.site, bucket)
  }
  return [...bySite.entries()]
    .map(([site, v]) => ({
      site,
      count: v.count,
      norm: {
        x: v.xs.reduce((a, b) => a + b, 0) / v.xs.length,
        y: v.ys.reduce((a, b) => a + b, 0) / v.ys.length,
      },
    }))
    .sort((a, b) => b.count - a.count)
}

/** Progressive summary for replay-sync mode (dots + heat grow with playback). */
export function buildReplaySpatialSummary(
  summary: MatchSpatialSummary,
  currentTimeSec: number,
  syncOffsetMs: number,
  replaySync: boolean,
): MatchSpatialSummary {
  if (!replaySync) return summary
  const events = filterEventsByPlayback(summary.events, currentTimeSec, syncOffsetMs)
  const deaths = events.filter((e) => e.type === 'death')
  const kills = events.filter((e) => e.type === 'kill')
  return {
    ...summary,
    events,
    deathHotspots: buildDeathHotspots(deaths),
    killHotspots: buildKillHotspots(kills),
    siteHotspots: buildSiteHotspotsFromDeaths(deaths),
  }
}

export function spatialEventToastLabel(ev: SpatialTimelineEvent): {
  title: string
  sub?: string
  tone: 'death' | 'kill' | 'plant' | 'defuse' | 'neutral'
} {
  if (ev.type === 'death') {
    return { title: `Died @ ${ev.callout}`, sub: ev.weapon, tone: 'death' }
  }
  if (ev.type === 'kill') {
    return { title: `Kill @ ${ev.callout}`, sub: ev.weapon, tone: 'kill' }
  }
  if (ev.type === 'plant') {
    return { title: `Planted @ ${ev.callout}`, sub: ev.site ?? undefined, tone: 'plant' }
  }
  if (ev.type === 'defuse') {
    return { title: `Defused @ ${ev.callout}`, tone: 'defuse' }
  }
  return { title: ev.label || ev.callout, tone: 'neutral' }
}
