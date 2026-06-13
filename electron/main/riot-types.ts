/**
 * riot-types.ts
 * TypeScript interfaces for the Riot Local API data model.
 * Extracted from riot-local-api.ts to keep type definitions separate from network I/O.
 */

export interface GameEvent {
  EventID: number
  EventName: string
  EventTime: number
}

/** A kill/death event — populated from Riot MatchDetails API post-match */
export interface KillEvent extends GameEvent {
  EventName: 'ChampionKill'
  killerName: string
  victimName: string
  assistants: string[]
  /** Milliseconds since game start — from Riot MatchDetails timeSinceGameStartMillis */
  timeSinceGameStartMillis?: number
  /** Offset from recording start in ms — use this to seek video to the kill */
  videoOffsetMs?: number
  /** Weapon/damage type (e.g. "Vandal", "Ability", "Ultimate", "Spike") */
  weapon?: string
  /** valorant-api ability slot when weapon is Ability/Ultimate (grenade, ability1, ability2, ultimate) */
  abilitySlot?: 'grenade' | 'ability1' | 'ability2' | 'ultimate'
  /** Raw PUUIDs for backend resolution */
  killerPuuid?: string
  victimPuuid?: string
  /** Which round this kill occurred in (0-indexed) */
  round?: number
  /** Minimap position + callout (from Riot victimLocation + zone pack). */
  spatial?: import('./spatial/types').KillSpatial
}

/** Spike planted event — includes site (A/B/C) and who planted */
export interface SpikePlantedEvent extends GameEvent {
  EventName: 'SpikePlanted'
  planter: string
  planterPuuid?: string
  site: string
  round?: number
  /** Riot world coordinates of the spike plant. */
  plantLocation?: { x: number; y: number }
  /** Ms since match gameplay start (for VOD seek). */
  gameTimeMs?: number
  videoOffsetMs?: number
}

/** Spike defused event — who defused */
export interface SpikeDefusedEvent extends GameEvent {
  EventName: 'SpikeDefused'
  defuser: string
  round?: number
  gameTimeMs?: number
  videoOffsetMs?: number
}

/** Spike detonated event */
export interface SpikeDetonatedEvent extends GameEvent {
  EventName: 'SpikeDetonated'
  round?: number
  gameTimeMs?: number
  videoOffsetMs?: number
}

/** First blood event */
export interface FirstBloodEvent extends GameEvent {
  EventName: 'FirstBlood'
  killerName: string
  victimName: string
  killerPuuid?: string
  victimPuuid?: string
  /** 0-indexed round (R1 = 0) */
  round?: number
}

/** Ability state for a single ability slot */
export interface AbilityState {
  displayName: string
  charges: number | null
  /** For ultimates: current ult points */
  currentPoints?: number | null
  /** For ultimates: points needed to charge ult */
  maxPoints?: number | null
}

/** Snapshot of all abilities at a given moment */
export interface PlayerAbilities {
  ability1: AbilityState | null
  ability2: AbilityState | null
  grenade: AbilityState | null
  signature: AbilityState | null
  ultimate: AbilityState | null
}

/** Snapshot of the local player's stats at a specific round boundary */
export interface RoundPlayerStats {
  kills: number
  deaths: number
  assists: number
  score: number
}

/** Summary of a single completed round */
export interface RoundSummary {
  roundNumber: number
  /** The team that won — "ORDER" or "CHAOS", or null if unknown */
  winningTeam: string | null
  /** How the round ended: Elimination, BombDefused, BombDetonated, etc. */
  ceremony: string | null
  endTime: number
  /** Player's cumulative stats at the end of this round */
  playerStats: RoundPlayerStats | null
  /** Was the spike planted this round? */
  spikePlanted: boolean
  /** Which site was the spike planted on */
  spikeSite: string | null
  /** Who planted the spike */
  spikePlanter: string | null
  /** Was the spike defused? */
  spikeDefused: boolean
  /** Who defused the spike */
  spikeDefuser: string | null
  /** Did the spike detonate? */
  spikeDetonated: boolean
  /** Player's economy (credits) at round end */
  playerGold: number | null
  /** Player's ability states captured at round end */
  playerAbilities: PlayerAbilities | null
  /** Did the player get first blood this round? */
  playerGotFirstBlood: boolean
  /** Was the player the first blood victim? */
  playerWasFirstBlood: boolean
  /** Credits spent on loadout at round start */
  playerSpent: number | null
  /** Total loadout value at round start */
  playerLoadoutValue: number | null
  /** Weapon carried this round (resolved display name) */
  playerWeapon: string | null
  /** Armor type this round (e.g. "Light Shields", "Heavy Shields") */
  playerArmor: string | null
}

