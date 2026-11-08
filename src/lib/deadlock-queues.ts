/**
 * Deadlock queues and ranked seasons for Progress.
 *
 * Queues: Ranked, Standard and Street Brawl play differently (Street Brawl is a short separate mode),
 * so mixing them makes records and averages meaningless. Player feedback, Nov 2026.
 * Seasons: a new ranked season moves every player's rank (Beta Season 2, 5 Nov 2026), so the rank
 * line marks it instead of calling it a drop.
 */
import type { DeadlockRankPoint, StatItem } from '../components/v3/games/game-data'

export type DeadlockQueue = 'ranked' | 'standard' | 'street_brawl' | 'other'
export type DeadlockQueueTab = DeadlockQueue | 'all'

export const DEADLOCK_QUEUE_LABEL: Record<DeadlockQueueTab, string> = {
  all: 'All', ranked: 'Ranked', standard: 'Standard', street_brawl: 'Street Brawl', other: 'Other',
}

/** The match-history fields this file reads (deadlock-api passes them through the UpForge API). */
export interface DeadlockQueueMatch {
  queue?: string | null
  game_mode?: number | null
  match_mode?: number | null
  match_result?: number | null
  player_team?: number | null
  player_match_outcome?: number | null
  player_kills?: number | null
  player_deaths?: number | null
  player_assists?: number | null
  net_worth?: number | null
  last_hits?: number | null
  match_duration_s?: number | null
}

export interface DeadlockSeason { name: string; start_time: number; end_time?: number | null }

/** deadlock-api enums: match_mode 1 Unranked (Standard), 4 Ranked; game_mode 4 Street Brawl. */
export function deadlockQueueOf(m: DeadlockQueueMatch): DeadlockQueue {
  if (m.queue === 'ranked' || m.queue === 'standard' || m.queue === 'street_brawl' || m.queue === 'other') return m.queue
  if (m.game_mode === 4) return 'street_brawl'
  if (m.match_mode === 4) return 'ranked'
  if (m.match_mode === 1) return 'standard'
  return 'other'
}

/**
 * Whether the player won. `match_result` is the WINNING TEAM (0 or 1), not the player's result, so it
 * only means a win when it equals `player_team`. Same rule as the API's DeadlockService::matchWon.
 */
export function deadlockMatchWon(m: DeadlockQueueMatch): boolean | null {
  if (typeof m.player_match_outcome === 'number' && m.player_match_outcome !== 0) return m.player_match_outcome === 1
  if (typeof m.match_result === 'number' && typeof m.player_team === 'number') return m.match_result === m.player_team
  return null
}

const ORDER: DeadlockQueue[] = ['ranked', 'standard', 'street_brawl', 'other']

/** Tabs for the queues the player actually played, plus All when there's more than one. */
export function deadlockQueueTabs(matches: DeadlockQueueMatch[]): Array<{ key: DeadlockQueueTab; label: string; count: number }> {
  const counts = new Map<DeadlockQueue, number>()
  for (const m of matches) counts.set(deadlockQueueOf(m), (counts.get(deadlockQueueOf(m)) ?? 0) + 1)
  const tabs = ORDER.filter(q => counts.has(q)).map(q => ({ key: q as DeadlockQueueTab, label: DEADLOCK_QUEUE_LABEL[q], count: counts.get(q) as number }))
  return tabs.length > 1 ? [...tabs, { key: 'all', label: DEADLOCK_QUEUE_LABEL.all, count: matches.length }] : tabs
}

/** Ranked when the player has any ranked matches, else the queue they play most. */
export function defaultDeadlockQueue(matches: DeadlockQueueMatch[]): DeadlockQueueTab {
  const tabs = deadlockQueueTabs(matches).filter(t => t.key !== 'all')
  if (!tabs.length) return 'all'
  if (tabs.some(t => t.key === 'ranked')) return 'ranked'
  return [...tabs].sort((a, b) => b.count - a.count)[0].key
}

export function filterDeadlockQueue<T extends DeadlockQueueMatch>(matches: T[], queue: DeadlockQueueTab): T[] {
  return queue === 'all' ? matches : matches.filter(m => deadlockQueueOf(m) === queue)
}

/** Matches shorter than this (remakes, early abandons) are left out of per-minute averages. */
const MIN_RATE_SECONDS = 300

/**
 * Record, win rate, KDA and per-minute farm for one queue. Souls and orbs are per minute because
 * match length varies 20–50 minutes: a long loss would otherwise out-soul a short stomp.
 */
