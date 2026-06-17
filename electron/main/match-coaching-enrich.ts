/**
 * Unified Riot + spatial enrich before any coaching API call.
 */
import type { AxiosInstance } from 'axios'
import type { RiotLocalApi } from './riot-local-api'
import type { MatchData } from './riot-types'
import { applySpatialEnrichment } from './spatial/enrich'
import { refreshMatchPopulationBenchmarks } from './spatial/enrich-population'

export interface EnrichForCoachingOptions {
  maxWaitMs?: number
  onStatus?: (message: string) => void
  api?: AxiosInstance | null
  /** Await live population benchmarks (capped by populationTimeoutMs). Default true. */
  refreshPopulation?: boolean
  populationTimeoutMs?: number
}

/**
 * Retry MatchDetails, rebuild spatial summary, and optionally refresh rank-cohort benchmarks.
 */
export async function enrichTimelineForCoaching(
  riot: RiotLocalApi,
  timeline: MatchData,
  options?: EnrichForCoachingOptions,
): Promise<boolean> {
  if (timeline.game !== 'valorant') return false

  const enriched = await riot.enrichTimelineMatchDetails(timeline, {
    maxWaitMs: options?.maxWaitMs ?? 90_000,
    onStatus: options?.onStatus,
  })

  if ((timeline.killEvents?.length ?? 0) > 0 || timeline.matchDetails) {
    try {
      applySpatialEnrichment(timeline)
    } catch {
      /* spatial is best-effort */
    }
  }

  if (
    options?.refreshPopulation !== false
    && options?.api
    && timeline.spatialSummary?.events?.length
  ) {
    const timeoutMs = options.populationTimeoutMs ?? 8_000
    await Promise.race([
      refreshMatchPopulationBenchmarks(timeline, options.api),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ])
  }

  return enriched
}