/** Per-player stats snapshot for the full team — captured at match end */
export interface TeamPlayerSnapshot {
  summonerName: string
  agent: string | null
  team: string
  kills: number
  deaths: number
  assists: number
  /** Average combat score (ACS) for the match */
  score: number
  level: number
  /** Player's PUUID — used for "you" identification in renderer */
  puuid: string | null
  /** Valorant competitive tier number (0 = Unranked … 27 = Radiant) */
  competitiveTier: number
  /** Human-readable rank string e.g. "Gold 2", "Immortal 1", "Radiant" */
  competitiveTierName: string
  /** Ability cast counts from match details */
  abilityCasts: {
    grenade: number   // C slot
    ability1: number  // Q slot
    ability2: number  // E slot (signature)
    ultimate: number  // X slot
  } | null
}

/** Final match stats for the local player, captured at match end */
export interface FinalPlayerStats {
  kills: number
  deaths: number
  assists: number
  /** Average combat score (ACS) for the match */
  score: number
  /** Riot display name (gameName#tagLine) */
  summonerName: string | null
  /** Agent played */
  agent: string | null
  team: string | null
  level: number
  /** Headshot percentage across the match (0–100, one decimal place) */
  headshotPct: number | null
  /** Average damage per round across the match */
  adr: number | null
  /** Player's Riot account level */
  accountLevel: number | null
}

/** Round score snapshot captured from presence polling */
export interface RoundScore {
  allyScore: number
  enemyScore: number
  /** Epoch ms when this score was detected */
  detectedAt: number
}

/** Final match score (rounds won per team). */
export interface DerivedMatchScore {
  allyScore: number
  enemyScore: number
}

/** Lockfile credentials from Riot Client */
export interface LockfileData {
  port: number
  password: string
}

/** Presence-derived session state */
export interface SessionState {
  sessionLoopState: 'MENUS' | 'PREGAME' | 'INGAME' | string
  queueId: string | null
  matchMap: string | null
  allyScore: number
  enemyScore: number
  /** True when the client is playing back a replay rather than a live match */
  isReplay: boolean
}

/** Full enriched match data — superset of MatchTimeline */
export interface MatchData {
  game: string

  // Identity
  /** Riot match UUID — from WebSocket ares-match-details event */
  matchId: string | null
  /** Player's PUUID */
  puuid: string | null
  /** Region for Riot PvP API (e.g. 'eu', 'na', 'ap') */
  region: string | null
  /** Raw Riot queue ID (e.g. 'competitive', 'swiftplay') */
  queueId: string | null

  // Match context
  map: string | null
  agent: string | null
  /** Normalised queue string (e.g. 'COMPETITIVE', 'SWIFTPLAY') */
  gameMode: string | null
  /** Player's Riot display name (gameName) */
  playerName: string | null
  /** Player's Riot tag (tagLine) */
  playerTag: string | null

  // Timing (critical for video frame mapping)
  /** Epoch ms when presence transitioned to INGAME (= loading screen start) */
  matchStartTime: number | null
  /**
   * Epoch ms when the actual gameplay began (buy phase of round 1).
   * This is captured by the overlay poll once round 1 is confirmed INGAME.
   * When set, videoOffsetMs uses this instead of matchStartTime so offsets
   * are relative to the start of real gameplay rather than the loading screen.
   */
  gameplayStartTime: number | null
  /** Epoch ms when recorder.start() was called */
  recordingStartTime: number
  /**
   * User- or auto-tuned ms added to the computed recording offset (negative = seek earlier).
   * Persisted so VOD review and uploads stay aligned after manual sync nudges.
   */
  videoSyncOffsetMs?: number

  // Round score progression from presence polling
  roundScores: RoundScore[]
  /** Authoritative final score derived from roundSummaries (preferred over roundScores). */
  finalScore?: DerivedMatchScore | null

  // Events (populated from Riot MatchDetails API post-match)
  events: GameEvent[]
  killEvents: KillEvent[]
  playerKills: KillEvent[]
  playerDeaths: KillEvent[]
  spikePlants: SpikePlantedEvent[]
  spikeDefuses: SpikeDefusedEvent[]
  spikeDetonations: SpikeDetonatedEvent[]
  firstBloods: FirstBloodEvent[]
  roundSummaries: RoundSummary[]
  finalStats: FinalPlayerStats | null
  teamSnapshot: TeamPlayerSnapshot[]

  /** Raw Riot MatchDetails API response — full fidelity data for AI coaching */
  matchDetails: Record<string, unknown> | null

  /** Minimap events + death patterns for AI and post-game UI. */
  spatialSummary?: import('./spatial/types').MatchSpatialSummary

  startTime: number
  endTime: number | null
}

/** @deprecated Use MatchData instead — kept for backwards compatibility */
export interface MatchTimeline {
  game: string
  map: string | null
  agent: string | null
  events: GameEvent[]
  startTime: number
  endTime: number | null
}
