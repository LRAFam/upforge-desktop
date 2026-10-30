/**
 * Pure data shaping for the v3 CS2 / Deadlock / League panels (Home setup + summary, Progress).
 * Readiness checks match the old CS2SetupPanel, Cs2ValveStatsPanel, DeadlockStatsPanel,
 * DeadlockDemoPanel and LolStatsPanel. Real data only — nothing here invents a value.
 */
import type { DeadlockProfileStats, LolMatchSummary } from '../../../env.d.ts'

export type DemoGame = 'cs2' | 'deadlock' | 'lol'

export interface DemoFile { name: string; path: string; sizeBytes: number; modifiedAt: number }
export interface FileList { files: DemoFile[]; dir: string | null; exists: boolean }

export interface Cs2Average { value: number | null; matches: number }
export interface Cs2Profile {
  identity: { steam_display_name: string | null; steam_id: string | null; linked: boolean }
  valve_stats: {
    matches_tracked: number
    avg_kd: number | null
    premier_rating: number | null
    map_breakdown: Array<{ map: string; matches: number; kd?: number | null; win_rate?: number | null }>
    /** Measured per-match averages (match_stats v1). Absent on older API builds. */
    averages?: { kd: Cs2Average; adr: Cs2Average; headshot_pct: Cs2Average; kast_pct: Cs2Average }
    opening_duels?: { won: number; lost: number; win_rate: number | null; matches: number }
    clutches?: { won: number; attempted: number; matches: number }
    recent?: Array<{ at: string; map: string | null; kd: number | null; adr: number | null; won: boolean | null }>
  }
  faceit?: { connected: boolean; elo?: number | null; elo_change?: number | null; synced_at?: string | null }
}
export interface Cs2Faceit { connected: boolean; nickname?: string; elo?: number | null; level?: number | null }

export type SetupAction = 'cs2_steam_name' | 'cs2_detect_folder' | 'deadlock_link' | 'lol_link'

export interface SetupStep { title: string; text: string; done: boolean }
export interface SetupState {
  ready: boolean
  /** One sentence: what's missing. Empty when ready. */
  missing: string
  steps: SetupStep[]
  /** The single primary action for the first undone step (null when ready). */
  action: SetupAction | null
  actionLabel: string
  /** Honest note on when demo coaching unlocks (CS2 / Deadlock only). */
  note: string
}

export const GAME_NAME: Record<DemoGame, string> = { cs2: 'CS2', deadlock: 'Deadlock', lol: 'League' }
export const GAME_ACCENT: Record<DemoGame, string> = {
  cs2: 'var(--uf-game-cs2)',
  deadlock: 'var(--uf-game-deadlock)',
  lol: 'var(--uf-game-lol)',
}

const CS2_NOTE = 'CS2 coaching unlocks once a match has its demo and the rich match stats from it. A recording on its own is not enough.'
const DEADLOCK_NOTE = 'Deadlock coaching unlocks once a match has its replay and the rich match stats from it. A recording on its own is not enough.'

function firstUndone(steps: SetupStep[]): number {
  return steps.findIndex(s => !s.done)
}

/** CS2 is set up when the Steam name is set (so demos can find you) and the demo folder exists. */
export function cs2Setup(profile: Cs2Profile | null, demos: FileList | null): SetupState {
  const named = !!profile?.identity?.linked
  const folder = !!demos?.exists
  const steps: SetupStep[] = [
    { title: 'Set your Steam name', text: 'So UpForge can find you in demo files.', done: named },
    { title: 'Find the demo folder', text: 'Where CS2 saves match replays on this PC.', done: folder },
    { title: 'Attach the demo', text: 'After a match, attach its demo to the recording.', done: false },
  ]
  const ready = named && folder
  const i = firstUndone(steps)
  const missing = ready ? '' : !named && !folder
    ? 'CS2 needs your Steam name and the demo folder before the coach can read a match.'
    : !named ? 'CS2 needs your Steam name before the coach can match you in a demo.'
      : 'CS2 needs the demo folder on this PC before demos can be attached.'
  return {
    ready,
    missing,
    steps,
    action: ready ? null : i === 0 ? 'cs2_steam_name' : 'cs2_detect_folder',
    actionLabel: ready ? '' : i === 0 ? 'Set Steam name' : 'Detect demo folder',
    note: CS2_NOTE,
  }
}

