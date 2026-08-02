/**
 * Death trade / spacing flags for coaching.
 * isolated (elsewhere) = alliesNearby === 0 (spacing only).
 * untraded / farFromTeam require a living teammate who could partner up.
 */
export const TRADE_AFTER_DEATH_MS = 3000

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

function worldDistance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return Math.sqrt(dx * dx + dy * dy)
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
 * True when an ally kills the player's killer within TRADE_AFTER_DEATH_MS (same round),
 * or kills any enemy who dies within trade radius of the death location (proximity fallback).
 */
export function deathWasTraded(
  death: TradeTimelineEvent & { killerPuuid?: string },
  subsequentKills: TradeTimelineEvent[],
  allyPuids: Set<string>,
  tradeRadiusWorld: number = 2500,
): boolean {
  const t0 = death.videoOffsetMs
  if (t0 == null || death.round == null) return false
  const killer = death.killerPuuid?.toLowerCase()
  const deathWorld = death.spatial?.victimWorld

  for (const k of subsequentKills) {
    if (k.round !== death.round || k.videoOffsetMs == null) continue
    const dt = k.videoOffsetMs - t0
    if (dt <= 0 || dt > TRADE_AFTER_DEATH_MS) continue
    const kKiller = k.killerPuuid?.toLowerCase()
    if (!kKiller || !allyPuids.has(kKiller)) continue
    if (killer && k.victimPuuid?.toLowerCase() === killer) return true
    if (deathWorld && k.spatial?.victimWorld) {
      const dist = worldDistance(
        deathWorld.x,
        deathWorld.y,
        k.spatial.victimWorld.x,
        k.spatial.victimWorld.y,
      )
      if (dist <= tradeRadiusWorld) return true
    }
  }
  return false
}

/** Spacing issue with a living partner available. */
export function farFromTeam(s: TradeFlagSpatial): boolean {
  return (s.alliesNearby ?? 0) === 0 && (s.alliesAlive ?? 0) >= 1
}

/** Untraded death with a living partner available. */
export function isUntradedDeath(s: TradeFlagSpatial): boolean {
  return s.traded !== true && (s.alliesAlive ?? 0) >= 1
}
