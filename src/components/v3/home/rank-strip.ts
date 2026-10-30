/** Home rank strip: turns the live/saved Riot rank (or the last synced snapshot) into display text. */

export interface LiveRank {
  tier: number
  tierName: string
  rr: number | null
  lastChange: number | null
  placementsLeft: number | null
  state: 'ranked' | 'placements' | 'unranked'
  fetchedAt: number
  /** Rank shields left when known for certain (Tier 1 divisions only), else null/absent. */
  shields?: number | null
}

/** Newest entry of `/api/stats/rr-history` (oldest-first list). */
export interface SyncedRank { date: string; rank: string | null; rr: number | null }

export interface RankStripView {
  kind: 'ranked' | 'placements' | 'unranked'
  rankName: string
  rr: number | null
  /** Fill for the 0–100 RR bar; null when there's no RR to show. */
  rrPct: number | null
  change: string | null
  changeTone: 'win' | 'loss' | null
  freshness: string
  stale: boolean
  /** "2 rank shields" / "1 rank shield" / "No rank shields left"; null when unknown. */
  shields: string | null
}

/** Whole-number shield copy, or null when the count isn't known for certain. */
export function shieldLabel(n: number | null | undefined): string | null {
  if (n == null || !Number.isInteger(n) || n < 0 || n > 2) return null
  if (n === 0) return 'No rank shields left'
  return `${n} rank ${n === 1 ? 'shield' : 'shields'}`
}

/** Live reads count as fresh for this long; after that we say when we last saw it. */
export const LIVE_FRESH_MS = 10 * 60_000

export function ago(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000))
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d} ${d === 1 ? 'day' : 'days'} ago`
}

export function rankStripView(live: LiveRank | null, synced: SyncedRank | null, now = Date.now()): RankStripView | null {
  if (live) {
    const age = now - live.fetchedAt
    const stale = age > LIVE_FRESH_MS
    const freshness = stale ? `Last seen ${ago(age)} · open Valorant to refresh` : `Updated ${ago(age)}`
    if (live.state === 'placements') {
      const n = live.placementsLeft ?? 0
      return { kind: 'placements', rankName: 'Placements', rr: null, rrPct: null, change: null, changeTone: null,
        freshness: n > 0 ? `${n} placement ${n === 1 ? 'game' : 'games'} left · ${freshness}` : freshness, stale, shields: null }
    }
    if (live.state === 'unranked') {
      return { kind: 'unranked', rankName: 'Unranked', rr: null, rrPct: null, change: null, changeTone: null, freshness, stale, shields: null }
    }
    const rr = live.rr
    const c = live.lastChange
    return {
      kind: 'ranked', rankName: live.tierName, rr,
      rrPct: rr == null ? null : Math.max(0, Math.min(100, rr)),
      change: c == null || c === 0 ? null : `${c > 0 ? '+' : '−'}${Math.abs(c)} RR`,
      changeTone: c == null || c === 0 ? null : c > 0 ? 'win' : 'loss',
      freshness, stale,
      shields: shieldLabel(live.shields),
    }
  }
  if (synced?.rank) {
    const t = new Date(synced.date).getTime()
    const when = Number.isFinite(t) ? ago(now - t) : 'earlier'
    const rr = typeof synced.rr === 'number' ? synced.rr : null
    return {
      kind: 'ranked', rankName: synced.rank, rr, rrPct: rr == null ? null : Math.max(0, Math.min(100, rr)),
      change: null, changeTone: null,
      freshness: `From your last synced match, ${when} · open Valorant to refresh`, stale: true,
      shields: null,
    }
  }
  return null
}
