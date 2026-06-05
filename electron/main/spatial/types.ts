/** Normalized minimap position (0–1, origin top-left of displayicon). */
export interface NormPoint {
  x: number
  y: number
}

/** Per-map linear transform (valorant-api.com). */
export interface MapTransform {
  displayName: string
  uuid: string
  xMultiplier: number
  yMultiplier: number
  xScalarToAdd: number
  yScalarToAdd: number
  displayIcon?: string
  /** Raw transform bounds from valorant-api callouts — maps playable area to 0–1 for displayicon. */
  viewport?: { minX: number; maxX: number; minY: number; maxY: number }
}

/** Radial callout anchor — nearest within radius wins. */
export interface CalloutAnchor {
  name: string
  site?: 'A' | 'B' | 'C' | 'Mid' | 'Spawn'
  x: number
  y: number
  radius: number
}

/** Optional coarse site polygon (normalized) for fallback labelling. */
export interface SiteZone {
  site: 'A' | 'B' | 'C' | 'Mid'
  polygon: NormPoint[]
}

export interface MapCalloutPack {
  map: string
  callouts: CalloutAnchor[]
  sites?: SiteZone[]
}

/** Attached to kill/death events sent to API and UI. */
export interface KillSpatial {
  norm: NormPoint
  callout: string
  site: string | null
  killerDistance: number | null
  isolated: boolean
  alliesNearby: number
  killerCallout?: string | null
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
}

export interface SpatialHotspot {
  callout: string
  count: number
  type: 'death' | 'kill'
}

/** Death density rolled up by bombsite / Mid. */
export interface SiteHotspot {
  site: string
  count: number
  norm: NormPoint
}

/** Compact match-level spatial digest for AI + UI. */
export interface MatchSpatialSummary {
  map: string
  events: SpatialTimelineEvent[]
  deathHotspots: SpatialHotspot[]
  killHotspots: SpatialHotspot[]
  siteHotspots?: SiteHotspot[]
  /** Competitive rounds played (for "4 deaths in 13 rounds" insights). */
  roundCount?: number
  /** Glanceable heatmap headline for UI + AI, e.g. "You died @ B Main 4× in 13 rounds". */
  heatmapInsight?: string | null
  /** One-line patterns for prompts, e.g. "3 deaths @ A Screen (no trade)". */
  patterns: string[]
}
