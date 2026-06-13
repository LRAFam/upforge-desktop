import type { KillEvent, MatchData } from '../riot-types'
import { worldToNorm } from './map-transforms'
import { resolveCallout } from './callout-resolver'
import { resolvePlantCallout, resolveSitePlantAnchor } from './plant-callout-resolver'
import { getPlantBenchmarkHint } from './plant-benchmarks'
import { resolvePlayerRankTier } from './plant-benchmarks-helpers'
import { getPeekBenchmarkHint, buildPeekHotspots } from './peek-benchmarks'
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

function plantSiteLetter(site: string | null | undefined): string | null {
  if (!site) return null
  const letter = site.trim().charAt(0).toUpperCase()
  return letter === 'A' || letter === 'B' || letter === 'C' ? letter : null
}

function eventMatchesPlantSite(
  site: string | null | undefined,
  callout: string | null | undefined,
  letter: string,
): boolean {
  if (plantSiteLetter(site) === letter) return true
  if (!callout) return false
  return callout.startsWith(`${letter} `) || callout === `${letter} Site`
}

function medianNorm(pts: NormPoint[]): NormPoint | null {
  if (!pts.length) return null
  const filtered =
    pts.length >= 3 ? pts.filter((p) => p.y > 0.01 || (p.x > 0.05 && p.x < 0.95)) : pts
  const use = filtered.length >= 2 ? filtered : pts
  const xs = use.map((p) => p.x).sort((a, b) => a - b)
  const ys = use.map((p) => p.y).sort((a, b) => a - b)
  const mid = Math.floor(use.length / 2)
  return { x: xs[mid]!, y: ys[mid]! }
}

function inferPlantNormFromRoundEvents(
  match: MatchData,
  round: number,
  site: string | null | undefined,
  plantVideoMs?: number,
): NormPoint | null {
  const letter = plantSiteLetter(site)
  if (!letter) return null

  const pts: NormPoint[] = []
  const push = (
    norm: NormPoint | null | undefined,
    siteLabel?: string | null,
    callout?: string | null,
  ) => {
    if (!norm || (norm.x === 0 && norm.y === 0)) return
    if (!eventMatchesPlantSite(siteLabel, callout, letter)) return
    pts.push(norm)
  }

  for (const e of match.spatialSummary?.events ?? []) {
    if (e.round !== round || (e.type !== 'kill' && e.type !== 'death')) continue
    push(e.norm, e.site, e.callout)
  }

  const killRows = [
    ...(match.killEvents ?? []),
    ...(match.playerKills ?? []),
    ...(match.playerDeaths ?? []),
  ]
  for (const row of killRows) {
    if ((row.round ?? 0) !== round) continue
    if (row.spatial?.norm) push(row.spatial.norm, row.spatial.site, row.spatial.callout)
  }

  if (!pts.length) return null

  if (plantVideoMs != null) {
    const timed: NormPoint[] = []
    for (const e of match.spatialSummary?.events ?? []) {
      if (e.round !== round || (e.type !== 'kill' && e.type !== 'death') || !e.norm) continue
      if (!eventMatchesPlantSite(e.site, e.callout, letter)) continue
      if (Math.abs((e.videoOffsetMs ?? 0) - plantVideoMs) <= 45_000) timed.push(e.norm)
    }
    for (const row of killRows) {
      if ((row.round ?? 0) !== round) continue
      const sp = row.spatial
      if (!sp?.norm || !eventMatchesPlantSite(sp.site, sp.callout, letter)) continue
      if (Math.abs((row.videoOffsetMs ?? 0) - plantVideoMs) <= 45_000) timed.push(sp.norm)
    }
    if (timed.length >= 2) return medianNorm(timed)
  }

  return medianNorm(pts)
}

function buildPlantEvents(match: MatchData): {
  events: SpatialTimelineEvent[]
  byRound: Map<number, { norm: NormPoint; callout: string; site: string | null }>
} {
  const map = match.map
  const byRound = new Map<number, { norm: NormPoint; callout: string; site: string | null }>()
  if (!map) return { events: [], byRound }

  const rankTier = resolvePlayerRankTier(match)
  const events: SpatialTimelineEvent[] = []
  for (const plant of match.spikePlants ?? []) {
    const round = plant.round ?? 0
    const declaredSite = plantSiteLetter(plant.site)
    const loc = plant.plantLocation

    let norm: NormPoint | null = null
    let callout = declaredSite ? `${declaredSite} Site` : 'Plant'
    let siteLabel: string | null = declaredSite ?? plant.site ?? null

    if (loc && typeof loc.x === 'number' && typeof loc.y === 'number') {
      norm = worldToNorm(map, loc.x, loc.y)
      if (norm && declaredSite) {
        const zone = resolveCallout(map, norm)
        const zoneSite = plantSiteLetter(zone.site)
        if (zoneSite === declaredSite) {
          const resolved = resolvePlantCallout(map, norm)
          callout = resolved.callout
          siteLabel = resolved.site ?? plant.site ?? null
        } else {
          const anchor = resolveSitePlantAnchor(map, plant.site)
          if (anchor) {
            norm = anchor.norm
            callout = anchor.callout
            siteLabel = anchor.site
          } else {
            const resolved = resolvePlantCallout(map, norm)
            callout = resolved.callout
            siteLabel = resolved.site ?? plant.site ?? null
          }
        }
      } else if (norm) {
        const resolved = resolvePlantCallout(map, norm)
        callout = resolved.callout
        siteLabel = resolved.site ?? plant.site ?? null
      }
    }

    if (!norm) {
      const inferred = inferPlantNormFromRoundEvents(
        match,
        round,
        plant.site,
        plant.videoOffsetMs,
      )
      if (inferred) {
        const resolved = resolvePlantCallout(map, inferred)
        norm = inferred
        callout = resolved.callout
        siteLabel = resolved.site ?? plant.site ?? null
      }
    }

    if (!norm) {
      const anchor = resolveSitePlantAnchor(map, plant.site)
      if (!anchor) continue
      norm = anchor.norm
      callout = anchor.callout
      siteLabel = anchor.site
    }

    const benchmarkHint = getPlantBenchmarkHint(map, callout, rankTier)
    byRound.set(round, { norm, callout, site: siteLabel })
    events.push({
      type: 'plant',
      round,
      norm,
      callout,
      site: siteLabel,
      label: `Planted @ ${callout}`,
      videoOffsetMs: plant.videoOffsetMs,
      benchmarkHint,
    })
  }
  return { events, byRound }
}

