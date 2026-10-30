/**
 * Valorant rank from the Riot client's own MMR endpoint (`pd.{shard}/mmr/v1/players/{puuid}`),
 * the same call the game makes at match end.
 *
 * Field names follow the publicly documented response (valapidocs.techchrism.me, "MMR" endpoint);
 * we have not yet captured a real body (see the dev capture). So every field is optional and
 * type-checked, and anything not listed here is ignored.
 *
 * Rank shields: Riot documents no shield field (valapidocs Player MMR + Competitive Updates).
 * We derive them from competitive-update history instead (see `deriveRankShields`), and only
 * report a count when the history proves it. If a live body ever carries a field named like
 * shield/protect, `findProtectionField` reads that instead.
 */
import { resolveTierName } from './riot-lookup-tables'

export interface ValorantRankLive {
  puuid: string
  /** Riot competitive tier 0–27 (0–2 = unranked). */
  tier: number
  tierName: string
  /** Ranked rating within the tier. Above 100 only at Immortal/Radiant. Null when unknown. */
  rr: number | null
  /** RR change from the latest competitive game. */
  lastChange: number | null
  seasonId: string | null
  /** Placement games still needed this act, when Riot reports it. */
  placementsLeft: number | null
  state: 'ranked' | 'placements' | 'unranked'
  lastMatchId: string | null
  fetchedAt: number
  source: 'riot_client'
  /** Rank shields left (0–2) when known for certain; null when unknown or not in a Tier 1 division. */
  shields: number | null
}

type Row = Record<string, unknown>
const obj = (v: unknown): Row | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null)
const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null
const str = (v: unknown, max = 80): string | null => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null)

export const MAX_TIER = 27
/** Generous upper bound for Radiant RR; protects against garbage, not a game rule. */
export const MAX_RR = 2000

export function parseValorantMmr(raw: unknown, ownPuuid: string | null, now = Date.now(), updates?: unknown): ValorantRankLive | null {
  const body = obj(raw)
  if (!body || !ownPuuid) return null
  const subject = str(body.Subject, 64)
  if (!subject || subject.toLowerCase() !== ownPuuid.toLowerCase()) return null

  const latest = obj(body.LatestCompetitiveUpdate)
  const competitive = obj(obj(body.QueueSkills)?.competitive)
  const seasonId = str(latest?.SeasonID, 64)
  const seasonal = seasonId ? obj(obj(competitive?.SeasonalInfoBySeasonID)?.[seasonId]) : null

  const tier = int(latest?.TierAfterUpdate, 0, MAX_TIER) ?? int(seasonal?.CompetitiveTier, 0, MAX_TIER) ?? 0
  const rrAfter = int(latest?.RankedRatingAfterUpdate, 0, MAX_RR)
  const rr = rrAfter ?? int(seasonal?.RankedRating, 0, MAX_RR)
  const lastChange = int(latest?.RankedRatingEarned, -MAX_RR, MAX_RR)
  const placementsLeft = int(competitive?.CurrentSeasonGamesNeededForRating, 0, 50)

  const ranked = tier >= 3
  const state: ValorantRankLive['state'] = ranked ? 'ranked' : placementsLeft && placementsLeft > 0 ? 'placements' : 'unranked'
  return {
    puuid: subject,
    tier,
    tierName: resolveTierName(tier),
    rr: ranked ? rr : null,
    lastChange: ranked ? lastChange : null,
    seasonId,
    placementsLeft,
    state,
    lastMatchId: str(latest?.MatchID, 64),
    fetchedAt: now,
    source: 'riot_client',
    shields: ranked ? shieldsFor(raw, updates, tier) : null,
  }
}

function shieldsFor(raw: unknown, updates: unknown, tier: number): number | null {
  const direct = findProtectionField(raw)
  if (direct) return direct.value
  const derived = deriveRankShields(parseCompetitiveUpdates(updates), tier)
  return derived.certain ? derived.shields : null
}

// ---------------------------------------------------------------------------
// Rank shields (patch 10.01+): entering Tier 1 of a rank grants 2 shields. In that
// division a loss at 0 RR uses one shield and keeps the rank; with none left, a loss at
// 0 RR drops a division. Shields don't refill while you stay in Tier 1. Radiant has none.
// ---------------------------------------------------------------------------

export const RANK_SHIELDS_ON_ENTRY = 2
const RADIANT_TIER = 27

/** Tier 1 division of a rank that has shields: Iron 1 (3), Bronze 1 (6) … Immortal 1 (24). */
export function isShieldTier(tier: number): boolean {
  return Number.isInteger(tier) && tier >= 3 && tier < RADIANT_TIER && (tier - 3) % 3 === 0
}

export interface CompetitiveUpdate {
  matchId: string
  startTime: number
  tierBefore: number
  tierAfter: number
  rrBefore: number
  rrAfter: number
  rrEarned: number
}