export function deadlockQueueStats(matches: DeadlockQueueMatch[], queue: DeadlockQueueTab): StatItem[] {
  const rows = filterDeadlockQueue(matches, queue)
  const results = rows.map(deadlockMatchWon).filter((w): w is boolean => w !== null)
  if (!results.length) return []
  const wins = results.filter(Boolean).length
  const losses = results.length - wins
  const wr = Math.round((wins / results.length) * 100)
  const sum = (k: 'player_kills' | 'player_deaths' | 'player_assists') => rows.reduce((n, m) => n + (m[k] ?? 0), 0)
  const deaths = sum('player_deaths')
  const kda = ((sum('player_kills') + sum('player_assists')) / Math.max(1, deaths)).toFixed(2)
  const where = queue === 'all' ? 'all modes' : DEADLOCK_QUEUE_LABEL[queue]
  const out: StatItem[] = [
    { value: `${wins}–${losses}`, caption: 'Record', sub: `Last ${results.length} · ${where}` },
    { value: `${wr}%`, caption: 'Win rate', tone: wr >= 50 ? 'win' : 'loss' },
    { value: kda, caption: 'KDA' },
  ]
  const timed = rows.filter(m => typeof m.match_duration_s === 'number' && m.match_duration_s >= MIN_RATE_SECONDS)
  const perMin = (k: 'net_worth' | 'last_hits') => {
    const ok = timed.filter(m => typeof m[k] === 'number')
    if (!ok.length) return null
    return { value: ok.reduce((n, m) => n + (m[k] as number) / ((m.match_duration_s as number) / 60), 0) / ok.length, n: ok.length }
  }
  const souls = perMin('net_worth')
  if (souls) out.push({ value: String(Math.round(souls.value)), caption: 'Souls per minute', sub: `Average of ${souls.n} ${souls.n === 1 ? 'match' : 'matches'}` })
  const orbs = perMin('last_hits')
  if (orbs) out.push({ value: orbs.value.toFixed(1), caption: 'Soul orbs secured per minute' })
  return out
}

export interface DeadlockSeasonView {
  /** Points to draw, oldest first. */
  series: DeadlockRankPoint[]
  /** Index in `series` of the first match in the new season; a marker line is drawn there. */
  markerAt: number | null
  sentence: string
  /** Line colour: rising / falling within one season, neutral across a season reset. */
  tone: 'win' | 'loss' | 'none'
  /** True when every point is from the current season. */
  seasonOnly: boolean
}

function fmtDay(at: number): string {
  return new Date(at * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function compare(series: DeadlockRankPoint[]): { dir: 'up' | 'down' | 'held'; first: DeadlockRankPoint; last: DeadlockRankPoint } {
  const first = series[0]
  const last = series[series.length - 1]
  return { dir: last.score > first.score ? 'up' : last.score < first.score ? 'down' : 'held', first, last }
}

/**
 * Splits the rank line at the current season's start. With 2+ ranked matches this season, only those
 * are drawn and compared. With fewer, the whole line is drawn with a marker at the reset and the
 * sentence says the season moved the rank, never that the player dropped.
 */
export function deadlockSeasonView(series: DeadlockRankPoint[], season: DeadlockSeason | null | undefined, fallbackSentence: string): DeadlockSeasonView {
  const plain = (): DeadlockSeasonView => {
    const tone = series.length >= 2 ? (series[series.length - 1].score >= series[0].score ? 'win' : 'loss') : 'none'
    return { series, markerAt: null, sentence: fallbackSentence, tone, seasonOnly: false }
  }
  const start = season?.start_time
  if (!start || series.length < 2 || !series.every(p => typeof p.at === 'number')) return plain()
  const firstNew = series.findIndex(p => (p.at as number) >= start)
  if (firstNew === 0) return plain() // the whole line is this season
  const name = season?.name || 'A new ranked season'
  const day = fmtDay(start)
  if (firstNew === -1) {
    return { series, markerAt: null, sentence: `${name} started on ${day}. This line is from last season; play ranked matches to start your new one.`, tone: 'none', seasonOnly: false }
  }
  const now = series.slice(firstNew)
  if (now.length >= 2) {
    const c = compare(now)
    const tail = c.dir === 'held' ? `your rank has held at ${c.last.label}` : `your rank is ${c.dir} from ${c.first.label} to ${c.last.label}`
    return { series: now, markerAt: null, sentence: `${name} started on ${day}. Since then ${tail}.`, tone: c.dir === 'down' ? 'loss' : 'win', seasonOnly: true }
  }
  return {
    series,
    markerAt: firstNew,
    sentence: `${name} started on ${day} and reset every rank. The change at the dashed line is the reset, not your play.`,
    tone: 'none',
    seasonOnly: false,
  }
}
