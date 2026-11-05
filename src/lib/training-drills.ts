/** Map coaching text → aim trainer scenario (uses shared category defaults) */

import {
  CATEGORY_TO_TRAINER_SCENARIO,
  type TrainerScenarioKey,
} from './trainer-scenarios'

const WEAKNESS_TO_SCENARIO: Record<string, TrainerScenarioKey> = {
  flick: 'flick',
  grid: 'gridshot',
  gridshot: 'gridshot',
  sixshot: 'sixshot',
  'one tap': 'flick',
  reflex: 'flick',
  headshot: 'flick',
  accuracy: 'flick',
  'first shot': 'flick',
  aim: 'flick',
  click: 'gridshot',
  crosshair: 'microadjust',
  track: 'tracking',
  strafe: 'strafe_aim',
  moving: 'tracking',
  movement: 'tracking',
  smooth: 'tracking',
  spray: 'microadjust',
  recoil: 'microadjust',
  control: 'microadjust',
  precision: 'microflick',
  micro: 'microflick',
  burst: 'sixshot',
  placement: 'switching',
  switching: 'switching',
  rotate: 'switching',
  retake: 'switching',
  multi: 'switching',
  peek: 'duel',
  peeking: 'duel',
  trade: 'switching',
  trading: 'switching',
}

export const SCENARIO_LABELS: Record<string, string> = {
  flick: 'Flick Training',
  gridshot: 'Gridshot',
  sixshot: 'Sixshot',
  tracking: 'Tracking',
  strafe_track: 'Strafe Track',
  microadjust: 'Micro-Adjust',
  microflick: 'Micro Flick',
  switching: 'Target Switching',
  strafe_aim: 'Strafe Aim',
  duel: '3D Duel',
  head_height: 'Head Height Corridor',
  angle_clearing: 'Angle Clearing',
  distance_switching: 'Distance Switching',
  hold_angle: 'Hold the Angle',
  jiggle_peek: 'Jiggle Peek',
  trade_window: 'Trade Window',
  clear_site: 'Clear the Site',
  flash_swing: 'Flash & Swing',
  operator_hold: 'Operator Hold',
  defuse_decision: 'Defuse Decision',
  retake_crossfire: 'Retake Crossfire',
}

export function pickTrainingScenario(...texts: (string | null | undefined)[]): TrainerScenarioKey {
  const blob = texts.filter(Boolean).join(' ').toLowerCase()
  for (const [keyword, scenario] of Object.entries(WEAKNESS_TO_SCENARIO)) {
    if (blob.includes(keyword)) return scenario
  }
  // Only aim categories have a default; utility / economy / comms text never maps to a drill here.
  for (const [category, scenario] of Object.entries(CATEGORY_TO_TRAINER_SCENARIO)) {
    if (blob.includes(category.replace('_', ' '))) return scenario
  }
  return 'flick'
}

export function trainingScenarioLabel(scenario: string): string {
  return SCENARIO_LABELS[scenario] ?? 'Aim Training'
}
