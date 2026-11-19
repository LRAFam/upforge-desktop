/**
 * How the aim trainer window runs: window mode, V-Sync and frame cap. The trainer reads the window mode from
 * its command line (`--upforge-windowed`) and V-Sync / frame cap from the launch message
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
