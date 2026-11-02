import type { AnalysisItem, Cs2AnalysisItem } from '../env.d.ts'

function sourceLabel(source: Cs2AnalysisItem['source']): string {
  if (source === 'desktop_vod') return 'VOD'
  if (source === 'faceit_api') return 'FACEIT'
  return 'Demo'
}

/** The CS2 coach rating is 1–10; the shared AnalysisItem overall_score is 0–100 (shown as "Coach rating 7/10"). */
export function cs2RatingTo100(rating: number | null | undefined): number | null {
  if (rating == null || !Number.isFinite(rating)) return null
  return rating <= 10 ? Math.round(rating * 10) : Math.min(100, Math.round(rating))
}

/**
 * Round score from the stored `match_stats.score`: desktop/v1 stats write "ours-theirs" from the
 * player's side ("13-9", "13–9", "13:9"). Older web demos stored "CT 7 – T 9" (a side split, not
 * the player's team), which is not read as a score.
 */
export function parseCs2Score(score: string | null | undefined): { won: number; lost: number } | null {
  if (typeof score !== 'string') return null
  const m = /^\s*(\d{1,2})\s*[-–:]\s*(\d{1,2})\s*$/.exec(score)
  if (!m) return null
  return { won: Number(m[1]), lost: Number(m[2]) }
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const count = (v: unknown): number | null => (finite(v) && v >= 0 ? Math.round(v) : null)

/**
 * Rounds won/lost: the API's `rounds_won`/`rounds_lost` (2 Nov 2026+, measured, demo first), else the
 * player-side `score` string. Never the AI review's own score.
 */
export function cs2Rounds(a: Pick<Cs2AnalysisItem, 'score'> & { rounds_won?: number | null; rounds_lost?: number | null }): { won: number; lost: number } | null {
  const won = count(a.rounds_won)
  const lost = count(a.rounds_lost)
  if (won != null && lost != null && won + lost > 0) return { won, lost }
  return parseCs2Score(a.score)
}

/** ADR is only "measured" when it is above 0 (old web demos stored 0 next to real kills). */
export function cs2Adr(adr: number | null | undefined): number | null {
  return finite(adr) && adr > 0 ? Math.round(adr * 10) / 10 : null
}

const pctOf = (v: number | null | undefined): number | null => (finite(v) && v >= 0 && v <= 100 ? Math.round(v) : null)

/** Map unified CS2 analyses into the shared dashboard AnalysisItem shape. */
export function mapCs2ToAnalysisItem(a: Cs2AnalysisItem): AnalysisItem {
  const rating = a.overall_rating
  const source = a.source ?? 'demo_upload'
  const rounds = cs2Rounds(a)
  const roundsWon = rounds && rounds.won !== rounds.lost ? rounds.won > rounds.lost : null
  const adr = cs2Adr(a.adr)
  const kast = pctOf(a.kast_pct)
  const statsSource = a.stats_source === 'demo' || a.stats_source === 'desktop' || a.stats_source === 'ai' ? a.stats_source : null
  return {
    id: a.id,
    job_id: a.job_id,
    status: a.status,
    map: a.map,
    agent: a.player_name,
    game_mode: source === 'desktop_vod' ? 'CS2 VOD' : `CS2 ${sourceLabel(source)}`,
    won: typeof a.won === 'boolean' ? a.won : roundsWon,
    kills: a.kills ?? null,
    deaths: a.deaths ?? null,
    assists: a.assists ?? null,
    kda: a.kd_ratio,
    combat_score: null,
    overall_score: cs2RatingTo100(rating),
    upforge_score: a.upforge_score ?? null,
    rounds_won: rounds?.won ?? null,
    rounds_lost: rounds?.lost ?? null,
    hs_pct: pctOf(a.headshot_pct),
    rank: null,
    created_at: a.completed_at ?? a.created_at,
    cs2_source: source,
    ...(adr != null || kast != null || statsSource ? { cs2_stats: { adr, kast_pct: kast, source: statsSource } } : {}),
  }
}

/** CS2-only stat items after K/D/A for a header line: ADR and KAST when measured. */
export function cs2StatItems(a: Pick<AnalysisItem, 'cs2_stats'>): Array<{ value: string; label: string }> {
  const s = a.cs2_stats
  if (!s) return []
  const out: Array<{ value: string; label: string }> = []
  if (s.adr != null) out.push({ value: String(Math.round(s.adr)), label: 'ADR' })
  if (s.kast_pct != null) out.push({ value: `${s.kast_pct}%`, label: 'KAST' })
  return out
}

/**
 * Says where the numbers came from only when it changes how far to trust them: the AI review read
 * them off the video (no demo, no live match data). Demo / live match numbers need no label.
 */
export function cs2StatsSourceNote(a: Pick<AnalysisItem, 'cs2_stats'>): string | null {
  return a.cs2_stats?.source === 'ai' ? 'Stats read from the video by the AI coach (no demo for this match).' : null
}
