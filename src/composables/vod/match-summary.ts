/**
 * The few facts the match page header needs (map, agent, result, score, K/D/A), known before the
 * full timeline arrives: from the list row that was clicked, or from the last visit (stale cache).
 * Lets the v3 match page draw its real header immediately instead of a blank "Loading…".
 */
import { readCache, writeCache } from '../../lib/stale-cache'

export interface MatchSummary {
  game: string
  map: string | null
  agent: string | null
  mode: string | null
  ally: number | null
  enemy: number | null
  won: boolean | null
  kills: number | null
  deaths: number | null
  assists: number | null
}

type QueryLike = Record<string, unknown>
interface TimelineLike {
  game?: string | null
  map?: string | null
  agent?: string | null
  gameMode?: string | null
  finalScore?: { allyScore?: number; enemyScore?: number } | null
  finalStats?: { won?: boolean | null; kills?: number; deaths?: number; assists?: number } | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Stable key for a match page route: same match → same key, whatever list it was opened from. */
export function matchRouteKey(query: QueryLike): string | null {
  const one = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length < 100 ? v : null)
  const timelineId = one(query.timelineId)
  if (timelineId && /^\d+$/.test(timelineId)) return `analysis:${timelineId}`
  const archiveId = one(query.archiveId)
  if (archiveId) return `archive:${archiveId}`
  const id = one(query.id)
  return id ? `recording:${id}` : null
}

export function summaryFromTimeline(t: TimelineLike | null | undefined): MatchSummary | null {
  if (!t) return null
  const won = typeof t.finalStats?.won === 'boolean' ? t.finalStats.won : null
  const ally = num(t.finalScore?.allyScore)
  const enemy = num(t.finalScore?.enemyScore)
  return {
    game: t.game || 'valorant',
    map: t.map ?? null,
    agent: t.agent ?? null,
    mode: t.gameMode ?? null,
    ally,
    enemy,
    won: won ?? (ally != null && enemy != null && ally !== enemy ? ally > enemy : null),
    kills: num(t.finalStats?.kills),
    deaths: num(t.finalStats?.deaths),
    assists: num(t.finalStats?.assists),
  }
}

/** A list row (local recording / cloud file / analysis) → summary, using its own match data only. */
export function summaryFromRow(row: { game?: string | null; map?: string | null; agent?: string | null; gameMode?: string | null; timeline?: TimelineLike | null }): MatchSummary {
  const fromTimeline = summaryFromTimeline(row.timeline ?? null)
  return {
    ...(fromTimeline ?? { ally: null, enemy: null, won: null, kills: null, deaths: null, assists: null }),
    game: row.game || fromTimeline?.game || 'valorant',
    map: row.map ?? fromTimeline?.map ?? null,
    agent: row.agent ?? fromTimeline?.agent ?? null,
    mode: row.gameMode ?? fromTimeline?.mode ?? null,
  } as MatchSummary
}

const cacheKey = (k: string) => `match-summary:${k}`

export function rememberMatchSummary(key: string | null, summary: MatchSummary | null): void {
  if (key && summary) writeCache(cacheKey(key), summary)
}

export function recallMatchSummary(key: string | null): MatchSummary | null {
  if (!key) return null
  return readCache<MatchSummary>(cacheKey(key))?.value ?? null
}
