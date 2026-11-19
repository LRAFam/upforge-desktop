/**
 * trainer-settings.ts
 * Defaults, deep-merge and Godot conversion for the aim-trainer mouse + crosshair settings.
 * Kept free of Electron imports so it can be unit-tested.
 */
import type { AppSettings } from './settings-manager'
import type { DrillConfig, TrainerSpawnOptions } from './trainer-bridge'
import { trainerFovInRange, trainerSensitivityInRange } from '../../src/lib/trainer-mouse-limits'
import { DEFAULT_TRAINER_FOV, defaultTrainerFov, isTrainerGame, switchTrainerGame, TRAINER_GAMES, type TrainerAimByGame } from '../../src/lib/trainer-games'
import { TRAINER_MAX_FPS_DEFAULT, trainerMaxFpsInRange } from '../../src/lib/trainer-display'

export { CS2_DEFAULT_FOV, DEFAULT_TRAINER_FOV, defaultTrainerFov } from '../../src/lib/trainer-games'

type TrainerMouse = AppSettings['trainerMouse']
type CrosshairSettings = AppSettings['crosshairSettings']

/** In-game Scoped Sensitivity Multiplier: 1.0 keeps the same on-screen feel when scoped. */
export const DEFAULT_SCOPED_MULTIPLIER = 1.0
export const SCOPED_MULTIPLIER_MIN = 0.1
export const SCOPED_MULTIPLIER_MAX = 3.0

export const DEFAULT_TRAINER_MOUSE: TrainerMouse = {
  dpi: 800,
  game: 'valorant',
  sensitivity: 0.5,
  fov: DEFAULT_TRAINER_FOV,
  // rawInput / pollingRate: kept so old saves still load; the trainer does not read them (no UI).
  rawInput: true,
  pollingRate: 1000,
  movementSpeed: 6.75,
  trainerVolume: 80,
  scopedMultiplier: DEFAULT_SCOPED_MULTIPLIER,
  perGame: {},
  windowMode: 'fullscreen',
  vsync: false,
  maxFps: TRAINER_MAX_FPS_DEFAULT,
}

export const DEFAULT_CROSSHAIR_SETTINGS: CrosshairSettings = {
  colorIndex: 1,        // Valorant green default
  customColor: '00FF6B',
  dotShow: true,
  dotRadius: 1.5,
  dotOpacity: 1.0,
  innerShow: true,
  innerThickness: 2,
  innerLength: 10,
  innerOffset: 4,
  innerOpacity: 1.0,
  outerShow: false,
  outerThickness: 2,
  outerLength: 5,
  outerOffset: 10,
  outerOpacity: 1.0,
  shadowShow: true,
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Keep only saved keys whose type matches the default (drops null / wrong-typed legacy values). */
function mergeTyped<T extends object>(defaults: T, saved: unknown): T {
  const out = { ...defaults } as Record<string, unknown>
  if (!isRecord(saved)) return out as T
  for (const [k, v] of Object.entries(saved)) {
    const d = (defaults as Record<string, unknown>)[k]
    if (d === undefined) { out[k] = v; continue }
    if (typeof v === typeof d && !(typeof v === 'number' && !Number.isFinite(v))) out[k] = v
  }
  return out as T
}

/** Saved sensitivity / FOV per game: games the trainer knows, two numbers each, kept where it can start a drill. */
function normalizePerGame(saved: unknown): TrainerAimByGame {
  const out: TrainerAimByGame = {}
  if (!isRecord(saved)) return out
  for (const game of TRAINER_GAMES) {
    const aim = saved[game]
    if (!isRecord(aim)) continue
    const { sensitivity, fov } = aim
    if (typeof sensitivity !== 'number' || !Number.isFinite(sensitivity) || typeof fov !== 'number' || !Number.isFinite(fov)) continue
    out[game] = { sensitivity: trainerSensitivityInRange(sensitivity), fov: trainerFovInRange(fov) }
  }
  return out
}

/**
 * Deep-merge a saved (possibly partial / legacy) trainerMouse with defaults.
 * Game: "Custom" (no longer offered) and games the trainer has no scale for ran on Valorant's scale, so they
 * become Valorant: the trainer behaves exactly as before.
 * FOV: a missing value gets the game's default; CS2 still on the old universal default (103, which CS2
 * cannot be set to) is moved to CS2's default 90. Any other saved FOV is the user's and is kept, within 60–120.
 * FOV and sensitivity always stay where the trainer can start a drill (it refuses every drill otherwise).
 * `perGame` keeps each game's sensitivity and FOV; the current game's entry is always the current numbers, so
 * an older save's single value becomes its game's own.
 */
export function normalizeTrainerMouse(saved: unknown): TrainerMouse {
  const merged = mergeTyped(DEFAULT_TRAINER_MOUSE, saved)
  if (!isTrainerGame(merged.game)) merged.game = 'valorant'
  const savedFov = isRecord(saved) && typeof saved.fov === 'number' && Number.isFinite(saved.fov) ? saved.fov : null
  if (savedFov === null) merged.fov = defaultTrainerFov(merged.game)
  else if (merged.game === 'cs2' && savedFov === DEFAULT_TRAINER_FOV) merged.fov = defaultTrainerFov('cs2')
  merged.fov = trainerFovInRange(merged.fov)
  merged.sensitivity = trainerSensitivityInRange(merged.sensitivity)
  merged.scopedMultiplier = Math.min(SCOPED_MULTIPLIER_MAX, Math.max(SCOPED_MULTIPLIER_MIN, merged.scopedMultiplier))
  merged.windowMode = merged.windowMode === 'windowed' ? 'windowed' : 'fullscreen'
  merged.maxFps = trainerMaxFpsInRange(merged.maxFps)
  merged.perGame = { ...normalizePerGame(merged.perGame), [merged.game]: { sensitivity: merged.sensitivity, fov: merged.fov } }
  return merged
}

/**
 * Apply a saved change to the trainer settings. A change of game loads that game's own sensitivity and FOV
 * (switchTrainerGame): numbers that came along unchanged from the old game are that game's, so callers that
 * save `{ ...trainerMouse, game }` (title-bar switch, onboarding) move correctly; a number typed for the new
 * game in the same save is kept. A game the trainer has no scale for (League) leaves the trainer's game as it
 * is. `perGame` is only ever written here, never taken from a copy sent back by a screen.
 */
export function mergeTrainerMouse(prev: unknown, patch: unknown): TrainerMouse {
  const before = normalizeTrainerMouse(prev)
  const change: Record<string, unknown> = { ...(isRecord(patch) ? patch : {}) }
  delete change.perGame
  const game = isTrainerGame(change.game) ? change.game : before.game
  if (game === before.game) return normalizeTrainerMouse({ ...before, ...change, game })
  const moved = switchTrainerGame(before, game)
  const typed = (key: 'sensitivity' | 'fov'): number => {
    const value = change[key]
    return typeof value === 'number' && Number.isFinite(value) && value !== before[key] ? value : moved[key]
  }
  return normalizeTrainerMouse({ ...before, ...change, game, sensitivity: typed('sensitivity'), fov: typed('fov'), perGame: moved.perGame })
}

export function normalizeCrosshairSettings(saved: unknown): CrosshairSettings {
  return mergeTyped(DEFAULT_CROSSHAIR_SETTINGS, saved)
}

/** Valorant colour palette — indices match CrosshairConfig.gd VALORANT_COLORS */
const CROSSHAIR_PALETTE: [number, number, number][] = [
  [1.0,  1.0,  1.0 ], // 0 white
  [0.0,  1.0,  0.42], // 1 green
  [1.0,  0.85, 0.0 ], // 2 yellow
  [0.0,  0.87, 1.0 ], // 3 cyan
  [1.0,  0.47, 0.87], // 4 pink
  [1.0,  0.27, 0.33], // 5 red
]

function hexToRgb(hex: unknown): [number, number, number] | null {
  if (typeof hex !== 'string') return null
  const clean = hex.replace('#', '').trim()
  if (!/^[0-9a-fA-F]{3,6}$/.test(clean)) return null
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean.padEnd(6, '0')
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ]
}

