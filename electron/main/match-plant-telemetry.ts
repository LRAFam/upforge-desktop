import type { MatchData } from './riot-types'

export interface PlantCoordStats {
  spikePlantCount: number
  withPlantLocation: number
  spatialPlantCount: number
  roundPlantsCount: number
}

export function plantCoordStats(timeline: MatchData | null): PlantCoordStats {
  const spikePlants = timeline?.spikePlants ?? []
  const spatialPlants = (timeline?.spatialSummary?.events ?? []).filter((e) => e.type === 'plant')
  const roundPlants = timeline?.roundPlants ?? []

  return {
    spikePlantCount: spikePlants.length,
    withPlantLocation: spikePlants.filter((p) => p.plantLocation?.x != null && p.plantLocation?.y != null).length,
    spatialPlantCount: spatialPlants.length,
    roundPlantsCount: roundPlants.length,
  }
}

export function logPlantCoordStats(timeline: MatchData | null, context: string): PlantCoordStats {
  const stats = plantCoordStats(timeline)
  const rate = stats.spikePlantCount > 0
    ? Math.round((stats.withPlantLocation / stats.spikePlantCount) * 100)
    : 0
  console.log(
    `[PlantTelemetry] ${context} — spikePlants=${stats.spikePlantCount} ` +
    `withCoords=${stats.withPlantLocation} (${rate}%) ` +
    `spatialPlants=${stats.spatialPlantCount} roundPlants=${stats.roundPlantsCount}`,
  )
  return stats
}
