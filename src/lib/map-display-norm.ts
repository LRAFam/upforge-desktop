/** Normalized minimap point (0–1, origin top-left of displayicon). */
export interface NormPoint {
  x: number
  y: number
}

type NormTransform = (p: NormPoint) => NormPoint

/** Split displayicon is 90° from valorant-api callout / world-transform space. */
function splitToDisplay(p: NormPoint): NormPoint {
  return { x: p.y, y: 1 - p.x }
}

function splitFromDisplay(p: NormPoint): NormPoint {
  return { x: 1 - p.y, y: p.x }
}

const TO_DISPLAY: Record<string, NormTransform> = {
  split: splitToDisplay,
}

const FROM_DISPLAY: Record<string, NormTransform> = {
  split: splitFromDisplay,
}

function mapKey(mapName: string | null | undefined): string | null {
  if (!mapName) return null
  return mapName.trim().toLowerCase().replace(/\s+/g, '')
}

/** Map stored norm → pixel space on the displayicon we render. */
export function toMinimapDisplayNorm(
  mapName: string | null | undefined,
  norm: NormPoint,
): NormPoint {
  const key = mapKey(mapName)
  const fn = key ? TO_DISPLAY[key] : undefined
  return fn ? fn(norm) : norm
}

/** Inverse for click hit-testing on the rendered minimap. */
export function fromMinimapDisplayNorm(
  mapName: string | null | undefined,
  norm: NormPoint,
): NormPoint {
  const key = mapKey(mapName)
  const fn = key ? FROM_DISPLAY[key] : undefined
  return fn ? fn(norm) : norm
}
