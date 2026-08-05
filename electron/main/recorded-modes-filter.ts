/**
 * Pure Valorant recorded-modes filter used before OBS starts a capture.
 * When every known mode is selected, filtering is off (record anything detected).
 * Otherwise only modes present in recordedModes are captured.
 */

export const VALORANT_RECORDABLE_MODES = [
  'COMPETITIVE',
  'PREMIER',
  'CLASSIC',
  'DEATHMATCH',
  'TEAMDEATHMATCH',
  'SPIKERUSH',
  'SWIFTPLAY',
  'SNOWBALL',
  'SHOOTING_RANGE',
] as const

export function isValorantModeFilteredOut(
  recordedModes: string[],
  gameMode: string | null,
  allModes: readonly string[] = VALORANT_RECORDABLE_MODES,
): boolean {
  if (!gameMode || recordedModes.length === 0) return false
  const filterByMode = !allModes.every((m) => recordedModes.includes(m))
  return filterByMode && !recordedModes.includes(gameMode)
}
