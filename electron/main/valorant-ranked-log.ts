/**
 * Rolling log of the player's own ranked Valorant games, built from the Riot client's
 * competitive updates (each fetch returns the last 20). Kept per UpForge user, capped,
 * so session and pace features can use more than 20 games over time. Local only.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { CompetitiveUpdate } from './valorant-mmr'

/** Hard cap so the file never grows without bound. */
export const RANKED_LOG_MAX = 300

export interface RankedGame {
  matchId: string
  /** Match start, epoch ms. */
  startTime: number
  tierAfter: number
  rrAfter: number
  /** RR change from this game; > 0 win, < 0 loss, 0 draw or unknown. */
  rrEarned: number
}

export interface RankedLog { userId: number; puuid: string; games: RankedGame[] }

/** Merge new updates into the log: dedupe by match id, oldest first, keep the newest RANKED_LOG_MAX. */
export function mergeRankedGames(existing: RankedGame[], updates: CompetitiveUpdate[]): RankedGame[] {
  const byId = new Map<string, RankedGame>()
  for (const g of existing) byId.set(g.matchId, g)
  for (const u of updates) {
    byId.set(u.matchId, { matchId: u.matchId, startTime: u.startTime, tierAfter: u.tierAfter, rrAfter: u.rrAfter, rrEarned: u.rrEarned })
  }
  return [...byId.values()].sort((a, b) => a.startTime - b.startTime).slice(-RANKED_LOG_MAX)
}

function validGame(g: unknown): g is RankedGame {
  const r = g as RankedGame
  return !!r && typeof r.matchId === 'string' && r.matchId.length <= 64
    && [r.startTime, r.tierAfter, r.rrAfter, r.rrEarned].every(n => typeof n === 'number' && Number.isFinite(n))
}

export function fileRankedLogStore(file: string) {
  return {
    read(): RankedLog | null {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as RankedLog
        if (!parsed || typeof parsed.userId !== 'number' || typeof parsed.puuid !== 'string' || !Array.isArray(parsed.games)) return null
        return { userId: parsed.userId, puuid: parsed.puuid, games: parsed.games.filter(validGame).slice(-RANKED_LOG_MAX) }
      } catch { return null }
    },
    write(value: RankedLog): void {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, JSON.stringify(value))
      } catch { /* best effort */ }
    },
  }
}

/** Append updates for this user + Riot account; a different user or account starts a fresh log. */
export function appendRankedGames(
  store: ReturnType<typeof fileRankedLogStore>,
  userId: number,
  puuid: string,
  updates: CompetitiveUpdate[] | null,
): RankedGame[] {
  const current = store.read()
  const same = current && current.userId === userId && current.puuid.toLowerCase() === puuid.toLowerCase()
  const games = mergeRankedGames(same ? current!.games : [], updates ?? [])
  if (updates && updates.length) store.write({ userId, puuid, games })
  return games
}