/** `pd/mmr/v1/players/{puuid}/competitiveupdates` → valid rows, oldest first. */
export function parseCompetitiveUpdates(raw: unknown): CompetitiveUpdate[] | null {
  const matches = obj(raw)?.Matches
  if (!Array.isArray(matches)) return null
  const rows: CompetitiveUpdate[] = []
  for (const m of matches) {
    const r = obj(m)
    const row = r && {
      matchId: str(r.MatchID, 64),
      startTime: int(r.MatchStartTime, 0, Number.MAX_SAFE_INTEGER),
      tierBefore: int(r.TierBeforeUpdate, 0, MAX_TIER),
      tierAfter: int(r.TierAfterUpdate, 0, MAX_TIER),
      rrBefore: int(r.RankedRatingBeforeUpdate, 0, MAX_RR),
      rrAfter: int(r.RankedRatingAfterUpdate, 0, MAX_RR),
      rrEarned: int(r.RankedRatingEarned, -MAX_RR, MAX_RR),
    }
    // A row we can't read breaks the chain, so the whole answer becomes uncertain.
    if (!row || Object.values(row).some(v => v == null)) return null
    rows.push(row as CompetitiveUpdate)
  }
  return rows.sort((a, b) => a.startTime - b.startTime)
}

export type RankShields = { certain: true; shields: number } | { certain: false }

/**
 * Shields left in the current division, from competitive-update history. Certain only when the
 * match that entered this Tier 1 division is in the window and every match since is consistent.
 */
export function deriveRankShields(updates: CompetitiveUpdate[] | null, currentTier: number): RankShields {
  if (!updates?.length || !isShieldTier(currentTier)) return { certain: false }
  // Ranked games only: placements and unrated noise have tierBefore 0.
  const ranked = updates.filter(u => u.tierBefore > 0 && u.tierAfter > 0)
  if (!ranked.length || ranked[ranked.length - 1].tierAfter !== currentTier) return { certain: false }

  // Walk back to the match that moved the player into this division.
  let entry = -1
  for (let i = ranked.length - 1; i >= 0; i--) {
    if (ranked[i].tierAfter !== currentTier) return { certain: false }
    if (ranked[i].tierBefore !== currentTier) { entry = i; break }
  }
  if (entry < 0) return { certain: false } // entered before the window: count unknown

  let shields = RANK_SHIELDS_ON_ENTRY
  for (let i = entry + 1; i < ranked.length; i++) {
    const u = ranked[i]
    if (u.tierBefore !== currentTier || u.tierAfter !== currentTier) return { certain: false }
    const protectedLoss = u.rrBefore === 0 && u.rrAfter === 0 && u.rrEarned < 0
    if (protectedLoss) {
      if (shields === 0) return { certain: false } // should have dropped a division: data disagrees
      shields -= 1
    }
  }
  return { certain: true, shields }
}

let loggedProtectionField: string | null = null
/** A shield count Riot sends directly, if a live body ever has one (logged once by name). */
export function findProtectionField(raw: unknown, depth = 0): { name: string; value: number } | null {
  const o = obj(raw)
  if (!o || depth > 6) return null
  for (const [k, v] of Object.entries(o)) {
    if (/shield|protect/i.test(k) && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= RANK_SHIELDS_ON_ENTRY) {
      if (loggedProtectionField !== k) { loggedProtectionField = k; console.log(`[Rank] Riot MMR has a protection field: ${k}`) }
      return { name: k, value: v }
    }
    const nested = findProtectionField(v, depth + 1)
    if (nested) return nested
  }
  return null
}

/** Same rank, same RR, same season: nothing new to store. */
export function sameRank(a: ValorantRankLive | null, b: ValorantRankLive | null): boolean {
  if (!a || !b) return false
  return a.puuid === b.puuid && a.tier === b.tier && a.rr === b.rr && a.seasonId === b.seasonId && a.lastMatchId === b.lastMatchId
    && (a.shields ?? null) === (b.shields ?? null)
}

/**
 * Raw body for the dev capture: keep the user's own MMR body as-is (it holds only their PUUID),
 * but drop anything that looks like a token in case Riot ever echoes one.
 */
export function sanitizeMmrCapture(raw: unknown): unknown {
  const jwt = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/
  const walk = (v: unknown, depth: number): unknown => {
    if (depth > 12) return '[depth]'
    if (typeof v === 'string') return jwt.test(v) ? '[redacted]' : v
    if (Array.isArray(v)) return v.map(x => walk(x, depth + 1))
    if (v && typeof v === 'object') {
      const out: Row = {}
      for (const [k, x] of Object.entries(v as Row)) {
        out[k] = /token|authorization|entitlement|cookie/i.test(k) ? '[redacted]' : walk(x, depth + 1)
      }
      return out
    }
    return v
  }
  return walk(raw, 0)
}
