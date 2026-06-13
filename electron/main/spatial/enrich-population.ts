import type { AxiosInstance } from 'axios'
import type { MatchData } from '../riot-types'
import { getPlantBenchmarkHint } from './plant-benchmarks'
import { resolvePlayerRankTier } from './plant-benchmarks-helpers'
import { getPeekBenchmarkHint, buildPeekHotspots } from './peek-benchmarks'
import { refreshPopulationFromApi, hasLivePopulationData } from './population-store'
import type { MatchSpatialSummary } from './types'

function rebuildPlantBenchmarks(summary: MatchSpatialSummary): string[] {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const ev of summary.events) {
    if (ev.type !== 'plant' || !ev.benchmarkHint || seen.has(ev.benchmarkHint)) continue
    seen.add(ev.benchmarkHint)
    lines.push(ev.benchmarkHint)
  }
  return lines.slice(0, 4)
}

function rebuildPeekBenchmarks(summary: MatchSpatialSummary): string[] {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const ev of summary.events) {
    if (ev.type !== 'death' || !ev.benchmarkHint || seen.has(ev.benchmarkHint)) continue
    seen.add(ev.benchmarkHint)
    lines.push(ev.benchmarkHint)
  }
  return lines.slice(0, 4)
}

function applyBenchmarksToSummary(
  summary: MatchSpatialSummary,
  match: MatchData,
): MatchSpatialSummary {
  const map = summary.map
  const rankTier = resolvePlayerRankTier(match)

  for (const ev of summary.events) {
    if (ev.type === 'plant') {
      ev.benchmarkHint = getPlantBenchmarkHint(map, ev.callout, rankTier)
    } else if (ev.type === 'death') {
      ev.benchmarkHint = getPeekBenchmarkHint(map, ev.callout, rankTier)
    }
  }

  const plantBenchmarks = rebuildPlantBenchmarks(summary)
  const peekBenchmarks = rebuildPeekBenchmarks(summary)
  const peekHotspots = buildPeekHotspots(map)

  return {
    ...summary,
    plantBenchmarks: plantBenchmarks.length ? plantBenchmarks : undefined,
    peekBenchmarks: peekBenchmarks.length ? peekBenchmarks : undefined,
    peekHotspots: peekHotspots.length ? peekHotspots : undefined,
    populationSource: summary.populationSource ?? 'bundled',
  }
}

/** Refresh population aggregates from API and patch match spatial summary in place. */
export async function refreshMatchPopulationBenchmarks(
  match: MatchData,
  api: AxiosInstance | null,
  onUpdated?: (summary: MatchSpatialSummary) => void,
): Promise<void> {
  if (!match.spatialSummary?.events?.length || match.game !== 'valorant') return

  const map = match.map ?? match.spatialSummary.map
  const apiPack = await refreshPopulationFromApi(map, api)
  if (!apiPack) return

  const updated = applyBenchmarksToSummary(match.spatialSummary, match)
  updated.populationSource = hasLivePopulationData(map) ? 'api' : 'bundled'
  match.spatialSummary = updated
  onUpdated?.(updated)
}