function buildDefuseEvents(
  match: MatchData,
  plantByRound: Map<number, { norm: NormPoint; callout: string; site: string | null }>,
): SpatialTimelineEvent[] {
  const map = match.map
  if (!map) return []

  const events: SpatialTimelineEvent[] = []
  for (const defuse of match.spikeDefuses ?? []) {
    const round = defuse.round ?? 0
    const plantMeta = plantByRound.get(round)
    const site = plantMeta?.site ?? null
    const norm = plantMeta?.norm
    if (!norm) continue

    const callout = plantMeta?.callout ?? (site ? `${site} Site` : 'Defuse')
    events.push({
      type: 'defuse',
      round,
      norm,
      callout,
      site,
      label: `Defused @ ${callout}`,
      videoOffsetMs: defuse.videoOffsetMs,
    })
  }
  return events
}

function buildPeekBenchmarks(deaths: SpatialTimelineEvent[]): string[] {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const d of deaths) {
    const hint = d.benchmarkHint
    if (!hint || seen.has(hint)) continue
    seen.add(hint)
    lines.push(hint)
  }
  return lines.slice(0, 4)
}

function attachDeathPeekHints(
  deaths: SpatialTimelineEvent[],
  map: string,
  rankTier: string | null,
): void {
  for (const d of deaths) {
    if (d.type !== 'death') continue
    d.benchmarkHint = getPeekBenchmarkHint(map, d.callout, rankTier)
  }
}

function buildPlantBenchmarks(plants: SpatialTimelineEvent[]): string[] {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const p of plants) {
    const hint = p.benchmarkHint
    if (!hint || seen.has(hint)) continue
    seen.add(hint)
    lines.push(hint)
  }
  return lines.slice(0, 4)
}

function buildPlantInsight(plants: SpatialTimelineEvent[]): string | null {
  if (!plants.length) return null
  const byCallout = new Map<string, number>()
  for (const p of plants) {
    if (p.callout === 'Unknown') continue
    byCallout.set(p.callout, (byCallout.get(p.callout) ?? 0) + 1)
  }
  const top = [...byCallout.entries()].sort((a, b) => b[1] - a[1])[0]
  if (top && top[1] >= 2) return `${top[1]} plants @ ${top[0]}`
  if (top) return `Planted @ ${top[0]}`
  if (plants.length >= 2) return `${plants.length} spike plants on radar`
  return null
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

  const { events: plantEvents, byRound: plantByRound } = buildPlantEvents(match)
  events.push(...plantEvents)
  events.push(...buildDefuseEvents(match, plantByRound))

  if (events.length === 0) return null

  const deaths = events.filter((e) => e.type === 'death')
  const kills = events.filter((e) => e.type === 'kill')
  const plants = events.filter((e) => e.type === 'plant')
  const rankTier = resolvePlayerRankTier(match)
  attachDeathPeekHints(deaths, map, rankTier)
  const roundCount = match.roundSummaries?.length ?? undefined
  const deathHotspots = buildHotspots(events, 'death')
  const plantInsight = buildPlantInsight(plants)
  const plantBenchmarks = buildPlantBenchmarks(plants)
  const peekBenchmarks = buildPeekBenchmarks(deaths)
  const peekHotspots = buildPeekHotspots(map)

  return {
    map,
    events,
    deathHotspots,
    killHotspots: buildHotspots(events, 'kill'),
    siteHotspots: buildSiteHotspots(deaths),
    roundCount,
    heatmapInsight: buildHeatmapInsight(deaths, roundCount)
      ?? peekBenchmarks[0]
      ?? plantBenchmarks[0]
      ?? plantInsight,
    patterns: [
      ...buildPatterns(deaths, roundCount),
      ...(plantInsight ? [plantInsight] : []),
      ...peekBenchmarks,
      ...plantBenchmarks,
    ],
    plantBenchmarks: plantBenchmarks.length ? plantBenchmarks : undefined,
    peekBenchmarks: peekBenchmarks.length ? peekBenchmarks : undefined,
    peekHotspots: peekHotspots.length ? peekHotspots : undefined,
    populationSource: 'bundled',
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
