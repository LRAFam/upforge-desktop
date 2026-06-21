import type { AnalysisItem, DeadlockAnalysisItem } from '../env.d.ts'

function parseDeadlockWon(result: string | null): boolean | null {
  if (!result) return null
  const r = result.toLowerCase()
  if (r === 'win' || r === 'victory' || r === '1') return true
  if (r === 'loss' || r === 'defeat' || r === '2') return false
  return null
}

/** Map Deadlock demo analyses into the shared dashboard AnalysisItem shape. */
export function mapDeadlockToAnalysisItem(a: DeadlockAnalysisItem): AnalysisItem {
  const rating = a.overall_rating
  return {
    id: a.id,
    job_id: a.job_id,
    status: a.status,
    map: null,
    agent: a.hero,
    game_mode: 'DEADLOCK',
    won: parseDeadlockWon(a.match_result),
    kills: a.kills,
    deaths: a.deaths,
    assists: a.assists,
    kda: a.kd_ratio,
    combat_score: null,
    overall_score: rating != null ? (rating > 10 ? rating / 10 : rating) : null,
    rounds_won: null,
    rounds_lost: null,
    hs_pct: null,
    rank: null,
    created_at: a.completed_at ?? a.created_at,
  }
}

export function formatDeadlockMatchDate(startTimeSec: number | undefined | null): string {
  if (startTimeSec == null || !Number.isFinite(startTimeSec)) return ''
  const ms = startTimeSec > 1e12 ? startTimeSec : startTimeSec * 1000
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' })
}

export function fmtDeadlockNW(n: number): string {
  if (!n) return '0'
  return (n / 1000).toFixed(1) + 'k'
}

export function fmtDeadlockDuration(secs: number): string {
  if (!secs) return '0:00'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
