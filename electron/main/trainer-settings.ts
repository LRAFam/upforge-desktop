/**
 * trainer-settings.ts
 * Defaults, deep-merge and Godot conversion for the aim-trainer mouse + crosshair settings.
 * Kept free of Electron imports so it can be unit-tested.
 */
import type { AppSettings } from './settings-manager'
import type { DrillConfig } from './trainer-bridge'

type TrainerMouse = AppSettings['trainerMouse']
type CrosshairSettings = AppSettings['crosshairSettings']

/** Generic default FOV (Valorant's fixed 103° horizontal). */
export const DEFAULT_TRAINER_FOV = 103
/** CS2's own FOV value (the trainer reads CS2 fov as CS2's 4:3 value; CS2's default is 90). */
export const CS2_DEFAULT_FOV = 90

export function defaultTrainerFov(game: string | null | undefined): number {
  return game === 'cs2' ? CS2_DEFAULT_FOV : DEFAULT_TRAINER_FOV
}

/** In-game Scoped Sensitivity Multiplier: 1.0 keeps the same on-screen feel when scoped. */
export const DEFAULT_SCOPED_MULTIPLIER = 1.0
export const SCOPED_MULTIPLIER_MIN = 0.1
export const SCOPED_MULTIPLIER_MAX = 3.0

export const DEFAULT_TRAINER_MOUSE: TrainerMouse = {
  dpi: 800,
  game: 'valorant',
  sensitivity: 0.5,
  fov: DEFAULT_TRAINER_FOV,
  rawInput: true,
  pollingRate: 1000,
  movementSpeed: 6.75,
  trainerVolume: 80,
  scopedMultiplier: DEFAULT_SCOPED_MULTIPLIER,
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

/**
 * Deep-merge a saved (possibly partial / legacy) trainerMouse with defaults.
 * FOV: a missing value gets the game's default; CS2 still on the old universal default (103, which CS2
 * cannot be set to) is moved to CS2's default 90. Any other saved FOV is the user's and is kept.
 */
export function normalizeTrainerMouse(saved: unknown): TrainerMouse {
  const merged = mergeTyped(DEFAULT_TRAINER_MOUSE, saved)
  const savedFov = isRecord(saved) && typeof saved.fov === 'number' && Number.isFinite(saved.fov) ? saved.fov : null
  if (savedFov === null) merged.fov = defaultTrainerFov(merged.game)
  else if (merged.game === 'cs2' && savedFov === DEFAULT_TRAINER_FOV) merged.fov = CS2_DEFAULT_FOV
  merged.scopedMultiplier = Math.min(SCOPED_MULTIPLIER_MAX, Math.max(SCOPED_MULTIPLIER_MIN, merged.scopedMultiplier))
  return merged
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

/** Mouse settings sent to Godot (main process is the source of truth; the renderer never sends these). */
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
  }
}
