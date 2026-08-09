/**
 * Per-game recorded-modes filter used before OBS starts a capture.
 * When every known mode for that game is selected, filtering is off (record anything).
 * Otherwise only modes present in the allowlist are captured.
 */

export type RecordableGame = 'valorant' | 'lol' | 'cs2' | 'deadlock'

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

/** Live Client reports CLASSIC for all Summoner's Rift queues (can't split ranked/normals yet). */
export const LOL_RECORDABLE_MODES = [
  'CLASSIC',
  'ARAM',
  'ARENA',
  'CUSTOM',
] as const

export const CS2_RECORDABLE_MODES = [
  'COMPETITIVE',
  'PREMIER',
  'WINGMAN',
  'CASUAL',
  'DEATHMATCH',
] as const

export const DEADLOCK_RECORDABLE_MODES = [
  'COMPETITIVE',
] as const

export const RECORDABLE_MODES_BY_GAME: Record<RecordableGame, readonly string[]> = {
  valorant: VALORANT_RECORDABLE_MODES,
  lol: LOL_RECORDABLE_MODES,
  cs2: CS2_RECORDABLE_MODES,
  deadlock: DEADLOCK_RECORDABLE_MODES,
}

export const DEFAULT_RECORDED_MODES_BY_GAME: Record<RecordableGame, string[]> = {
  valorant: ['COMPETITIVE', 'PREMIER'],
  // Summoner's Rift on; ARAM/Arena/custom off until Live Client can split ranked vs normals.
  lol: ['CLASSIC'],
  cs2: ['COMPETITIVE', 'PREMIER'],
  deadlock: ['COMPETITIVE'],
}

export type RecordedModesByGame = Record<RecordableGame, string[]>

export function defaultRecordedModesByGame(): RecordedModesByGame {
  return {
    valorant: [...DEFAULT_RECORDED_MODES_BY_GAME.valorant],
    lol: [...DEFAULT_RECORDED_MODES_BY_GAME.lol],
    cs2: [...DEFAULT_RECORDED_MODES_BY_GAME.cs2],
    deadlock: [...DEFAULT_RECORDED_MODES_BY_GAME.deadlock],
  }
}

/** Migrate legacy flat `recordedModes` into per-game map. */
export function migrateRecordedModesByGame(
  recordedModes: string[] | undefined,
  existing: Partial<RecordedModesByGame> | undefined,
): RecordedModesByGame {
  const defaults = defaultRecordedModesByGame()
  const next: RecordedModesByGame = {
    valorant: Array.isArray(existing?.valorant) ? [...existing.valorant] : defaults.valorant,
    lol: Array.isArray(existing?.lol) ? [...existing.lol] : defaults.lol,
    cs2: Array.isArray(existing?.cs2) ? [...existing.cs2] : defaults.cs2,
    deadlock: Array.isArray(existing?.deadlock) ? [...existing.deadlock] : defaults.deadlock,
  }
  // Legacy flat list owned Valorant only — prefer it when by-game valorant was never saved.
  if (Array.isArray(recordedModes) && !Array.isArray(existing?.valorant)) {
    next.valorant = [...recordedModes]
  }
  return next
}

export function recordableModesForGame(game: string): readonly string[] {
  if (game === 'valorant' || game === 'lol' || game === 'cs2' || game === 'deadlock') {
    return RECORDABLE_MODES_BY_GAME[game]
  }
  return VALORANT_RECORDABLE_MODES
}

export function getRecordedModesForGame(
  byGame: RecordedModesByGame | null | undefined,
  game: string,
  legacyValorantModes?: string[],
): string[] {
  if (game === 'valorant' || game === 'lol' || game === 'cs2' || game === 'deadlock') {
    const fromMap = byGame?.[game]
    if (Array.isArray(fromMap)) return fromMap
    if (game === 'valorant' && Array.isArray(legacyValorantModes)) return legacyValorantModes
    return [...DEFAULT_RECORDED_MODES_BY_GAME[game]]
  }
  return Array.isArray(legacyValorantModes) ? legacyValorantModes : [...DEFAULT_RECORDED_MODES_BY_GAME.valorant]
}

export function isModeFilteredOut(
  recordedModes: string[],
  gameMode: string | null,
  allModes: readonly string[],
): boolean {
  if (!gameMode || recordedModes.length === 0) return false
  const filterByMode = !allModes.every((m) => recordedModes.includes(m))
  return filterByMode && !recordedModes.includes(gameMode)
}

/** @deprecated Prefer isModeFilteredOut with VALORANT_RECORDABLE_MODES */
export function isValorantModeFilteredOut(
  recordedModes: string[],
  gameMode: string | null,
  allModes: readonly string[] = VALORANT_RECORDABLE_MODES,
): boolean {
  return isModeFilteredOut(recordedModes, gameMode, allModes)
}

/** Normalize CS2 GSI map.mode into a recordable mode id. */
export function normalizeCs2GameMode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const key = raw.trim().toLowerCase()
  if (!key) return null
  const map: Record<string, string> = {
    competitive: 'COMPETITIVE',
    premier: 'PREMIER',
    wingman: 'WINGMAN',
    casual: 'CASUAL',
    deathmatch: 'DEATHMATCH',
    scrimcomp2v2: 'WINGMAN',
  }
  return map[key] ?? key.toUpperCase()
}