/** Convert Electron CrosshairSettings into the Godot dict format. Never throws on partial/legacy input. */
export function crosshairSettingsToGodot(input: Partial<CrosshairSettings> | null | undefined): NonNullable<DrillConfig['crosshair_settings']> {
  const cs = normalizeCrosshairSettings(input)
  const idx = cs.colorIndex
  const color = Number.isInteger(idx) && idx >= 0 && idx < CROSSHAIR_PALETTE.length
    ? CROSSHAIR_PALETTE[idx]
    : hexToRgb(cs.customColor) ?? hexToRgb(DEFAULT_CROSSHAIR_SETTINGS.customColor)!
  return {
    color,
    shadow_show:      cs.shadowShow,
    dot_show:         cs.dotShow,
    dot_radius:       cs.dotRadius,
    dot_opacity:      cs.dotOpacity,
    inner_show:       cs.innerShow,
    inner_thickness:  cs.innerThickness,
    inner_length:     cs.innerLength,
    inner_offset:     cs.innerOffset,
    inner_opacity:    cs.innerOpacity,
    outer_show:       cs.outerShow,
    outer_thickness:  cs.outerThickness,
    outer_length:     cs.outerLength,
    outer_offset:     cs.outerOffset,
    outer_opacity:    cs.outerOpacity,
  }
}

/**
 * Mouse settings sent to Godot (main process is the source of truth; the renderer never sends these).
 * V-Sync and the frame cap ride in `mouse_settings` too: that is where the trainer reads them (scripts/Main.gd).
 */
export function trainerMouseToGodot(input: unknown): NonNullable<DrillConfig['mouse_settings']> {
  const ms = normalizeTrainerMouse(input)
  return {
    dpi: ms.dpi,
    game: ms.game,
    sensitivity: ms.sensitivity,
    fov: ms.fov,
    movement_speed: ms.movementSpeed,
    trainer_volume: ms.trainerVolume / 100,
    scoped_multiplier: ms.scopedMultiplier,
    vsync: ms.vsync,
    max_fps: ms.maxFps,
  }
}

/** How to start the trainer process: the window mode is read from its command line, before any drill arrives. */
export function trainerSpawnOptions(input: unknown): TrainerSpawnOptions {
  return { windowed: normalizeTrainerMouse(input).windowMode === 'windowed' }
}
