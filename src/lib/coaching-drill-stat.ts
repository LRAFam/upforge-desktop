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
  target_pct: number | null
  matches: number
  /** Server-owned verification window; absent on older API/history rows. */
  current_matches?: number | null
  matches_needed?: number | null
  current_numerator?: number | null
  current_hits?: number | null
  minimum_hits?: number | null
  progress_status?: CoachingVerificationStatus
  measurement?: 'pooled_hits_latest_eligible_ranked'
  window_started_at?: string | null
}

export type CoachingVerificationStatus = 'waiting_for_matches' | 'insufficient_hits' | 'target_not_met' | 'target_met' | 'unavailable'
export interface CoachingVerification {
  status: CoachingVerificationStatus
  label: string
  detail: string
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
  verification?: CoachingVerification
}

const count = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0
function verification(stat: CoachingDrillStat): CoachingVerification | undefined {
  if (stat.measurement === undefined && stat.progress_status === undefined) return undefined
  const unavailable: CoachingVerification = { status: 'unavailable', label: 'Match measurement unavailable', detail: 'No usable match measurement is available for this task.' }
  const status = stat.progress_status
  if (stat.measurement !== 'pooled_hits_latest_eligible_ranked' || status === 'unavailable'
    || !['waiting_for_matches', 'insufficient_hits', 'target_not_met', 'target_met'].includes(status ?? '')
    || stat.matches_needed !== 3 || stat.minimum_hits !== 80 || !count(stat.current_matches) || stat.current_matches > 3
    || !count(stat.current_hits) || !count(stat.current_numerator) || stat.current_numerator > stat.current_hits
    || typeof stat.window_started_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(stat.window_started_at) || !Number.isFinite(Date.parse(stat.window_started_at))) return unavailable
  if (status === 'waiting_for_matches' && stat.current_matches >= 3
    || status === 'insufficient_hits' && (stat.current_matches !== 3 || stat.current_hits >= 80)
    || (status === 'target_not_met' || status === 'target_met') && (stat.current_matches !== 3 || stat.current_hits < 80 || !finite(stat.current_pct))) return unavailable
  const label = status === 'waiting_for_matches' ? `Waiting for matches (${stat.current_matches}/3)`
    : status === 'insufficient_hits' ? `Not enough hit data (${stat.current_hits}/80 hits)`
      : status === 'target_met' ? 'Target met in this window' : 'Target not met in this window'
  return { status: status as CoachingVerificationStatus, label,
    detail: `Combines hit counts from the latest 3 eligible ranked Valorant matches on your main account after this task was assigned. At least 80 total hits are required. Measured counts: ${stat.current_numerator}/${stat.current_hits} hits. Match statistics and trainer scores are tracked separately.` }
}

/** Compact stat line for a match-stats drill, or null when the stat is missing or malformed. */
export function coachingStatLine(stat: CoachingDrillStat | null | undefined): CoachingStatLine | null {
  if (!stat) return null
  const label = (stat.label ?? '').trim()
  const check = verification(stat)
  if (!finite(stat.baseline_pct) || !finite(stat.target_pct)) {
    return check?.status === 'unavailable' ? { text: label ? `${label} measurement` : 'Match measurement', trend: null, verification: check } : null
  }
  const target = check ? `${stat.better === 'lower' ? 'at most' : 'at least'} ${formatStatPct(stat.target_pct)}` : formatStatPct(stat.target_pct)
  const parts = [`${label ? `${label} ` : ''}${formatStatPct(stat.baseline_pct)} → target ${target}`]
  let trend: CoachingStatLine['trend'] = null
  if (finite(stat.current_pct) && check?.status !== 'unavailable') {
    // A rounded display value can cross the target line; only the server's outcome determines the label.
    const shown = Number.parseFloat(formatStatPct(stat.current_pct))
    const roundedLooksMet = stat.better === 'lower' ? shown <= stat.target_pct : shown >= stat.target_pct
    const boundary = check?.status === 'target_not_met' && roundedLooksMet
    const observation = boundary ? `just ${stat.better === 'lower' ? 'above' : 'below'} target` : formatStatPct(stat.current_pct)
    parts.push(`${check ? 'observed' : 'now'} ${observation}`)
    if (formatStatPct(stat.current_pct) === formatStatPct(stat.baseline_pct)) trend = 'same'
    else {
      const up = stat.current_pct > stat.baseline_pct
      trend = (stat.better === 'lower' ? !up : up) ? 'better' : 'worse'
    }
  }
  if (check && !['target_met', 'target_not_met'].includes(check.status)) trend = null
  return { text: parts.join(' · '), trend, ...(check ? { verification: check } : {}) }
}
