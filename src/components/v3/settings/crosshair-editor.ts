import type { CrosshairSettings } from '../../../lib/crosshair'

/** Number keys of CrosshairSettings that the v3 editor drives with sliders. */
export type CrosshairNumberKey = {
  [K in keyof CrosshairSettings]: CrosshairSettings[K] extends number ? K : never
}[keyof CrosshairSettings]
export type CrosshairBoolKey = 'shadowShow' | 'dotShow' | 'innerShow' | 'outerShow'

export interface CrosshairSlider { key: CrosshairNumberKey; label: string; min: number; max: number; step: number; percent?: boolean }
export interface CrosshairGroup { title: string; show: CrosshairBoolKey; sliders: CrosshairSlider[] }

/** Valorant's own groups, ranges and whole-pixel steps (sizes in screen px, both offsets from the centre). */
export const CROSSHAIR_GROUPS: readonly CrosshairGroup[] = [
  { title: 'Outline', show: 'shadowShow', sliders: [
    { key: 'outlineThickness', label: 'Thickness', min: 1, max: 6, step: 1 },
    { key: 'outlineOpacity', label: 'Opacity', min: 0, max: 1, step: 0.05, percent: true },
  ] },
  { title: 'Centre dot', show: 'dotShow', sliders: [
    { key: 'dotSize', label: 'Thickness', min: 1, max: 6, step: 1 },
    { key: 'dotOpacity', label: 'Opacity', min: 0, max: 1, step: 0.05, percent: true },
  ] },
  { title: 'Inner lines', show: 'innerShow', sliders: [
    { key: 'innerThickness', label: 'Thickness', min: 0, max: 10, step: 1 },
    { key: 'innerLength', label: 'Length', min: 0, max: 20, step: 1 },
    { key: 'innerOffset', label: 'Offset', min: 0, max: 20, step: 1 },
    { key: 'innerOpacity', label: 'Opacity', min: 0, max: 1, step: 0.05, percent: true },
  ] },
  { title: 'Outer lines', show: 'outerShow', sliders: [
    { key: 'outerThickness', label: 'Thickness', min: 0, max: 10, step: 1 },
    { key: 'outerLength', label: 'Length', min: 0, max: 10, step: 1 },
    { key: 'outerOffset', label: 'Offset', min: 0, max: 40, step: 1 },
    { key: 'outerOpacity', label: 'Opacity', min: 0, max: 1, step: 0.05, percent: true },
  ] },
]

export function sliderValueLabel(value: number, percent?: boolean): string {
  return percent ? `${Math.round(value * 100)}%` : String(value)
}
