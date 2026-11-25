/**
 * Per-game recorded-modes filter used before OBS starts a capture.
 * When every known mode for that game is selected, filtering is off (record anything).
 * Otherwise only modes present in the allowlist are captured.
 */

import { modeQueueLabel } from '../../src/lib/game-queue'

export type RecordableGame = 'valorant' | 'lol' | 'cs2' | 'deadlock'

/**
 * Catch-all switch for every queue without its own switch (Valorant Skirmish 2v2, Snowball Fight,
 * event modes; CS2 Arms Race, Retakes; League URF…). Without it those queues could only be
 * recorded by ticking every mode, and the skipped-match notice pointed at a switch that didn't exist.
 */
export const OTHER_MODES = 'OTHER'

export const VALORANT_RECORDABLE_MODES = [
  'COMPETITIVE',
  'PREMIER',
  'CLASSIC',
  'DEATHMATCH',
  'TEAMDEATHMATCH',
  'SPIKERUSH',
  'SWIFTPLAY',
  'SHOOTING_RANGE',
  OTHER_MODES,
] as const

/** Live Client reports CLASSIC for all Summoner's Rift queues (can't split ranked/normals yet). */
export const LOL_RECORDABLE_MODES = [
  'CLASSIC',
  'ARAM',
  'ARENA',
  'CUSTOM',
  'BOT',
  OTHER_MODES,
] as const

export const CS2_RECORDABLE_MODES = [
  'COMPETITIVE',
  'PREMIER',
  'WINGMAN',
  'CASUAL',
  'DEATHMATCH',
  OTHER_MODES,
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
  // New installs also record Unrated (CLASSIC) and Swiftplay: a new player's first match is often one
  // of those, and skipping it left them with nothing to review. Saved choices are never changed.
  valorant: ['COMPETITIVE', 'PREMIER', 'CLASSIC', 'SWIFTPLAY'],
  // Summoner's Rift on; ARAM/Arena/custom off until Live Client can split ranked vs normals.
  lol: ['CLASSIC'],
  cs2: ['COMPETITIVE', 'PREMIER'],
  deadlock: ['COMPETITIVE'],
}

export type RecordedModesByGame = Record<RecordableGame, string[]>

/**
 * The full mode lists before the Other modes switch existed. Ticking all of them turned the filter
 * off (record everything), so a saved list that still holds all of them gains Other modes on load
 * and keeps recording every queue.
 */
const LEGACY_ALL_MODES: Partial<Record<RecordableGame, readonly string[]>> = {
  valorant: ['COMPETITIVE', 'PREMIER', 'CLASSIC', 'DEATHMATCH', 'TEAMDEATHMATCH', 'SPIKERUSH', 'SWIFTPLAY', 'SNOWBALL', 'SHOOTING_RANGE'],
  lol: ['CLASSIC', 'ARAM', 'ARENA', 'CUSTOM', 'BOT'],
  cs2: ['COMPETITIVE', 'PREMIER', 'WINGMAN', 'CASUAL', 'DEATHMATCH'],
}

function keepRecordingEverything(game: RecordableGame, modes: string[]): string[] {
  const legacy = LEGACY_ALL_MODES[game]
  if (!legacy || modes.includes(OTHER_MODES) || !legacy.every(m => modes.includes(m))) return modes
  return [...modes, OTHER_MODES]
}

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
  for (const game of ['valorant', 'lol', 'cs2'] as const) next[game] = keepRecordingEverything(game, next[game])
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
  if (!filterByMode || recordedModes.includes(gameMode)) return false
  // A queue without its own switch is recorded when Other modes is on.
  if (allModes.includes(OTHER_MODES) && !allModes.includes(gameMode)) return !recordedModes.includes(OTHER_MODES)
  return true
}

/** True when this queue has no switch of its own and is covered by Other modes. */
export function isOtherMode(game: string, gameMode: string): boolean {
  const all = recordableModesForGame(game)
  return all.includes(OTHER_MODES) && !all.includes(gameMode)
}

/** @deprecated Prefer isModeFilteredOut with VALORANT_RECORDABLE_MODES */
export function isValorantModeFilteredOut(
  recordedModes: string[],
  gameMode: string | null,
  allModes: readonly string[] = VALORANT_RECORDABLE_MODES,
): boolean {
  return isModeFilteredOut(recordedModes, gameMode, allModes)
}

/**
 * Shown when a match is skipped because its mode isn't recorded. Names the mode the way the game
 * does ("Unrated", not the internal "CLASSIC"); unknown ids are shown as they are.
 */
export function modeSkippedMessage(game: string, gameMode: string): string {
  const name = modeQueueLabel(game, gameMode).split(' · ')[0] || gameMode
  if (isOtherMode(game, gameMode)) {
    return `${name} was not recorded because Other modes is off. Turn on Other modes in Settings → Recording to capture it.`
  }
  return `${name} is not in your recorded modes, so this match was not captured. Change modes in Settings → Recording.`
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
    // GSI map.mode strings (Valve GSI / CS:GO game-mode aliases): Wingman reports scrimcomp2v2.
    scrimcomp2v2: 'WINGMAN',
    gungameprogressive: 'ARMS_RACE',
    armsrace: 'ARMS_RACE',
    gungametrbomb: 'DEMOLITION',
    retakes: 'RETAKES',
    skirmish: 'SKIRMISH',
    custom: 'CUSTOM',
    training: 'TRAINING',
  }
  return map[key] ?? key.toUpperCase()
}
