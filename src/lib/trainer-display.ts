/**
 * How the aim trainer window runs: window mode, V-Sync, frame cap and target colour. The trainer reads the window
 * mode from its command line (`--upforge-windowed`) and V-Sync / frame cap from the launch message
 * (`mouse_settings.vsync`, `mouse_settings.max_fps`; upforge-trainer scripts/Main.gd). Shared by
 * Settings › Trainer (renderer) and the saved settings / launch (main). No imports: main loads it too.
 */

/**
 * `fullscreen`: the trainer's own choice (exclusive fullscreen on Windows, a maximized window elsewhere).
 * `windowed`: always a maximized window.
 */
export type TrainerWindowMode = 'fullscreen' | 'windowed'

/** The frame cap the trainer uses when none is sent (its project setting). */
export const TRAINER_MAX_FPS_DEFAULT = 360

/** Frame caps offered in Settings › Trainer. 0 = no cap. */
export const TRAINER_FRAME_CAPS: readonly number[] = [60, 120, 144, 165, 240, 360, 500, 0]

/** A frame cap the trainer applies as sent: 0 (no cap) or 30–1000, the trainer's own range. */
export function trainerMaxFpsInRange(fps: number): number {
  if (!Number.isFinite(fps)) return TRAINER_MAX_FPS_DEFAULT
  const whole = Math.round(fps)
  return whole <= 0 ? 0 : Math.min(1000, Math.max(30, whole))
}

export function frameCapLabel(fps: number): string {
  return fps === 0 ? 'No cap' : `${fps} fps`
}

/**
 * The colour of targets and enemy heads in every drill: the trainer's top-level launch key `target_palette`
 * (upforge-trainer scripts/TargetPalette.gd). `default` keeps each drill's own colours; the others give
 * every target one hue, for players who cannot tell red from green.
 */
export type TrainerTargetPalette = 'default' | 'yellow' | 'cyan' | 'magenta'

/** Offered in Settings › Trainer, in the trainer's own order (TargetPalette.NAMES). */
export const TRAINER_TARGET_PALETTES: ReadonlyArray<{ value: TrainerTargetPalette; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'magenta', label: 'Magenta' },
]

export function isTrainerTargetPalette(value: unknown): value is TrainerTargetPalette {
  return TRAINER_TARGET_PALETTES.some(p => p.value === value)
}

/** The first trainer build that reads `target_palette`. */
const TARGET_PALETTE_SINCE: readonly [number, number, number] = [1, 14, 0]

/**
 * The first trainer build that stays open between runs: it reads `keep_open` and `next_scenario`, shows its end
 * card (R again, N next drill, Esc back to UpForge) and sends `run_started` / `next_drill` / `back_to_app`.
 */
export const TRAINER_KEEP_OPEN_SINCE: readonly [number, number, number] = [1, 16, 0]

/** True when a trainer build ("1.14.0", "v1.14.2") is `since` or newer. A version that cannot be read counts as older. */
function trainerVersionAtLeast(trainerVersion: string, since: readonly [number, number, number]): boolean {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(trainerVersion).trim())
  if (!m) return false
  const parts = [Number(m[1]), Number(m[2]), Number(m[3])]
  const at = parts.findIndex((n, i) => n !== since[i])
  return at === -1 || parts[at] > since[at]
}

/** True when a trainer build ("1.14.0") reads `target_palette`. A version that cannot be read counts as older. */
export function trainerReadsTargetPalette(trainerVersion: string): boolean {
  return trainerVersionAtLeast(trainerVersion, TARGET_PALETTE_SINCE)
}

/** True when a trainer build stays open between runs (TRAINER_KEEP_OPEN_SINCE). Older builds close after each result. */
export function trainerStaysOpen(trainerVersion: string): boolean {
  return trainerVersionAtLeast(trainerVersion, TRAINER_KEEP_OPEN_SINCE)
}
