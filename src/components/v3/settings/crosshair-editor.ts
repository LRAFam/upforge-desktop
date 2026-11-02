import type { CrosshairSettings } from '../../../lib/crosshair'

/** Number keys of CrosshairSettings that the v3 editor drives with sliders. */
export type CrosshairNumberKey = {
  [K in keyof CrosshairSettings]: CrosshairSettings[K] extends number ? K : never
}[keyof CrosshairSettings]
export type CrosshairBoolKey = 'dotShow' | 'innerShow' | 'outerShow'

export interface CrosshairSlider { key: CrosshairNumberKey; label: string; min: number; max: number; step: number; percent?: boolean }
export interface CrosshairGroup { title: string; show: CrosshairBoolKey; sliders: CrosshairSlider[] }

/** Same ranges as the classic CrosshairSettingsPanel, grouped as Valorant does. */
export const CROSSHAIR_GROUPS: readonly CrosshairGroup[] = [
  { title: 'Centre dot', show: 'dotShow', sliders: [
    { key: 'dotRadius', label: 'Size', min: 0.5, max: 6, step: 0.5 },
    { key: 'dotOpacity', label: 'Opacity', min: 0, max: 1, step: 0.05, percent: true },
  ] },
  { title: 'Inner lines', show: 'innerShow', sliders: [
    { key: 'innerThickness', label: 'Thickness', min: 0.5, max: 8, step: 0.5 },
    { key: 'innerLength', label: 'Length', min: 0, max: 30, step: 1 },
    { key: 'innerOffset', label: 'Gap', min: 0, max: 20, step: 0.5 },
    { key: 'innerOpacity', label: 'Opacity', min: 0, max: 1, step: 0.05, percent: true },
  ] },
  { title: 'Outer lines', show: 'outerShow', sliders: [
    { key: 'outerThickness', label: 'Thickness', min: 0.5, max: 8, step: 0.5 },
    { key: 'outerLength', label: 'Length', min: 0, max: 30, step: 1 },
    { key: 'outerOffset', label: 'Offset', min: 0, max: 20, step: 0.5 },
    { key: 'outerOpacity', label: 'Opacity', min: 0, max: 1, step: 0.05, percent: true },
  ] },
]

export function sliderValueLabel(value: number, percent?: boolean): string {
  return percent ? `${Math.round(value * 100)}%` : String(value)
}
