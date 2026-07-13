/**
 * Per-game VOD adapter contract.
 *
 * The VOD review viewer used to hardcode Valorant/CS2 assumptions (puuid-keyed
 * agent portraits, spike plant/defuse, rounds). Each game now supplies an
 * adapter so the composables and components stay game-agnostic:
 *  - Valorant / CS2: round-based, agent portraits keyed by puuid, spike events.
 *  - Deadlock / LoL: continuous match timeline, portraits keyed by name/hero.
 */

export type VodGameId = 'valorant' | 'cs2' | 'deadlock' | 'lol'

/** Every event kind the timeline can render across all games. */
export type VodEventKind =
  | 'kill'
  | 'death'
  | 'neutral'
  | 'plant'
  | 'defuse'
  | 'detonation'
  | 'dragon'
  | 'baron'
  | 'herald'
  | 'tower'
  | 'inhibitor'
  | 'ace'
  | 'multikill'

/** A reference to a player inside a timeline event. */
export interface VodPlayerRef {
  name?: string | null
  puuid?: string | null
}

/**
 * Resolved roster used to turn a player reference into a portrait.
 * `bySummonerName` keys are tag-stripped + lower-cased (see {@link tagStripLower}).
 */
export interface VodPlayerLookup {
  byPuuid: Map<string, string | null>
  bySummonerName: Map<string, string | null>
  /** The local player's own agent/champion (timeline.agent). */
  ownAgent: string | null
}

export interface VodLegendItem {
  kind: VodEventKind
  label: string
  /** Tailwind background class for the legend dot. */
  dotClass: string
}

export interface VodGameAdapter {
  id: VodGameId
  label: string
  /** Round-based (Valorant/CS2) vs continuous match timeline (Deadlock/LoL). */
  supportsRounds: boolean
  /** UI noun for a timeline segment: "Round" vs "Moment". */
  timelineUnitLabel: string
  /** Baseline sync nudge (ms) applied when the user hasn't adjusted offsets. */
  defaultSyncMs: number
  /** Non kill/death event kinds this game surfaces (gates legend + UI). */
  extraEventKinds: VodEventKind[]
  /** Resolve a portrait image URL for a player reference; '' when unknown. */
  portraitImageFor: (ref: VodPlayerRef, lookup: VodPlayerLookup) => string
  /** Transport-bar legend chips for this game. */
  legend: VodLegendItem[]
}

/** Lower-cased identity token with any Riot `#tag` stripped. */
export function tagStripLower(value: string | null | undefined): string {
  return (value ?? '').split('#', 1)[0]!.trim().toLowerCase()
}

/** A minimal team roster row needed to build a {@link VodPlayerLookup}. */
export interface VodRosterEntry {
  summonerName?: string | null
  agent?: string | null
  puuid?: string | null
}

/** Build the portrait lookup maps from a team snapshot + own agent. */
export function buildPlayerLookup(
  roster: VodRosterEntry[] | null | undefined,
  ownAgent: string | null | undefined,
): VodPlayerLookup {
  const byPuuid = new Map<string, string | null>()
  const bySummonerName = new Map<string, string | null>()
  for (const p of roster ?? []) {
    if (p.puuid) byPuuid.set(p.puuid, p.agent ?? null)
    const nameKey = tagStripLower(p.summonerName)
    if (nameKey) bySummonerName.set(nameKey, p.agent ?? null)
  }
  return { byPuuid, bySummonerName, ownAgent: ownAgent ?? null }
}
