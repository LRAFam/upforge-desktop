/**
 * Mouse settings the aim trainer can start a drill with. The trainer refuses a launch whose sensitivity is
 * 0 or below, or whose FOV is outside 1–179, and then every drill fails the same way. FOV is kept to the
 * Settings › Trainer box's own 60–120; sensitivity only needs a floor (games such as Overwatch 2 go above
 * the box's 20). Shared by the settings box (renderer) and the saved settings / launch payload (main).
 */
export const TRAINER_FOV_MIN = 60
export const TRAINER_FOV_MAX = 120
export const TRAINER_SENSITIVITY_MIN = 0.01

export function trainerFovInRange(fov: number): number {
  return Math.min(TRAINER_FOV_MAX, Math.max(TRAINER_FOV_MIN, fov))
}

export function trainerSensitivityInRange(sensitivity: number): number {
  return Math.max(TRAINER_SENSITIVITY_MIN, sensitivity)
}

/** The settings box's typed numbers brought into range in place. An empty box is left for the save to drop. */
export function clampTrainerMouseInput(mouse: { fov: number; sensitivity: number }): void {
  if (Number.isFinite(mouse.fov)) mouse.fov = trainerFovInRange(mouse.fov)
  if (Number.isFinite(mouse.sensitivity)) mouse.sensitivity = trainerSensitivityInRange(mouse.sensitivity)
}