/** Deadlock is set up when the Steam account is linked (stats come from it). The replay folder is a step, not a blocker. */
export function deadlockSetup(linked: boolean, replays: FileList | null): SetupState {
  const folder = !!replays?.exists
  const steps: SetupStep[] = [
    { title: 'Link your Steam account', text: 'Stats sync from your Steam profile. Search by your Steam display name.', done: linked },
    { title: 'Play a match', text: folder ? 'Replays save to this PC after each match.' : 'Deadlock saves a replay after each match.', done: folder },
    { title: 'Attach the replay', text: 'Attach it to the recording for a kill timeline and clips.', done: false },
  ]
  return {
    ready: linked,
    missing: linked ? '' : 'Deadlock needs your Steam account linked before your stats and rank can sync.',
    steps,
    action: linked ? null : 'deadlock_link',
    actionLabel: linked ? '' : 'Link Steam',
    note: DEADLOCK_NOTE,
  }
}

/** League is set up when a Riot ID is linked. */
export function lolSetup(linked: boolean): SetupState {
  const steps: SetupStep[] = [
    { title: 'Link your Riot account', text: 'On the web, so ranked matches can sync.', done: linked },
    { title: 'Play ranked', text: 'Ranked Solo/Duo matches sync on their own.', done: false },
    { title: 'Read the match report', text: 'Each synced match gets a Riot match report.', done: false },
  ]
  return {
    ready: linked,
    missing: linked ? '' : 'League needs your Riot account linked before ranked matches can sync.',
    steps,
    action: linked ? null : 'lol_link',
    actionLabel: linked ? '' : 'Link Riot',
    note: '',
  }
}

// ── Deadlock rank history ───────────────────────────────────────────────────

export const DEADLOCK_TIERS = ['Obscurus', 'Initiate', 'Seeker', 'Alchemist', 'Arcanist', 'Ritualist', 'Emissary', 'Archon', 'Oracle', 'Phantom', 'Ascendant', 'Eternus'] as const

export interface DeadlockRankPoint {
  badge: number; tier: number; sub: number | null; name: string; label: string; score: number
  /** Unix seconds of the match that set this rank, when the API sent it. */
  at?: number
}

/** Decode a Deadlock rank badge (tier × 10 + subtier, as the API sends it). */
export function deadlockRank(badge: number): DeadlockRankPoint | null {
  if (!Number.isFinite(badge) || badge < 0) return null
  const tier = Math.floor(badge / 10)
  const rawSub = badge % 10
  const name = DEADLOCK_TIERS[tier]
  if (!name) return null
  const sub = rawSub >= 1 && rawSub <= 6 ? rawSub : null
  // Continuous score: 6 subtiers per tier, so the line steps evenly across tier boundaries.
  const score = tier * 6 + (sub ? sub - 1 : 0)
  return { badge, tier, sub, name, label: sub ? `${name} ${sub}` : name, score }
}

type RankRow = { rank?: number | null; start_time?: number | null }
type RankedMatch = { ranked_display_badge?: number | null; start_time?: number | null }

/**
 * Rank line, oldest → newest, skipping unranked/null entries.
 * Uses mmr_history; when it carries start_time we sort by it (no ordering assumption), otherwise
 * we keep the old "newest first" reading. When mmr_history is empty, the rank badge each recent
 * match reports (ranked_display_badge) is used instead, so ranked players still get a dated line.
 */
