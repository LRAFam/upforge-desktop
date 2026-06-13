import type { NormPoint } from './spatial-types'
import { getMapMinimap } from './valorant'
import { getCs2RadarUrl, isCs2Map } from './cs2-maps'
import { fromMinimapDisplayNorm, toMinimapDisplayNorm } from './map-display-norm'

export function isSourceRadarGame(game: string | null | undefined): boolean {
  return game === 'cs2' || game === 'deadlock'
}

export function resolveMapRadarUrl(
  game: string | null | undefined,
  mapName: string | null | undefined,
): string {
  if (game === 'cs2' || isCs2Map(mapName)) return getCs2RadarUrl(mapName)
  return getMapMinimap(mapName)
}

/** Map normalized radar coords to display canvas space (Valorant applies display calibration). */
export function toRadarDisplayNorm(
  game: string | null | undefined,
  mapName: string | null | undefined,
  norm: NormPoint,
): NormPoint {
  if (game === 'cs2' || isCs2Map(mapName)) return norm
  return toMinimapDisplayNorm(mapName, norm)
}

/** Inverse of toRadarDisplayNorm for canvas click → event norm. */
export function fromRadarDisplayNorm(
  game: string | null | undefined,
  mapName: string | null | undefined,
  norm: NormPoint,
): NormPoint {
  if (game === 'cs2' || isCs2Map(mapName)) return norm
  return fromMinimapDisplayNorm(mapName, norm)
}

export function hasRadarSupport(
  game: string | null | undefined,
  mapName: string | null | undefined,
): boolean {
  return !!resolveMapRadarUrl(game, mapName)
}
