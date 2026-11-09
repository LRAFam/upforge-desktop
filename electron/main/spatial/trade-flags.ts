/**
 * Death trade / spacing flags for coaching.
 * isolated (elsewhere) = alliesNearby === 0 (spacing only).
 * untraded / farFromTeam require a living teammate who could partner up.
 */
/** Valorant trade window. */
export const TRADE_AFTER_DEATH_MS = 3000
/** CS2 trade window: one window everywhere for CS2 (KAST, round facts, spatial events). */
export const CS2_TRADE_AFTER_DEATH_MS = 5000

export function tradeWindowMs(game: string | null | undefined): number {
  return game === 'cs2' ? CS2_TRADE_AFTER_DEATH_MS : TRADE_AFTER_DEATH_MS
}

export type TradeFlagSpatial = {
  alliesNearby?: number
  alliesAlive?: number
  traded?: boolean
}

export type TradeTimelineEvent = {
  victimPuuid?: string
  killerPuuid?: string
  videoOffsetMs?: number
  round?: number
  spatial?: {
    victimWorld?: { x: number; y: number }
  }
}

/**
 * Living allies (excl. player) just before the death at `deathIndex`
 * in a round-ordered kill list (same round only).
 */
export function countAlliesAliveAtDeath(
  roundEvents: TradeTimelineEvent[],
  deathIndex: number,
  playerPuuid: string,
  allyPuids: Set<string>,
): number {
  const player = playerPuuid.toLowerCase()
  const alive = new Set(
    [...allyPuids]
      .map((p) => p.toLowerCase())
      .filter((p) => p && p !== player),
  )
  const ordered = roundEvents
    .map((ev, index) => ({ ev, index }))
    .sort((a, b) => {
      const dt = (a.ev.videoOffsetMs ?? 0) - (b.ev.videoOffsetMs ?? 0)
      return dt !== 0 ? dt : a.index - b.index
    })

  for (const { ev, index } of ordered) {
    if (index === deathIndex) break
    const v = ev.victimPuuid?.toLowerCase()
    if (v) alive.delete(v)
  }
  return alive.size
}

/**
 * True when an ally kills the player's killer within `windowMs` (same round; Valorant 3 s by default).
 * One trade rule everywhere (AI service services/trade_claims.py): killing some other enemy near
 * the body is not a trade.
 * Null when the killer, round or death time is unknown — "unknown" must never read as untraded.
 */
export function deathWasTraded(
  death: TradeTimelineEvent & { killerPuuid?: string },
  subsequentKills: TradeTimelineEvent[],
  allyPuids: Set<string>,
  windowMs: number = TRADE_AFTER_DEATH_MS,
): boolean | null {
  const t0 = death.videoOffsetMs
  const killer = death.killerPuuid?.toLowerCase()
  if (t0 == null || death.round == null || !killer) return null

  return subsequentKills.some((k) => {
    if (k.round !== death.round || k.videoOffsetMs == null) return false
    const dt = k.videoOffsetMs - t0
    const kKiller = k.killerPuuid?.toLowerCase()
    return dt > 0 && dt <= windowMs && !!kKiller && allyPuids.has(kKiller)
      && k.victimPuuid?.toLowerCase() === killer
  })
}

/**
 * Trades can only be judged when the kill list covers other players and we know who the
 * allies are. Without that every death would read as "untraded" — leave it unmeasured.
 */
export function tradesMeasurable(
  kills: ReadonlyArray<{ killerPuuid?: string; victimPuuid?: string }>,
  own: string,
  allyPuids: ReadonlySet<string>,
): boolean {
  const me = own.toLowerCase()
  const others = (p?: string) => !!p && p.toLowerCase() !== me
  return [...allyPuids].some(p => p !== me) && kills.some(k => others(k.killerPuuid) && others(k.victimPuuid))
}

/** Spacing issue with a living partner available. */
export function farFromTeam(s: TradeFlagSpatial): boolean {
  return (s.alliesNearby ?? 0) === 0 && (s.alliesAlive ?? 0) >= 1
}

/**
 * Untraded death with a living partner available. A last-alive death (no teammate alive) or an
 * unmeasured trade is never "untraded".
 */
export function isUntradedDeath(s: TradeFlagSpatial): boolean {
  return s.traded === false && (s.alliesAlive ?? 0) >= 1
}
