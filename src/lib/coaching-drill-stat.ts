/**
 * Coaching drills from GET /api/drills can come from a VOD (`source: 'vod'`) or from repeated match-stat
 * problems (`source: 'match_stats'`, with a `why` line and a `stat`). Older APIs send none of these fields.
 * Pure helpers, no Vue / IPC.
 */

export type CoachingDrillSource = 'vod' | 'match_stats'

export interface CoachingDrillStat {
  /** Short stat name, e.g. "HS". */
  label: string
  /** Which direction is an improvement. */
  better: 'higher' | 'lower'
  baseline_pct: number
  current_pct: number | null
  target_pct: number
  matches: number
}

export interface CoachingDrillSourceFields {
  source?: CoachingDrillSource | string | null
  why?: string | null
  stat?: CoachingDrillStat | null
  beta?: boolean | null
}

export function isMatchStatsDrill(d: CoachingDrillSourceFields | null | undefined): boolean {
  return d?.source === 'match_stats'
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/** Percent for display: whole numbers from 10 up, one decimal below 10 (2.5% stays 2.5%, not 3%). */
export function formatStatPct(n: number): string {
  if (Math.abs(n) >= 10) return `${Math.round(n)}%`
  const one = Math.round(n * 10) / 10
  return `${Number.isInteger(one) ? one.toFixed(0) : one.toFixed(1)}%`
}

export interface CoachingStatLine {
  /** "HS 16% → target 19% · now 17%" (no "now" part when there is no current value). */
  text: string
  /** Current vs baseline in the drill's `better` direction; null without a current value. */
  trend: 'better' | 'worse' | 'same' | null
}

/** Compact stat line for a match-stats drill, or null when the stat is missing or malformed. */
export function coachingStatLine(stat: CoachingDrillStat | null | undefined): CoachingStatLine | null {
  if (!stat || !finite(stat.baseline_pct) || !finite(stat.target_pct)) return null
  const label = (stat.label ?? '').trim()
  const parts = [`${label ? `${label} ` : ''}${formatStatPct(stat.baseline_pct)} → target ${formatStatPct(stat.target_pct)}`]
  let trend: CoachingStatLine['trend'] = null
  if (finite(stat.current_pct)) {
    parts.push(`now ${formatStatPct(stat.current_pct)}`)
    const shown = (n: number) => formatStatPct(n)
    if (shown(stat.current_pct) === shown(stat.baseline_pct)) trend = 'same'
    else {
      const up = stat.current_pct > stat.baseline_pct
      trend = (stat.better === 'lower' ? !up : up) ? 'better' : 'worse'
    }
  }
  return { text: parts.join(' · '), trend }
}