export function deadlockRankSeries(
  history: RankRow[] | null | undefined,
  recentMatches?: RankedMatch[] | null,
): DeadlockRankPoint[] {
  const toPoint = (badge: number | null | undefined, at: number | null | undefined): DeadlockRankPoint | null => {
    if (badge == null || badge <= 0) return null
    const p = deadlockRank(badge)
    return p ? (typeof at === 'number' && at > 0 ? { ...p, at } : p) : null
  }
  const rows = history ?? []
  if (rows.length) {
    // Oldest first. The API returns newest first (DeadlockService::newestFirst); prefer explicit times or match ids.
    const dated = rows.every(h => typeof h.start_time === 'number')
    const byMatch = rows.every(h => typeof (h as { match_id?: unknown }).match_id === 'number')
    const ordered = dated
      ? [...rows].sort((a, b) => (a.start_time as number) - (b.start_time as number))
      : byMatch
        ? [...rows].sort((a, b) => ((a as { match_id: number }).match_id) - ((b as { match_id: number }).match_id))
        : [...rows].reverse()
    return ordered.map(h => toPoint(h.rank, h.start_time)).filter((p): p is DeadlockRankPoint => p !== null)
  }
  return [...(recentMatches ?? [])]
    .filter(m => typeof m.start_time === 'number')
    .sort((a, b) => (a.start_time as number) - (b.start_time as number))
    .map(m => toPoint(m.ranked_display_badge, m.start_time))
    .filter((p): p is DeadlockRankPoint => p !== null)
}

