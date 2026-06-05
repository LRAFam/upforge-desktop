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

/** Compact match-level spatial digest for AI + UI. */
export interface MatchSpatialSummary {
  map: string
  events: SpatialTimelineEvent[]
  deathHotspots: SpatialHotspot[]
  killHotspots: SpatialHotspot[]
  /** One-line patterns for prompts, e.g. "3 deaths @ A Screen (no trade)". */
  patterns: string[]
}
