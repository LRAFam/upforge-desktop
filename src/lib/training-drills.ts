/** Map coaching text → aim trainer scenario */

const WEAKNESS_TO_SCENARIO: Record<string, string> = {
  flick: 'flick',
  'one tap': 'flick',
  reflex: 'flick',
  headshot: 'flick',
  accuracy: 'flick',
  'first shot': 'flick',
  aim: 'flick',
  click: 'flick',
  crosshair: 'flick',
  track: 'tracking',
  moving: 'tracking',
  movement: 'tracking',
  smooth: 'tracking',
  spray: 'microadjust',
  recoil: 'microadjust',
  control: 'microadjust',
  precision: 'microadjust',
  micro: 'microadjust',
  burst: 'microadjust',
  placement: 'switching',
  switching: 'switching',
  rotate: 'switching',
  retake: 'switching',
  multi: 'switching',
  peek: 'flick',
  peeking: 'flick',
  trade: 'switching',
  trading: 'switching',
}

export const SCENARIO_LABELS: Record<string, string> = {
  flick: 'Flick Training',
  tracking: 'Tracking',
  microadjust: 'Micro-Adjust',
  switching: 'Target Switching',
}

export function pickTrainingScenario(...texts: (string | null | undefined)[]): string {
  const blob = texts.filter(Boolean).join(' ').toLowerCase()
  for (const [keyword, scenario] of Object.entries(WEAKNESS_TO_SCENARIO)) {
    if (blob.includes(keyword)) return scenario
  }
  return 'flick'
}

export function trainingScenarioLabel(scenario: string): string {
  return SCENARIO_LABELS[scenario] ?? 'Aim Training'
}
