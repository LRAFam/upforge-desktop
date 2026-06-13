/** Shared types for spatial minimap UI (mirrors electron/main/spatial/types). */

export interface NormPoint {
  x: number
  y: number
}

export interface SpatialTimelineEvent {
  type: 'death' | 'kill' | 'plant' | 'defuse'
  round: number
  norm: NormPoint
  callout: string
  site: string | null
  label: string
  videoOffsetMs?: number
  weapon?: string
  isolated?: boolean
  killerDistance?: number | null
  benchmarkHint?: string | null
}

export interface SpatialHotspot {
  callout: string
  count: number
  type: 'death' | 'kill'
}

export interface SiteHotspot {
  site: string
  count: number
  norm: NormPoint
}

export interface PeekHotspot {
  callout: string
  norm: NormPoint
  defenderKd: number
}

export interface MatchSpatialSummary {
  map: string
  events: SpatialTimelineEvent[]
  deathHotspots: SpatialHotspot[]
  killHotspots: SpatialHotspot[]
  siteHotspots?: SiteHotspot[]
  roundCount?: number
  heatmapInsight?: string | null
  patterns: string[]
  plantBenchmarks?: string[]
  peekBenchmarks?: string[]
  peekHotspots?: PeekHotspot[]
  populationSource?: 'bundled' | 'api'
}
