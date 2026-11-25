/**
 * Match review "Event timing": the saved sync offset is the detected (automatic) offset for the game
 * plus the player's own nudges. Show the nudge, not the raw offset — Valorant's detected offset is
 * −8.0 s, which used to read as an adjustment nobody made.
 */
export interface EventTimingState {
  /** The player's change from the detected timing, in ms (0 = using detected timing). */
  adjustmentMs: number
  adjusted: boolean
  /** "−3.0 s", "+1.0 s" or "None". */
  adjustmentLabel: string
}

export function formatTimingSeconds(ms: number): string {
  const s = Math.round(ms / 100) / 10
  if (s === 0) return '0.0 s'
  return `${s > 0 ? '+' : '−'}${Math.abs(s).toFixed(1)} s`
}

export function eventTiming(effectiveMs: number | null | undefined, detectedMs: number | null | undefined): EventTimingState {
  const eff = typeof effectiveMs === 'number' && Number.isFinite(effectiveMs) ? effectiveMs : 0
  const base = typeof detectedMs === 'number' && Number.isFinite(detectedMs) ? detectedMs : 0
  const adjustmentMs = eff - base
  // Sub-50 ms differences are rounding noise from the store, not a nudge.
  const adjusted = Math.abs(adjustmentMs) >= 50
  return { adjustmentMs: adjusted ? adjustmentMs : 0, adjusted, adjustmentLabel: adjusted ? formatTimingSeconds(adjustmentMs) : 'None' }
}
