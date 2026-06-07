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

export type DisplayRotation = 0 | 90 | 180 | 270

type NormTransform = (p: NormPoint) => NormPoint

interface MapDisplayEntry {
  displayName: string
  displayBounds?: DisplayBounds
  displayTransform?: DisplayTransformId
  displayRotation?: DisplayRotation
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

const ROTATION_TO: Record<DisplayRotation, NormTransform> = {
  0: (p) => p,
  90: (p) => ({ x: p.y, y: 1 - p.x }),
  180: (p) => ({ x: 1 - p.x, y: 1 - p.y }),
  270: (p) => ({ x: 1 - p.y, y: p.x }),
}

const ROTATION_FROM: Record<DisplayRotation, NormTransform> = {
  0: (p) => p,
  90: (p) => ({ x: 1 - p.y, y: p.x }),
  180: (p) => ({ x: 1 - p.x, y: 1 - p.y }),
  270: (p) => ({ x: p.y, y: 1 - p.x }),
}

function normalizeRotation(value: unknown): DisplayRotation {
  if (value === 90 || value === 180 || value === 270) return value
  return 0
}

export function getMinimapDisplayRotation(mapName: string | null | undefined): DisplayRotation {
  const entry = getMapDisplayEntry(mapName)
  return normalizeRotation(entry?.displayRotation)
}

/** Draw the displayicon on canvas with optional per-map rotation (matches dot coords). */
export function drawMinimapImage(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  size: number,
  mapName: string | null | undefined,
): void {
  const rotation = getMinimapDisplayRotation(mapName)
  if (rotation === 0) {
    ctx.drawImage(img, 0, 0, size, size)
    return
  }
  ctx.save()
  if (rotation === 90) {
    ctx.translate(size, 0)
    ctx.rotate(Math.PI / 2)
  } else if (rotation === 180) {
    ctx.translate(size, size)
    ctx.rotate(Math.PI)
  } else if (rotation === 270) {
    ctx.translate(0, size)
    ctx.rotate(-Math.PI / 2)
  }
  ctx.drawImage(img, 0, 0, size, size)
  ctx.restore()
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
 * Map stored viewport-normalized coords → pixel space on the rendered minimap.
 * Applies content inset, symmetry transform, and optional canvas rotation.
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
  p = TRANSFORM_TO[transform](p)
  return ROTATION_TO[normalizeRotation(entry.displayRotation)](p)
}

/** Inverse for click hit-testing on the rendered minimap. */
export function fromMinimapDisplayNorm(
  mapName: string | null | undefined,
  norm: NormPoint,
): NormPoint {
  const entry = getMapDisplayEntry(mapName)
  if (!entry) return norm

  let p = ROTATION_FROM[normalizeRotation(entry.displayRotation)](norm)
  const transform = entry.displayTransform ?? 'identity'
  p = TRANSFORM_FROM[transform](p)

  if (entry.displayBounds) {
    p = removeDisplayBounds(entry.displayBounds, p)
  }

  return p
}
