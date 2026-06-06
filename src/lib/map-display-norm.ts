import mapsManifest from '../../resources/spatial/maps-manifest.json'

/** Normalized minimap point (0–1, origin top-left of displayicon). */
export interface NormPoint {
  x: number
  y: number
}

export interface DisplayBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type DisplayTransformId =
  | 'identity'
  | 'flipX'
  | 'flipY'
  | 'flipXY'
  | 'swap'
  | 'swapFlipX'
  | 'swapFlipY'
  | 'swapFlipXY'

type NormTransform = (p: NormPoint) => NormPoint

interface MapDisplayEntry {
  displayName: string
  displayBounds?: DisplayBounds
  displayTransform?: DisplayTransformId
}

const TRANSFORM_TO: Record<DisplayTransformId, NormTransform> = {
  identity: (p) => p,
  flipX: (p) => ({ x: 1 - p.x, y: p.y }),
  flipY: (p) => ({ x: p.x, y: 1 - p.y }),
  flipXY: (p) => ({ x: 1 - p.x, y: 1 - p.y }),
  swap: (p) => ({ x: p.y, y: p.x }),
  swapFlipX: (p) => ({ x: 1 - p.y, y: p.x }),
  swapFlipY: (p) => ({ x: p.y, y: 1 - p.x }),
  swapFlipXY: (p) => ({ x: 1 - p.y, y: 1 - p.x }),
}

const TRANSFORM_FROM: Record<DisplayTransformId, NormTransform> = {
  identity: (p) => p,
  flipX: (p) => ({ x: 1 - p.x, y: p.y }),
  flipY: (p) => ({ x: p.x, y: 1 - p.y }),
  flipXY: (p) => ({ x: 1 - p.x, y: 1 - p.y }),
  swap: (p) => ({ x: p.y, y: p.x }),
  swapFlipX: (p) => ({ x: p.y, y: 1 - p.x }),
  swapFlipY: (p) => ({ x: 1 - p.y, y: p.x }),
  swapFlipXY: (p) => ({ x: 1 - p.y, y: 1 - p.x }),
}

function mapKey(mapName: string | null | undefined): string | null {
  if (!mapName) return null
  return mapName.trim().toLowerCase().replace(/\s+/g, '')
}

function getMapDisplayEntry(mapName: string | null | undefined): MapDisplayEntry | null {
  const key = mapKey(mapName)
  if (!key) return null
  const list = mapsManifest as MapDisplayEntry[]
  return list.find((m) => mapKey(m.displayName) === key) ?? null
}

function applyDisplayBounds(bounds: DisplayBounds, p: NormPoint): NormPoint {
  const { minX, minY, maxX, maxY } = bounds
  return {
    x: minX + p.x * (maxX - minX),
    y: minY + p.y * (maxY - minY),
  }
}

function removeDisplayBounds(bounds: DisplayBounds, p: NormPoint): NormPoint {
  const { minX, minY, maxX, maxY } = bounds
  const spanX = maxX - minX
  const spanY = maxY - minY
  if (spanX <= 0 || spanY <= 0) return p
  return {
    x: (p.x - minX) / spanX,
    y: (p.y - minY) / spanY,
  }
}

/**
 * Map stored viewport-normalized coords → pixel space on the displayicon PNG.
 * Applies optional content inset + per-map symmetry (auto-calibrated from PNG).
 */
export function toMinimapDisplayNorm(
  mapName: string | null | undefined,
  norm: NormPoint,
): NormPoint {
  const entry = getMapDisplayEntry(mapName)
  if (!entry) return norm

  let p = norm
  if (entry.displayBounds) {
    p = applyDisplayBounds(entry.displayBounds, p)
  }

  const transform = entry.displayTransform ?? 'identity'
  return TRANSFORM_TO[transform](p)
}

/** Inverse for click hit-testing on the rendered minimap. */
export function fromMinimapDisplayNorm(
  mapName: string | null | undefined,
  norm: NormPoint,
): NormPoint {
  const entry = getMapDisplayEntry(mapName)
  if (!entry) return norm

  const transform = entry.displayTransform ?? 'identity'
  let p = TRANSFORM_FROM[transform](norm)

  if (entry.displayBounds) {
    p = removeDisplayBounds(entry.displayBounds, p)
  }

  return p
}