export function formatRankDate(at: number | undefined): string {
  if (!at) return ''
  return new Date(at * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function rankSentence(series: DeadlockRankPoint[]): string {
  if (series.length < 2) return ''
  const first = series[0]
  const last = series[series.length - 1]
  const n = series.length
  const since = first.at ? ` since ${formatRankDate(first.at)}` : ''
  const span = since || ` over your last ${n} rank updates`
  if (last.score === first.score) return `Your rank has held at ${last.label}${span}.`
  const dir = last.score > first.score ? 'up' : 'down'
  return `Your rank is ${dir} from ${first.label} to ${last.label}${span}.`
}

/** SVG polyline points for an index-based line (no dates in mmr_history). */
export function stepLine(scores: number[], width: number, height: number, pad = 6): Array<{ x: number; y: number }> {
  if (scores.length < 2) return []
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const span = max - min || 1
  const step = (width - pad * 2) / (scores.length - 1)
  return scores.map((s, i) => ({
    x: Math.round((pad + i * step) * 10) / 10,
    y: Math.round((max === min ? height / 2 : pad + (1 - (s - min) / span) * (height - pad * 2)) * 10) / 10,
  }))
}

// ── Tables ──────────────────────────────────────────────────────────────────

export interface BarRow { name: string; games: number; pct: number; tone: 'win' | 'loss' | 'none'; extra: string; icon?: string | null }

/**
 * CS2 map breakdown. With a measured win rate the bar is the win rate (win/loss tone) and the K/D
 * goes alongside; older API builds send only counts, so the bar falls back to share of matches.
 */
export function cs2MapRows(breakdown: Cs2Profile['valve_stats']['map_breakdown'] | null | undefined, limit = 6): BarRow[] {
  const rows = (breakdown ?? []).filter(r => r.matches > 0)
  const total = rows.reduce((s, r) => s + r.matches, 0)
  if (!total) return []
  return [...rows].sort((a, b) => b.matches - a.matches).slice(0, limit).map((r) => {
    const wr = typeof r.win_rate === 'number' ? Math.round(r.win_rate) : null
    return {
      name: formatCs2Map(r.map),
      games: r.matches,
      pct: wr ?? Math.round((r.matches / total) * 100),
      tone: wr == null ? 'none' : wr >= 50 ? 'win' : 'loss',
      extra: typeof r.kd === 'number' ? `K/D ${r.kd.toFixed(2)}` : '',
    }
  })
}

/** True when the map rows carry win rates (so the table head can say "Win rate", not "Share"). */
export function cs2MapsHaveWinRate(breakdown: Cs2Profile['valve_stats']['map_breakdown'] | null | undefined): boolean {
  return (breakdown ?? []).some(r => typeof r.win_rate === 'number')
}

export function formatCs2Map(map: string): string {
  const base = map.replace(/^(de|cs|ar)_/i, '')
  return base.charAt(0).toUpperCase() + base.slice(1)
}

export function deadlockHeroRows(stats: DeadlockProfileStats | null, limit = 6): BarRow[] {
  const insights = new Map((stats?.meta_insights ?? []).map(m => [m.hero_id, m]))
  return [...(stats?.hero_stats ?? [])].filter(h => h.matches_played > 0)
    .sort((a, b) => b.matches_played - a.matches_played).slice(0, limit).map(h => {
      const wr = Math.round(h.win_rate)
      const d = insights.get(h.hero_id)?.delta_vs_meta
      return {
        name: h.hero_name,
        games: h.matches_played,
        pct: wr,
        tone: wr >= 50 ? 'win' : 'loss',
        extra: d == null ? '' : `${d > 0 ? '+' : ''}${d}% vs meta`,
        icon: h.hero_icon,
      }
    })
}

export interface LolSummary { games: number; wins: number; losses: number; winRate: number; kda: string }

export function lolSummary(matches: LolMatchSummary[]): LolSummary | null {
  if (!matches.length) return null
  const wins = matches.filter(m => m.win).length
  const k = matches.reduce((s, m) => s + m.kills, 0)
  const d = matches.reduce((s, m) => s + m.deaths, 0)
  const a = matches.reduce((s, m) => s + m.assists, 0)
  return {
    games: matches.length,
    wins,
    losses: matches.length - wins,
    winRate: Math.round((wins / matches.length) * 100),
    kda: d > 0 ? ((k + a) / d).toFixed(2) : (k + a).toFixed(1),
  }
}

export function lolChampionRows(matches: LolMatchSummary[], limit = 6): BarRow[] {
  const by = new Map<string, LolMatchSummary[]>()
  for (const m of matches) {
    if (!m.champion) continue
    by.set(m.champion, [...(by.get(m.champion) ?? []), m])
  }
  return [...by.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, limit).map(([name, rows]) => {
    const s = lolSummary(rows)!
    return { name, games: s.games, pct: s.winRate, tone: s.winRate >= 50 ? 'win' : 'loss', extra: `${s.kda} KDA` }
  })
}

// ── Files ───────────────────────────────────────────────────────────────────

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatAge(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms)
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

// ── Hero numbers ────────────────────────────────────────────────────────────

export interface StatItem { value: string; caption: string; sub?: string; tone?: 'win' | 'loss' }

/** CS2: only numbers the API actually sent. FACEIT and Premier appear only when present. */
export function cs2Stats(profile: Cs2Profile | null, faceit: Cs2Faceit | null): StatItem[] {
  const v = profile?.valve_stats
  const out: StatItem[] = []
  const over = (n: number) => `Over ${n} match${n === 1 ? '' : 'es'}`
  if (v?.matches_tracked) {
    out.push({ value: String(v.matches_tracked), caption: 'Matches tracked', sub: 'In UpForge' })
    if (v.avg_kd != null) out.push({ value: v.avg_kd.toFixed(2), caption: 'Average K/D' })
    const a = v.averages
    if (a?.adr.value != null) out.push({ value: a.adr.value.toFixed(0), caption: 'ADR', sub: over(a.adr.matches) })
    if (a?.headshot_pct.value != null) out.push({ value: `${Math.round(a.headshot_pct.value)}%`, caption: 'Headshot kills', sub: over(a.headshot_pct.matches) })
    if (a?.kast_pct.value != null) out.push({ value: `${Math.round(a.kast_pct.value)}%`, caption: 'KAST', sub: over(a.kast_pct.matches) })
    const o = v.opening_duels
    if (o?.win_rate != null) {
      out.push({ value: `${Math.round(o.win_rate)}%`, caption: 'Opening duels won', sub: `${o.won} of ${o.won + o.lost}`, tone: o.win_rate >= 50 ? 'win' : 'loss' })
    }
  }
  if (v?.premier_rating != null) out.push({ value: v.premier_rating.toLocaleString('en-GB'), caption: 'Premier rating' })
  if (faceit?.connected && faceit.elo != null) {
    const change = profile?.faceit?.elo_change
    const delta = typeof change === 'number' && change !== 0 ? ` · ${change > 0 ? '+' : '−'}${Math.abs(change)} since last sync` : ''
    out.push({
      value: String(faceit.elo),
      caption: 'FACEIT Elo',
      sub: (faceit.level ? `Level ${faceit.level}` : '') + delta || undefined,
      tone: typeof change === 'number' && change !== 0 ? (change > 0 ? 'win' : 'loss') : undefined,
    })
  }
  return out
}

/** Fields the API already sends that the shared env.d.ts type doesn't list yet (see notes-game-deadlock.md). */
interface DeadlockSummaryExtra { avg_net_worth?: number | null; percentiles?: { kda?: number | null; net_worth?: number | null } | null }
interface DeadlockMatchExtra { last_hits?: number | null; denies?: number | null }

function percentileSub(p: number | null | undefined): string | undefined {
  if (typeof p !== 'number' || !Number.isFinite(p)) return undefined
  return `Higher than ${Math.round(p)}% of players`
}

export function deadlockStats(stats: DeadlockProfileStats | null): StatItem[] {
  const s = stats?.summary as (DeadlockProfileStats['summary'] & DeadlockSummaryExtra) | undefined
  if (!s || s.wins + s.losses === 0) return []
  const wr = Math.round(s.win_rate)
  const out: StatItem[] = [
    { value: `${s.wins}–${s.losses}`, caption: 'Record', sub: `Last ${s.wins + s.losses} matches` },
    { value: `${wr}%`, caption: 'Win rate', tone: wr >= 50 ? 'win' : 'loss' },
    { value: String(s.avg_kda), caption: 'KDA', sub: percentileSub(s.percentiles?.kda) },
  ]
  if (typeof s.avg_net_worth === 'number' && s.avg_net_worth > 0) {
    out.push({ value: `${(s.avg_net_worth / 1000).toFixed(1)}k`, caption: 'Average souls', sub: percentileSub(s.percentiles?.net_worth) })
  }
  const lh = deadlockFarm(stats)
  if (lh) out.push({ value: String(lh.lastHits), caption: 'Soul orbs secured per match', sub: `${lh.denies} denied · over ${lh.matches} ${lh.matches === 1 ? 'match' : 'matches'}` })
  return out
}

/**
 * Average soul orbs secured / denied over recent matches that report them. deadlock-api still names
 * these `last_hits` / `denies` (the scoreboard columns), but since the Feb 2025 update troopers need no
 * last hit: the counts are orbs you secured or denied by shooting.
 */
export function deadlockFarm(stats: DeadlockProfileStats | null): { lastHits: number; denies: number; matches: number } | null {
  const rows = (stats?.recent_matches ?? []) as Array<DeadlockProfileStats['recent_matches'][number] & DeadlockMatchExtra>
  const counted = rows.filter(m => typeof m.last_hits === 'number' && typeof m.denies === 'number')
  if (!counted.length) return null
  const avg = (k: 'last_hits' | 'denies') => Math.round(counted.reduce((n, m) => n + (m[k] as number), 0) / counted.length)
  return { lastHits: avg('last_hits'), denies: avg('denies'), matches: counted.length }
}

export function lolStats(summary: LolSummary | null): StatItem[] {
  if (!summary) return []
  return [
    { value: `${summary.wins}–${summary.losses}`, caption: 'Record', sub: `Last ${summary.games} ranked` },
    { value: `${summary.winRate}%`, caption: 'Win rate', tone: summary.winRate >= 50 ? 'win' : 'loss' },
    { value: summary.kda, caption: 'KDA' },
  ]
}
