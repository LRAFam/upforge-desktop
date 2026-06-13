import type { KillEvent, MatchData } from '../riot-types'
import { getCs2MapTransform, normalizeCs2MapKey } from './cs2-transforms'
import type { SpatialHotspot, SpatialTimelineEvent } from './types'

function resolveSiteLabel(mapName: string | null, norm: { x: number; y: number }): string | null {
  const key = normalizeCs2MapKey(mapName)
  if (!key) return null

  if (key === 'de_dust2') {
    if (norm.x > 0.55 && norm.y > 0.55) return 'A'
    if (norm.x < 0.35 && norm.y < 0.45) return 'B'
    return 'Mid'
  }
  if (key === 'de_mirage') {
    if (norm.x < 0.45 && norm.y > 0.55) return 'A'
    if (norm.x > 0.6 && norm.y < 0.45) return 'B'
    return 'Mid'
  }
  if (key === 'de_inferno') {
    if (norm.x > 0.65 && norm.y > 0.55) return 'A'
    if (norm.x > 0.35 && norm.x < 0.65 && norm.y < 0.35) return 'B'
    return 'Mid'
  }
  if (key === 'de_nuke') {
    if (norm.y < 0.42 && norm.x > 0.35) return 'A'
    if (norm.y > 0.58) return 'B'
    return 'Mid'
  }
  if (key === 'de_overpass') {
    if (norm.x < 0.35 && norm.y > 0.5) return 'A'
    if (norm.x > 0.65 && norm.y > 0.4) return 'B'
    return 'Mid'
  }
  if (key === 'de_ancient') {
    if (norm.x > 0.5 && norm.y > 0.6) return 'A'
    if (norm.x < 0.55 && norm.y < 0.4) return 'B'
    return 'Mid'
  }
  if (key === 'de_anubis') {
    if (norm.x < 0.65 && norm.y > 0.55) return 'A'
    if (norm.x > 0.55 && norm.y < 0.5) return 'B'
    return 'Mid'
  }
  return null
}

export function resolveCs2Callout(mapName: string | null, norm: { x: number; y: number }): {
  callout: string
  site: string | null
} {
  const site = resolveSiteLabel(mapName, norm)
  return { callout: site ? `${site} site` : 'Unknown', site }
}

function buildHotspots(events: SpatialTimelineEvent[], type: 'death' | 'kill'): SpatialHotspot[] {
  const counts = new Map<string, number>()
  for (const e of events) {
    if (e.type !== type || e.callout === 'Unknown') continue
    counts.set(e.callout, (counts.get(e.callout) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([callout, count]) => ({ callout, count, type }))
    .sort((a, b) => b.count - a.count)
}

function buildHeatmapInsight(deaths: SpatialTimelineEvent[], roundCount?: number): string | null {
  if (!deaths.length) return null
  const suffix = roundCount && roundCount > 0 ? ` in ${roundCount} rounds` : ''
  const top = buildHotspots(deaths, 'death')[0]
  if (top && top.count >= 2) {
    return `${top.count} deaths @ ${top.callout}${suffix}`
  }
  if (deaths.length === 1) return `1 death on radar${suffix}`
  return `${deaths.length} deaths on radar${suffix}`
}

/** Build spatialSummary from demo-parsed kills that already have .spatial attached. */
export function applyDemoSpatialEnrichment(match: MatchData): void {
  if (match.game !== 'cs2' && match.game !== 'deadlock') return
  if (match.spatialSummary?.events?.length) return

  const mapKey = match.map
  const transform = getCs2MapTransform(mapKey)
  if (!transform) return

  const events: SpatialTimelineEvent[] = []

  const push = (type: 'death' | 'kill', ev: KillEvent) => {
    if (!ev.spatial) return
    const label = type === 'death'
      ? `Died @ ${ev.spatial.callout}${ev.killerName && ev.killerName !== 'You' ? ` vs ${ev.killerName}` : ''}`
      : `Kill @ ${ev.spatial.callout}`
    events.push({
      type,
      round: ev.round ?? 0,
      norm: ev.spatial.norm,
      callout: ev.spatial.callout,
      site: ev.spatial.site,
      label,
      videoOffsetMs: ev.videoOffsetMs,
      weapon: ev.weapon,
      isolated: ev.spatial.isolated,
      killerDistance: ev.spatial.killerDistance,
    })
  }

  for (const d of match.playerDeaths) push('death', d)
  for (const k of match.playerKills) push('kill', k)

  if (!events.length) return

  const deaths = events.filter((e) => e.type === 'death')
  const roundCount = match.roundSummaries?.length ?? undefined
  const canonicalMap = normalizeCs2MapKey(mapKey) ?? mapKey!

  match.spatialSummary = {
    map: canonicalMap,
    events,
    deathHotspots: buildHotspots(events, 'death'),
    killHotspots: buildHotspots(events, 'kill'),
    siteHotspots: [],
    roundCount,
    heatmapInsight: buildHeatmapInsight(deaths, roundCount),
    patterns: deaths.length >= 2 ? [`${deaths.length} deaths with radar position from demo`] : [],
  }
}
