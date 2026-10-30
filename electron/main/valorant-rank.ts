/**
 * Keeps the player's Valorant rank fresh from the Riot client and tells the API.
 * Triggers: app start, window focus (at most every 2 min), and the `ares-mmr` push at match end.
 * The last good rank is saved locally per UpForge user so Home can say "last seen 3h ago"
 * when the Riot client is closed.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseValorantMmr, sameRank, sanitizeMmrCapture, type ValorantRankLive } from './valorant-mmr'

export const RANK_REFRESH_MIN_MS = 2 * 60_000
export type RankTrigger = 'start' | 'focus' | 'match_end' | 'manual'

export interface StoredRank { userId: number; rank: ValorantRankLive }

export interface RankServiceDeps {
  /** Raw MMR body for the signed-in Riot account, or null when the Riot client isn't available. */
  fetchMmr: () => Promise<{ puuid: string; raw: unknown; updates?: unknown } | null>
  /** POST to the API; resolve false on failure (never throws). */
  postSnapshot: (rank: ValorantRankLive) => Promise<boolean>
  notify: (rank: ValorantRankLive) => void
  currentUserId: () => number | null
  read: () => StoredRank | null
  write: (value: StoredRank | null) => void
  now?: () => number
}

export class ValorantRankService {
  private lastFetchAt = 0
  private inflight: Promise<ValorantRankLive | null> | null = null
  private posted: ValorantRankLive | null = null

  constructor(private readonly deps: RankServiceDeps) {}

  private now(): number { return this.deps.now ? this.deps.now() : Date.now() }

  /** Last known rank for the signed-in user (live or saved), or null. */
  current(): ValorantRankLive | null {
    const userId = this.deps.currentUserId()
    const stored = this.deps.read()
    if (!stored || userId == null || stored.userId !== userId) return null
    return stored.rank
  }

  async refresh(trigger: RankTrigger): Promise<ValorantRankLive | null> {
    if (this.inflight) return this.inflight
    const throttled = trigger === 'start' || trigger === 'focus'
    if (throttled && this.now() - this.lastFetchAt < RANK_REFRESH_MIN_MS) return this.current()
    this.inflight = this.run().finally(() => { this.inflight = null })
    return this.inflight
  }

  private async run(): Promise<ValorantRankLive | null> {
    const userId = this.deps.currentUserId()
    if (userId == null) return null
    this.lastFetchAt = this.now()
    let fetched: { puuid: string; raw: unknown; updates?: unknown } | null = null
    try { fetched = await this.deps.fetchMmr() } catch { fetched = null }
    const rank = fetched ? parseValorantMmr(fetched.raw, fetched.puuid, this.now(), fetched.updates) : null
    if (!rank) return this.current()

    const previous = this.current()
    this.deps.write({ userId, rank })
    this.deps.notify(rank)
    if (!sameRank(rank, this.posted) && !sameRank(rank, previous)) {
      if (await this.deps.postSnapshot(rank)) this.posted = rank
    } else if (!this.posted) {
      this.posted = rank
    }
    return rank
  }
}

/** File-backed store for the last rank (no tokens; the user's own PUUID and rank only). */
export function fileRankStore(file: string): Pick<RankServiceDeps, 'read' | 'write'> {
  return {
    read() {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as StoredRank
        return parsed && typeof parsed.userId === 'number' && parsed.rank && typeof parsed.rank.tier === 'number' ? parsed : null
      } catch { return null }
    },
    write(value) {
      try {
        if (!value) { fs.rmSync(file, { force: true }); return }
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, JSON.stringify(value))
      } catch { /* best effort */ }
    },
  }
}

/**
 * Dev-only: save one raw MMR body so we can check which fields Riot really sends
 * (e.g. whether any rank-protection field exists). Returns the file path.
 */
export async function captureMmrBody(
  fetchMmr: RankServiceDeps['fetchMmr'],
  dir: string,
  now = Date.now(),
): Promise<{ ok: true; file: string; fields: string[] } | { ok: false; error: string }> {
  const fetched = await fetchMmr().catch(() => null)
  if (!fetched) return { ok: false, error: 'Open Valorant (or the Riot Client) and sign in, then try again.' }
  const body = sanitizeMmrCapture(fetched.raw)
  const file = path.join(dir, `mmr-${new Date(now).toISOString().replace(/[:.]/g, '-')}.json`)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ capturedAt: new Date(now).toISOString(), endpoint: 'pd/mmr/v1/players/{puuid}', body }, null, 2))
  return { ok: true, file, fields: listFieldPaths(body) }
}

/** Every key path in the body (for a quick "is there a protection field?" check). */
export function listFieldPaths(value: unknown, prefix = '', out: string[] = [], depth = 0): string[] {
  if (depth > 8 || !value || typeof value !== 'object') return out
  if (Array.isArray(value)) { if (value.length) listFieldPaths(value[0], `${prefix}[]`, out, depth + 1); return out }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    // Season IDs are map keys; collapse them so the list stays readable.
    const key = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(k) ? '{seasonId}' : k
    const p = prefix ? `${prefix}.${key}` : key
    if (!out.includes(p)) out.push(p)
    listFieldPaths(v, p, out, depth + 1)
  }
  return out
}
