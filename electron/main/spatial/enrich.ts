import type { KillEvent, MatchData } from '../riot-types'
import { worldToNorm } from './map-transforms'
import { resolveCallout } from './callout-resolver'
import type {
  KillSpatial,
  MatchSpatialSummary,
  NormPoint,
  SiteHotspot,
  SpatialHotspot,
  SpatialTimelineEvent,
} from './types'

const TRADE_RADIUS_WORLD = 2500

interface RiotKillRow {
  round?: number
  killer?: string
  victim?: string
  victimLocation?: { x: number; y: number }
  playerLocations?: Array<{
    subject?: string
    location?: { x: number; y: number }
    viewRadians?: number
  }>
}

function worldDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by)
}

function findPlayerLocation(
  row: RiotKillRow,
  puuid: string | undefined,
): { x: number; y: number } | null {
  if (!puuid || !row.playerLocations) return null
  const hit = row.playerLocations.find((p) => p.subject?.toLowerCase() === puuid.toLowerCase())
  return hit?.location ?? null
}

function countAlliesNearVictim(
  row: RiotKillRow,
  victimPuuid: string | undefined,
  ownTeamPuids: Set<string>,
): number {
  const vLoc = row.victimLocation
  if (!vLoc || !row.playerLocations) return 0
  let count = 0
  for (const p of row.playerLocations) {
    const sub = p.subject?.toLowerCase()
    if (!sub || sub === victimPuuid?.toLowerCase()) continue
    if (!ownTeamPuids.has(sub)) continue
    const loc = p.location
    if (!loc) continue
    if (worldDistance(vLoc.x, vLoc.y, loc.x, loc.y) <= TRADE_RADIUS_WORLD) count++
  }
  return count
}

export function enrichKillFromRiotRow(
  ev: KillEvent,
  row: RiotKillRow,
  mapName: string | null | undefined,
  ownPuuid: string | null | undefined,
  allyPuids: Set<string>,
): KillSpatial | null {
  const vLoc = row.victimLocation
  if (!vLoc || typeof vLoc.x !== 'number' || typeof vLoc.y !== 'number') return null

  const norm = worldToNorm(mapName, vLoc.x, vLoc.y)
  if (!norm) return null

  const { callout, site } = resolveCallout(mapName, norm)

  const killerLoc = findPlayerLocation(row, row.killer)
  const killerDistance = killerLoc
    ? Math.round(worldDistance(vLoc.x, vLoc.y, killerLoc.x, killerLoc.y))
    : null

  let killerCallout: string | null = null
  if (killerLoc) {
    const kNorm = worldToNorm(mapName, killerLoc.x, killerLoc.y)
    if (kNorm) killerCallout = resolveCallout(mapName, kNorm).callout
  }

  const victimIsPlayer = row.victim?.toLowerCase() === ownPuuid?.toLowerCase()
  const alliesNearby = victimIsPlayer
    ? countAlliesNearVictim(row, row.victim, allyPuids)
    : 0
  const isolated = victimIsPlayer ? alliesNearby === 0 : false

  return {
    norm,
    callout,
    site,
    killerDistance,
    isolated,
    alliesNearby,
    killerCallout,
  }
}

