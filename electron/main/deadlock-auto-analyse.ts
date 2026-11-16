/**
 * Owner decision 16 Nov 2026: only Ranked Deadlock matches are analysed automatically.
 * Standard and Street Brawl (and bots, lobbies, Hero Labs…) are still recorded and keep their free
 * stats, but nothing is uploaded and no credit is used until the player taps Analyse.
 *
 * The live watcher can't tell the queue, so a match starts as the COMPETITIVE placeholder and gets
 * its real queue from match metadata a few minutes later (deadlock-recording-hero.ts). Unknown
 * queues stay automatic so a Ranked match is never held back by a metadata outage; the API refuses
 * an automatic upload whose queue it already knows is not Ranked.
 */
import { queueTypeFor } from '../../src/lib/game-queue'

export type DeadlockAutoAnalyseDecision = 'auto' | 'manual_only' | 'unknown'

/** Queue names the API uses for Deadlock (DeadlockService::queueOf). */
export type DeadlockApiQueue = 'ranked' | 'standard' | 'street_brawl' | 'other'

const PLACEHOLDER_MODES = new Set(['COMPETITIVE', 'DEADLOCK'])

function normalise(mode: string | null | undefined): string | null {
  const key = mode?.trim().toUpperCase().replace(/[\s-]+/g, '_')
  return key && !PLACEHOLDER_MODES.has(key) ? key : null
}

export function deadlockAutoAnalyseDecision(mode: string | null | undefined): DeadlockAutoAnalyseDecision {
  const key = normalise(mode)
  if (!key) return 'unknown'
  const type = queueTypeFor('deadlock', key)
  if (type === 'ranked') return 'auto'
  if (type === 'unranked') return 'manual_only'
  return 'unknown'
}

/** False only when the queue is known and is not Ranked. */
export function deadlockAllowsAutoAnalyse(mode: string | null | undefined): boolean {
  return deadlockAutoAnalyseDecision(mode) !== 'manual_only'
}

export function deadlockApiQueue(mode: string | null | undefined): DeadlockApiQueue | null {
  const key = normalise(mode)
  if (!key) return null
  if (key === 'RANKED') return 'ranked'
  if (key === 'UNRANKED' || key === 'STANDARD') return 'standard'
  if (key === 'STREET_BRAWL') return 'street_brawl'
  return queueTypeFor('deadlock', key) === 'unranked' ? 'other' : null
}

/** Activity line when an automatic analysis is skipped for a non-ranked match. */
export function deadlockManualOnlyActivity(mode: string | null | undefined): string {
  const queue = deadlockApiQueue(mode)
  const label = queue === 'street_brawl' ? 'Street Brawl' : queue === 'standard' ? 'Standard' : 'Non-ranked'
  return `Deadlock ${label} match saved with free stats — not analysed automatically. Tap Analyse to use a credit.`
}

/**
 * One queue lookup per lobby match id, shared by every automatic upload path for that match.
 * `resolve` is only called when no lookup is running yet.
 */
export class DeadlockQueueLookups {
  private readonly lookups = new Map<string, Promise<string | null>>()
  private readonly pending = new Set<string>()

  remember(matchId: number | string, lookup: Promise<string | null>): Promise<string | null> {
    const key = String(matchId)
    this.pending.add(key)
    const safe = lookup.catch(() => null).finally(() => { this.pending.delete(key) })
    this.lookups.set(key, safe)
    return safe
  }

  /** True while the queue of this match is still being looked up. */
  isPending(matchId: number | string | null | undefined): boolean {
    return matchId != null && this.pending.has(String(matchId))
  }

  queueFor(matchId: number | string, resolve: () => Promise<string | null>): Promise<string | null> {
    return this.lookups.get(String(matchId)) ?? this.remember(matchId, resolve())
  }
}
