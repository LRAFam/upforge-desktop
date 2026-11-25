/** Shared optional trainer contract: two measured distances, never clamped or rounded. */
export type PersonalDistances = [number, number]
export const PERSONAL_DISTANCE_LAYOUT = 'personalized_distance_v1'
export const PERSONAL_DISTANCE_SCENARIOS: readonly string[] = ['head_height', 'distance_switching']
export function isPersonalDistancePair(value: unknown): value is PersonalDistances {
  return Array.isArray(value) && value.length === 2
    && value.every(v => typeof v === 'number' && Number.isFinite(v))
    && value[0] >= 5 && value[0] < value[1] && value[1] <= 40
}
/** A configured personal layout must not silently run on a fixed layout. */
export function personalDistanceConfig(scenario: unknown, game: unknown, value: unknown): { distances_m?: PersonalDistances } {
  if (value === undefined) return {}
  if (game !== 'valorant' || typeof scenario !== 'string' || !PERSONAL_DISTANCE_SCENARIOS.includes(scenario) || !isPersonalDistancePair(value)) {
    throw new Error('distances_m requires two ascending distances from 5 to 40 metres on a supported Valorant drill.')
  }
  return { distances_m: [...value] }
}
/** Fixed and personal practice progression are separate; a malformed personal run counts for neither. */
export function matchesDistanceLayout(metadata: Record<string, unknown> | null | undefined, pair?: PersonalDistances): boolean {
  if (pair === undefined) return metadata?.layout !== PERSONAL_DISTANCE_LAYOUT && metadata?.distances_m === undefined
  const recorded = metadata?.distances_m
  return isPersonalDistancePair(pair) && metadata?.game === 'valorant' && metadata?.layout === PERSONAL_DISTANCE_LAYOUT
    && isPersonalDistancePair(recorded) && pair.every((distance, index) => distance === recorded[index])
}