function buildSiteHotspots(deaths: SpatialTimelineEvent[]): SiteHotspot[] {
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

function buildPatterns(
  deaths: SpatialTimelineEvent[],
  roundCount?: number,
): string[] {
  const patterns: string[] = []
  const byCallout = new Map<string, SpatialTimelineEvent[]>()
  for (const d of deaths) {
    if (d.callout === 'Unknown') continue
    const list = byCallout.get(d.callout) ?? []
    list.push(d)
    byCallout.set(d.callout, list)
  }

  const roundSuffix = roundCount && roundCount > 0 ? ` in ${roundCount} rounds` : ''

  for (const [callout, list] of byCallout) {
    if (list.length < 2) continue
    const isolatedCount = list.filter((d) => d.isolated).length
    if (isolatedCount >= 2) {
      patterns.push(
        `${isolatedCount} untraded deaths @ ${callout}${roundSuffix}`,
      )
    } else if (isolatedCount === 1 && list.length >= 2) {
      patterns.push(
        `${list.length} deaths @ ${callout}${roundSuffix} (1 without trade)`,
      )
    } else if (list.length >= 3) {
      patterns.push(`${list.length} deaths @ ${callout}${roundSuffix} — mostly traded`)
    }
  }

  return patterns.slice(0, 6)
}

function buildHeatmapInsight(
  deaths: SpatialTimelineEvent[],
  roundCount?: number,
): string | null {
  const known = deaths.filter((d) => d.callout !== 'Unknown')
  if (!known.length) return null

  const isolated = known.filter((d) => d.isolated)
  const byCallout = new Map<string, SpatialTimelineEvent[]>()
  for (const d of known) {
    const list = byCallout.get(d.callout) ?? []
    list.push(d)
    byCallout.set(d.callout, list)
  }

  let topCallout: string | null = null
  let topScore = 0
  for (const [callout, list] of byCallout) {
    const iso = list.filter((d) => d.isolated).length
    const rate = roundCount && roundCount > 0 ? list.length / roundCount : 0
    const score = iso * 3 + (list.length - iso) * 0.4 + (rate >= 0.12 ? list.length : 0)
    if (score > topScore) {
      topScore = score
      topCallout = callout
    }
  }

  if (isolated.length >= 3) {
    const worst = [...byCallout.entries()]
      .map(([callout, list]) => ({ callout, iso: list.filter((d) => d.isolated).length }))
      .sort((a, b) => b.iso - a.iso)[0]
    if (worst?.iso) {
      return `${isolated.length} deaths with no trade support — worst @ ${worst.callout}`
    }
    return `${isolated.length} deaths with no teammate in trade range`
  }

  if (!topCallout) return null
  const topList = byCallout.get(topCallout) ?? []
  const isoAtTop = topList.filter((d) => d.isolated).length

  if (isoAtTop >= 2) {
    return `${isoAtTop} untraded deaths @ ${topCallout}`
  }
  if (topList.length >= 3 && isoAtTop >= 1) {
    return `${topList.length} deaths @ ${topCallout}, ${isoAtTop} without trade`
  }
  if (topList.length >= 3) {
    return `${topList.length} deaths @ ${topCallout} — mostly traded`
  }
  if (topList.length === 2 && isoAtTop === 2) {
    return `Both deaths @ ${topCallout} were untraded`
  }

  const areas = byCallout.size
  if (isolated.length > 0) {
    return `${known.length} deaths across ${areas} areas · ${isolated.length} untraded`
  }
  return `${known.length} deaths across ${areas} areas — no major untraded clusters`
}

export function buildMatchSpatialSummary(match: MatchData): MatchSpatialSummary | null {
  const map = match.map
  if (!map) return null

  const own = match.puuid?.toLowerCase()
  const allyPuids = new Set<string>()
  if (own) allyPuids.add(own)
  for (const p of match.teamSnapshot ?? []) {
    const team = (p.team ?? '').toUpperCase()
    const playerTeam = (match.finalStats?.team ?? '').toUpperCase()
    if (team && playerTeam && team === playerTeam && p.puuid) {
      allyPuids.add(p.puuid.toLowerCase())
    }
  }

  const rawKills = (match.matchDetails as { kills?: RiotKillRow[] } | null | undefined)?.kills

  const events: SpatialTimelineEvent[] = []

  const pushEvent = (
    type: 'death' | 'kill',
    ev: KillEvent,
  ) => {
    if (!ev.spatial) return
    const labelParts = [
      type === 'death' ? `Died @ ${ev.spatial.callout}` : `Kill @ ${ev.spatial.callout}`,
    ]
    if (type === 'death' && ev.killerName) labelParts.push(`vs ${ev.killerName}`)
    if (ev.weapon) labelParts.push(`(${ev.weapon})`)
    if (ev.spatial.isolated) labelParts.push('— no trade')

    events.push({
      type,
      round: ev.round ?? 0,
      norm: ev.spatial.norm,
      callout: ev.spatial.callout,
      site: ev.spatial.site,
      label: labelParts.join(' '),
      videoOffsetMs: ev.videoOffsetMs,
      weapon: ev.weapon,
      isolated: ev.spatial.isolated,
      killerDistance: ev.spatial.killerDistance,
    })
  }

  for (const d of match.playerDeaths) {
    pushEvent('death', d)
  }

  for (const k of match.playerKills) {
    pushEvent('kill', k)
  }

  if (events.length === 0) return null

  const deaths = events.filter((e) => e.type === 'death')
  const kills = events.filter((e) => e.type === 'kill')
  const roundCount = match.roundSummaries?.length ?? undefined
  const deathHotspots = buildHotspots(events, 'death')

  return {
    map,
    events,
    deathHotspots,
    killHotspots: buildHotspots(events, 'kill'),
    siteHotspots: buildSiteHotspots(deaths),
    roundCount,
    heatmapInsight: buildHeatmapInsight(deaths, roundCount),
    patterns: buildPatterns(deaths, roundCount),
  }
}

/** Apply spatial enrichment to all kill events when raw matchDetails.kills is present. */
export function applySpatialEnrichment(match: MatchData): void {
  const map = match.map
  const raw = match.matchDetails as { kills?: RiotKillRow[] } | null | undefined
  const rows = raw?.kills
  if (!map || !rows?.length) return

  const own = match.puuid
  const allyPuids = new Set<string>()
  if (own) allyPuids.add(own.toLowerCase())
  for (const p of match.teamSnapshot ?? []) {
    const team = (p.team ?? '').toUpperCase()
    const playerTeam = (match.finalStats?.team ?? '').toUpperCase()
    if (team && playerTeam && team === playerTeam && p.puuid) {
      allyPuids.add(p.puuid.toLowerCase())
    }
  }

  const enrichList = (list: KillEvent[]) => {
    for (const ev of list) {
      const row = rows.find(
        (k) => k.round === ev.round
          && k.victim?.toLowerCase() === ev.victimPuuid?.toLowerCase()
          && k.killer?.toLowerCase() === ev.killerPuuid?.toLowerCase(),
      )
      if (!row) continue
      const spatial = enrichKillFromRiotRow(ev, row, map, own, allyPuids)
      if (spatial) ev.spatial = spatial
    }
  }

  enrichList(match.killEvents)
  enrichList(match.playerKills)
  enrichList(match.playerDeaths)

  match.spatialSummary = buildMatchSpatialSummary(match) ?? undefined
}
