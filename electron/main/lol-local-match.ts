/**
 * League local match report payload (`upforge.lol_local_match.v1`).
 *
 * Built only from data on the player's PC: the Live Client Data API (events + 60 s local
 * snapshots, collected while the match runs) and the League Client's end-of-game stats block
 * (`/lol-end-of-game/v1/eog-stats-block`, read once the client reaches PreEndOfGame/EndOfGame).
 * Values that are not read are sent as null — never estimated. No Electron imports (unit-tested).
 */
import type { LolAllGameData, LolLiveGameEvent, LolLivePlayer } from './lol-live-client-api'
import { normalizeLolQueueId } from './lol-lcu-api'

export const LOL_LOCAL_MATCH_SCHEMA = 'upforge.lol_local_match.v1'

/** Bounded memory: a long game has a few hundred events; snapshots are one per game minute. */
export const MAX_LOCAL_EVENTS = 500
export const MAX_LOCAL_SNAPSHOTS = 180
export const SNAPSHOT_INTERVAL_S = 60

// ── End-of-game stats block (LCU) ──────────────────────────────────────────────
// Field names follow community LCU references (no official Riot docs exist for this endpoint):
// - stats keys: LCU-Enhancement-Suite `src/electron/models/eog-stats.ts` and league-harvester
//   `harvester/model/eogStatsBlock/block.go` (CHAMPIONS_KILLED, NUM_DEATHS, ASSISTS, MINIONS_KILLED,
//   NEUTRAL_MINIONS_KILLED, GOLD_EARNED, TOTAL_DAMAGE_DEALT_TO_CHAMPIONS, TOTAL_DAMAGE_TAKEN,
//   TOTAL_DAMAGE_DEALT_TO_OBJECTIVES, VISION_SCORE, WARD_PLACED, WARD_KILLED,
//   VISION_WARDS_BOUGHT_IN_GAME, LEVEL, PERK0, WIN/LOSE).
// - shape: teams[].{teamId,isWinningTeam,isPlayerTeam,players[]}, players[].{championId,
//   championName,detectedTeamPosition,selectedPosition,items,spell1Id,spell2Id,puuid,summonerName,
//   isLocalPlayer,teamId,stats}, top-level gameId/gameLength/gameMode/queueType/localPlayer.
// VISION_SCORE / WARD_* are missing from some client versions — read when present, else null.

export type EogStats = Record<string, number | undefined>

export interface EogPlayer {
  championId?: number
  championName?: string
  detectedTeamPosition?: string
  selectedPosition?: string
  items?: number[]
  spell1Id?: number
  spell2Id?: number
  puuid?: string
  summonerId?: number
  summonerName?: string
  riotIdGameName?: string
  riotIdTagLine?: string
  gameName?: string
  tagLine?: string
  isLocalPlayer?: boolean
  botPlayer?: boolean
  teamId?: number
  stats?: EogStats
}

export interface EogTeam {
  teamId?: number
  isWinningTeam?: boolean
  isPlayerTeam?: boolean
  players?: EogPlayer[]
}

export interface EogStatsBlock {
  gameId?: number
  gameLength?: number
  gameMode?: string
  queueType?: string
  queueId?: number
  localPlayer?: EogPlayer
  teams?: EogTeam[]
}

// ── Payload ────────────────────────────────────────────────────────────────────

export type LolPosition = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY'

export interface LolLocalParticipant {
  participant_index: number
  team_id: number | null
  champion: string | null
  champion_id: number | null
  position: LolPosition | null
  riot_id: string | null
  is_local: boolean
  level: number | null
  kills: number | null
  deaths: number | null
  assists: number | null
  cs: number | null
  neutral_cs: number | null
  gold_earned: number | null
  damage_to_champions: number | null
  damage_taken: number | null
  damage_to_objectives: number | null
  vision_score: number | null
  wards_placed: number | null
  wards_killed: number | null
  control_wards_bought: number | null
  items: number[] | null
  summoner_spells: number[] | null
  keystone_id: number | null
}

export interface LolLocalTeam {
  team_id: number
  kills: number | null
  towers: number | null
  dragons: number | null
  barons: number | null
  heralds: number | null
  inhibitors: number | null
  grubs: number | null
}

export type LolLocalEventType =
  | 'ChampionKill' | 'DragonKill' | 'BaronKill' | 'HeraldKill' | 'TurretKilled'
  | 'InhibKilled' | 'FirstBlood' | 'Multikill' | 'Ace' | 'HordeKill'

export interface LolLocalEvent {
  t: number
  type: LolLocalEventType
  killer: string | null
  victim: string | null
  assisters: string[]
  detail: Record<string, string | number | boolean> | null
}

export interface LolLocalSnapshot {
  t: number
  level: number | null
  cs: number | null
  gold_current: number | null
  kda: [number, number, number] | null
}

export interface LolLocalMatchPayload {
  schema: typeof LOL_LOCAL_MATCH_SCHEMA
  game_id: number
  platform_id: string
  queue_id: number | null
  queue_label: string | null
  game_mode: string | null
  map_id: number | null
  game_length_s: number | null
  ended_at: string | null
  patch: string | null
  local_player: { puuid: string; riot_id: string | null; team_id: number | null; participant_index: number | null }
  winning_team_id: number | null
  participants: LolLocalParticipant[]
  teams: LolLocalTeam[]
  events: LolLocalEvent[]
  local_snapshots: LolLocalSnapshot[]
  sources: { eog: boolean; live_events: boolean; live_snapshots: boolean }
  recording_id: string | null
}

// ── Small readers ──────────────────────────────────────────────────────────────

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function int(v: unknown): number | null {
  const n = num(v)
  return n === null ? null : Math.round(n)
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Live Client team codename → Riot team id. */
export function lolTeamIdFromCodename(team: string | null | undefined): number | null {
  const t = team?.trim().toUpperCase()
  if (t === 'ORDER') return 100
  if (t === 'CHAOS') return 200
  return null
}

const POSITIONS: Record<string, LolPosition> = {
  TOP: 'TOP',
  JUNGLE: 'JUNGLE',
  MIDDLE: 'MIDDLE', MID: 'MIDDLE',
  BOTTOM: 'BOTTOM', BOT: 'BOTTOM', ADC: 'BOTTOM',
  UTILITY: 'UTILITY', SUPPORT: 'UTILITY',
}

export function normalizeLolPosition(raw: string | null | undefined): LolPosition | null {
  return POSITIONS[raw?.trim().toUpperCase() ?? ''] ?? null
}

/** "16.22.723.1234" → "16.22"; anything unparseable → null. */
export function lolPatchFromVersion(version: string | null | undefined): string | null {
  const m = /^(\d+)\.(\d+)/.exec(version?.trim() ?? '')
  return m ? `${m[1]}.${m[2]}` : null
}

/** "EUW1_7381024556" → 7381024556 (positive integer game id), else null. */
export function lolGameIdFromMatchId(matchId: string | null | undefined): number | null {
  const m = /^[A-Z0-9]{2,8}_(\d{1,20})$/i.exec(matchId?.trim() ?? '')
  if (!m) return null
  const n = Number(m[1])
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

function liveRiotId(p: { riotId?: string; riotIdGameName?: string; riotIdTagLine?: string; summonerName?: string }): string | null {
  const full = str(p.riotId)
  if (full?.includes('#')) return full
  const name = str(p.riotIdGameName)
  const tag = str(p.riotIdTagLine)
  if (name && tag) return `${name}#${tag}`
  const summoner = str(p.summonerName)
  return summoner?.includes('#') ? summoner : null
}

function eogRiotId(p: EogPlayer): string | null {
  const name = str(p.riotIdGameName) ?? str(p.gameName)
  const tag = str(p.riotIdTagLine) ?? str(p.tagLine)
  if (name && tag) return `${name}#${tag}`
  const summoner = str(p.summonerName)
  return summoner?.includes('#') ? summoner : null
}

// ── Live collector ─────────────────────────────────────────────────────────────

/** Compact copy of one Live Client roster row (the full allgamedata snapshot is never kept). */
export interface LolLiveRosterRow {
  riotId: string | null
  names: string[]
  champion: string | null
  teamId: number | null
  position: LolPosition | null
  level: number | null
  kills: number | null
  deaths: number | null
  assists: number | null
  creepScore: number | null
  items: number[] | null
  keystoneId: number | null
  isLocal: boolean
}

export interface LolLocalMatchCapture {
  /** From the LCU gameflow session at match start ("EUW1_123…"), when known. */
  matchId: string | null
  queueId: number | null
  gameMode: string | null
  mapId: number | null
  lastGameTime: number | null
  endedAt: string | null
  /** Local result from the Live Client GameEnd event (fallback when EOG is missing). */
  gameEndResult: 'win' | 'loss' | null
  roster: LolLiveRosterRow[]
  events: LolLocalEvent[]
  snapshots: LolLocalSnapshot[]
  eventsTruncated: boolean
}

const EVENT_TYPES: ReadonlySet<string> = new Set<LolLocalEventType>([
  'ChampionKill', 'DragonKill', 'BaronKill', 'HeraldKill', 'TurretKilled',
  'InhibKilled', 'FirstBlood', 'Multikill', 'Ace', 'HordeKill',
])

function rosterRow(p: LolLivePlayer, isLocal: boolean): LolLiveRosterRow {
  const names = [p.riotId, p.summonerName, p.riotIdGameName]
    .map(n => n?.trim().toLowerCase())
    .filter((n): n is string => !!n)
  const items = Array.isArray(p.items)
    ? p.items.map(i => int(i?.itemID)).filter((i): i is number => i !== null && i > 0)
    : null
  return {
    riotId: liveRiotId(p),
    names: names.filter((n, i) => names.indexOf(n) === i),
    champion: str(p.championName),
    teamId: lolTeamIdFromCodename(p.team),
    position: normalizeLolPosition(p.position),
    level: int(p.level),
    kills: int(p.scores?.kills),
    deaths: int(p.scores?.deaths),
    assists: int(p.scores?.assists),
    creepScore: int(p.scores?.creepScore),
    items,
    keystoneId: int(p.runes?.keystone?.id),
    isLocal,
  }
}

function sameIdentity(p: LolLivePlayer, riotId: string | undefined, summonerName: string | undefined): boolean {
  const id = (riotId?.trim() || summonerName?.trim() || '').toLowerCase()
  if (!id) return false
  const candidates = [p.riotId, p.summonerName].map(n => n?.trim().toLowerCase())
  return id.includes('#') ? candidates.includes(id) : candidates.some(c => c?.split('#', 1)[0] === id)
}

/**
 * Collects the Live Client timeline while a match runs: deduplicated events (capped) and one
 * local-player snapshot per game minute (capped). Keeps only compact rows, not raw snapshots.
 */
export class LolLocalMatchCollector {
  private capture: LolLocalMatchCapture = LolLocalMatchCollector.empty(null, null)
  private seenEventIds = new Set<number>()
  private lastSnapshotMinute = 0

  static empty(matchId: string | null, queueId: number | null): LolLocalMatchCapture {
    return {
      matchId, queueId, gameMode: null, mapId: null, lastGameTime: null, endedAt: null,
      gameEndResult: null, roster: [], events: [], snapshots: [], eventsTruncated: false,
    }
  }

  reset(context?: { matchId?: string | null; queueId?: number | null } | null): void {
    this.capture = LolLocalMatchCollector.empty(context?.matchId ?? null, context?.queueId ?? null)
    this.seenEventIds = new Set()
    this.lastSnapshotMinute = 0
  }

  /** Feed one /liveclientdata/allgamedata poll. */
  ingest(data: LolAllGameData, now: () => number = Date.now): void {
    const c = this.capture
    const gd = data.gameData
    if (gd) {
      c.gameMode = str(gd.gameMode) ?? c.gameMode
      c.mapId = int(gd.mapNumber) ?? c.mapId
      const gt = num(gd.gameTime)
      if (gt !== null && gt > 0) c.lastGameTime = gt
    }

    const players = data.allPlayers ?? []
    const active = data.activePlayer
    let localSeen = false
    if (players.length) {
      c.roster = players.map((p) => {
        const isLocal = !localSeen && sameIdentity(p, active?.riotId, active?.summonerName)
        if (isLocal) localSeen = true
        return rosterRow(p, isLocal)
      })
    }

    for (const evt of data.events?.Events ?? []) this.ingestEvent(evt, now)

    // One local snapshot per game minute (t = 60, 120, …). Live Client gives only the local
    // player's current gold; other players' gold over time is not available.
    const gt = num(gd?.gameTime)
    const minute = gt !== null ? Math.floor(gt / SNAPSHOT_INTERVAL_S) : 0
    if (minute > this.lastSnapshotMinute && c.snapshots.length < MAX_LOCAL_SNAPSHOTS) {
      const local = c.roster.find(r => r.isLocal) ?? null
      this.lastSnapshotMinute = minute
      c.snapshots.push({
        t: Math.round(gt!),
        level: int(active?.level) ?? local?.level ?? null,
        cs: local?.creepScore ?? null,
        gold_current: int(active?.currentGold),
        kda: local && local.kills !== null && local.deaths !== null && local.assists !== null
          ? [local.kills, local.deaths, local.assists]
          : null,
      })
    }
  }

  private ingestEvent(evt: LolLiveGameEvent, now: () => number): void {
    const c = this.capture
    if (typeof evt?.EventID === 'number') {
      if (this.seenEventIds.has(evt.EventID)) return
      this.seenEventIds.add(evt.EventID)
    }
    if (evt.EventName === 'GameEnd') {
      c.endedAt = new Date(now()).toISOString()
      const r = evt.Result?.trim().toLowerCase()
      c.gameEndResult = r === 'win' || r === 'victory' ? 'win' : r === 'lose' || r === 'loss' || r === 'defeat' ? 'loss' : null
      return
    }
    if (!EVENT_TYPES.has(evt.EventName)) return
    if (c.events.length >= MAX_LOCAL_EVENTS) {
      c.eventsTruncated = true
      return
    }
    const out = toLocalEvent(evt)
    if (out) c.events.push(out)
  }

  /** Detached copy for the end-of-match report; the collector can be reset afterwards. */
  snapshot(): LolLocalMatchCapture {
    const c = this.capture
    return {
      ...c,
      roster: c.roster.map(r => ({ ...r, names: [...r.names], items: r.items ? [...r.items] : null })),
      events: c.events.map(e => ({ ...e, assisters: [...e.assisters], detail: e.detail ? { ...e.detail } : null })),
      snapshots: c.snapshots.map(s => ({ ...s, kda: s.kda ? [...s.kda] as [number, number, number] : null })),
    }
  }
}

function parseStolen(raw: string | boolean | undefined): boolean | null {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'string') return raw.toLowerCase() === 'true'
  return null
}

/** Exported for unit tests — Live Client event → contract event (names kept as the client gave them). */
export function toLocalEvent(evt: LolLiveGameEvent): LolLocalEvent | null {
  const t = num(evt.EventTime)
  if (t === null || !EVENT_TYPES.has(evt.EventName)) return null
  const type = evt.EventName as LolLocalEventType
  const assisters = Array.isArray(evt.Assisters) ? evt.Assisters.filter(a => typeof a === 'string') : []
  const detail: Record<string, string | number | boolean> = {}
  let killer = str(evt.KillerName)
  let victim = str(evt.VictimName)
  switch (type) {
    case 'DragonKill': {
      if (str(evt.DragonType)) detail.dragon_type = evt.DragonType!.trim()
      const stolen = parseStolen(evt.Stolen)
      if (stolen !== null) detail.stolen = stolen
      break
    }
    case 'BaronKill':
    case 'HeraldKill':
    case 'HordeKill': {
      const stolen = parseStolen(evt.Stolen)
      if (stolen !== null) detail.stolen = stolen
      break
    }
    case 'TurretKilled': victim = str(evt.TurretKilled); break
    case 'InhibKilled': victim = str(evt.InhibKilled); break
    case 'FirstBlood': killer = str(evt.Recipient) ?? killer; break
    case 'Multikill': if (num(evt.KillStreak) !== null) detail.kill_streak = evt.KillStreak!; break
    case 'Ace': {
      killer = str(evt.Acer) ?? killer
      const team = lolTeamIdFromCodename(evt.AcingTeam)
      if (team !== null) detail.acing_team = team
      break
    }
    default: break
  }
  return {
    t: Math.round(t * 10) / 10,
    type,
    killer,
    victim,
    assisters,
    detail: Object.keys(detail).length ? detail : null,
  }
}

// ── Team objective counts from events ──────────────────────────────────────────

/** Turret_T1_… / Barracks_T1_… are team 100's (ORDER) structures, so they count for team 200. */
function structureOwnerTeam(name: string | null): number | null {
  const m = /_T([12])_/i.exec(name ?? '')
  if (!m) return null
  return m[1] === '1' ? 100 : 200
}

function rosterTeamOf(name: string | null, roster: LolLiveRosterRow[]): number | null {
  const n = name?.trim().toLowerCase()
  if (!n) return null
  const hits = roster.filter(r => r.names.includes(n) || r.names.some(x => x.split('#', 1)[0] === n))
  return hits.length === 1 ? hits[0]!.teamId : null
}

/** Exported for unit tests. Counts only events whose team can be resolved; null without events. */
export function countTeamObjectives(
  events: LolLocalEvent[],
  roster: LolLiveRosterRow[],
): Map<number, Omit<LolLocalTeam, 'team_id' | 'kills'>> {
  const out = new Map<number, Omit<LolLocalTeam, 'team_id' | 'kills'>>()
  const team = (id: number) => {
    if (!out.has(id)) out.set(id, { towers: 0, dragons: 0, barons: 0, heralds: 0, inhibitors: 0, grubs: 0 })
    return out.get(id)!
  }
  team(100); team(200)
  for (const e of events) {
    if (e.type === 'TurretKilled' || e.type === 'InhibKilled') {
      const owner = structureOwnerTeam(e.victim)
      if (owner === null) continue
      const scorer = owner === 100 ? 200 : 100
      if (e.type === 'TurretKilled') team(scorer).towers! += 1
      else team(scorer).inhibitors! += 1
      continue
    }
    const key = e.type === 'DragonKill' ? 'dragons'
      : e.type === 'BaronKill' ? 'barons'
        : e.type === 'HeraldKill' ? 'heralds'
          : e.type === 'HordeKill' ? 'grubs'
            : null
    if (!key) continue
    const scorer = rosterTeamOf(e.killer, roster)
    if (scorer === null) continue
    team(scorer)[key]! += 1
  }
  return out
}

// ── Payload builder ────────────────────────────────────────────────────────────

export interface LolLocalIdentity {
  puuid: string | null
  gameName: string | null
  tagLine: string | null
  platformId: string | null
  gameVersion: string | null
}

export interface BuildLolLocalMatchInput {
  capture: LolLocalMatchCapture
  eog: EogStatsBlock | null
  identity: LolLocalIdentity
  recordingId?: string | null
  now?: () => number
}

function eogPlayers(eog: EogStatsBlock | null): EogPlayer[] {
  const out: EogPlayer[] = []
  for (const team of eog?.teams ?? []) {
    for (const p of team.players ?? []) out.push({ ...p, teamId: p.teamId ?? team.teamId })
  }
  return out
}

function isEogLocal(p: EogPlayer, eog: EogStatsBlock, puuid: string | null): boolean {
  if (p.isLocalPlayer === true) return true
  if (puuid && p.puuid && p.puuid === puuid) return true
  const lp = eog.localPlayer
  if (lp?.summonerId != null && p.summonerId != null) return lp.summonerId === p.summonerId
  return false
}

function participantFromEog(
  p: EogPlayer,
  index: number,
  isLocal: boolean,
  live: LolLiveRosterRow | null,
  localRiotId: string | null,
): LolLocalParticipant {
  const s = p.stats ?? {}
  const spells = [int(p.spell1Id), int(p.spell2Id)].filter((x): x is number => x !== null && x > 0)
  const items = Array.isArray(p.items) ? p.items.map(int).filter((i): i is number => i !== null && i > 0) : null
  return {
    participant_index: index,
    team_id: int(p.teamId) ?? live?.teamId ?? null,
    champion: str(p.championName) ?? live?.champion ?? null,
    champion_id: int(p.championId),
    position: normalizeLolPosition(p.detectedTeamPosition) ?? normalizeLolPosition(p.selectedPosition) ?? live?.position ?? null,
    riot_id: isLocal ? (localRiotId ?? eogRiotId(p) ?? live?.riotId ?? null) : (eogRiotId(p) ?? live?.riotId ?? null),
    is_local: isLocal,
    level: int(s.LEVEL) ?? live?.level ?? null,
    kills: int(s.CHAMPIONS_KILLED),
    deaths: int(s.NUM_DEATHS),
    assists: int(s.ASSISTS),
    cs: int(s.MINIONS_KILLED),
    neutral_cs: int(s.NEUTRAL_MINIONS_KILLED),
    gold_earned: int(s.GOLD_EARNED),
    damage_to_champions: int(s.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS),
    damage_taken: int(s.TOTAL_DAMAGE_TAKEN),
    damage_to_objectives: int(s.TOTAL_DAMAGE_DEALT_TO_OBJECTIVES),
    vision_score: num(s.VISION_SCORE),
    wards_placed: int(s.WARD_PLACED),
    wards_killed: int(s.WARD_KILLED),
    control_wards_bought: int(s.VISION_WARDS_BOUGHT_IN_GAME),
    items: items ?? live?.items ?? null,
    summoner_spells: spells.length ? spells : null,
    keystone_id: int(s.PERK0) || (live?.keystoneId ?? null),
  }
}

/** Live-only scoreboard row (EOG unavailable): K/D/A, CS total, items, keystone — nothing else. */
function participantFromLive(r: LolLiveRosterRow, index: number, localRiotId: string | null): LolLocalParticipant {
  return {
    participant_index: index,
    team_id: r.teamId,
    champion: r.champion,
    champion_id: null,
    position: r.position,
    riot_id: r.isLocal ? (localRiotId ?? r.riotId) : r.riotId,
    is_local: r.isLocal,
    level: r.level,
    kills: r.kills,
    deaths: r.deaths,
    assists: r.assists,
    // Live Client creepScore is one total; it cannot be split into lane vs neutral CS.
    cs: null,
    neutral_cs: null,
    gold_earned: null,
    damage_to_champions: null,
    damage_taken: null,
    damage_to_objectives: null,
    vision_score: null,
    wards_placed: null,
    wards_killed: null,
    control_wards_bought: null,
    items: r.items,
    summoner_spells: null,
    keystone_id: r.keystoneId,
  }
}

function matchLiveRow(p: EogPlayer, roster: LolLiveRosterRow[], isLocal: boolean): LolLiveRosterRow | null {
  if (isLocal) {
    const local = roster.find(r => r.isLocal)
    if (local) return local
  }
  const champ = str(p.championName)?.toLowerCase()
  if (!champ) return null
  const team = int(p.teamId)
  const hits = roster.filter(r => r.champion?.toLowerCase() === champ && (team === null || r.teamId === team))
  return hits.length === 1 ? hits[0]! : null
}

/**
 * Build the contract payload. Returns null when a required field is unknown
 * (game id, platform, local puuid, or any participants) — the caller then sends nothing.
 */
export function buildLolLocalMatchPayload(input: BuildLolLocalMatchInput): LolLocalMatchPayload | null {
  const { capture, identity } = input
  const eog = input.eog && (input.eog.teams?.length ?? 0) > 0 ? input.eog : null
  const puuid = str(identity.puuid)
  const platformId = str(identity.platformId)?.toUpperCase() ?? null
  const captureGameId = lolGameIdFromMatchId(capture.matchId)
  const eogGameId = int(eog?.gameId)
  // A stale end-of-game block from the previous match must not be filed under this one.
  const eogMatches = eog !== null && (captureGameId === null || eogGameId === null || eogGameId === captureGameId)
  const block = eogMatches ? eog : null
  const gameId = (block ? eogGameId : null) ?? captureGameId
  if (!gameId || !platformId || !puuid) return null

  const localRiotId = identity.gameName && identity.tagLine ? `${identity.gameName}#${identity.tagLine}` : null
  const roster = capture.roster

  let participants: LolLocalParticipant[]
  if (block) {
    participants = eogPlayers(block).map((p, i) => {
      const local = isEogLocal(p, block, puuid)
      return participantFromEog(p, i, local, matchLiveRow(p, roster, local), localRiotId)
    })
  } else {
    participants = roster.map((r, i) => participantFromLive(r, i, localRiotId))
  }
  if (!participants.length) return null
  const local = participants.find(p => p.is_local) ?? null

  let winningTeamId: number | null = null
  const winner = block?.teams?.find(t => t.isWinningTeam === true)
  if (winner && int(winner.teamId) !== null) winningTeamId = int(winner.teamId)
  else if (local?.team_id != null) {
    const localWin = block?.localPlayer?.stats?.WIN
    const result = typeof localWin === 'number' ? (localWin > 0 ? 'win' : 'loss') : capture.gameEndResult
    if (result) winningTeamId = result === 'win' ? local.team_id : (local.team_id === 100 ? 200 : 100)
  }

  const hasEvents = capture.events.length > 0
  const objectives = hasEvents ? countTeamObjectives(capture.events, roster) : null
  const teamIds = [...new Set(participants.map(p => p.team_id).filter((t): t is number => t === 100 || t === 200))]
  const teams: LolLocalTeam[] = teamIds.sort().map((teamId) => {
    const members = participants.filter(p => p.team_id === teamId)
    const kills = members.every(m => m.kills !== null) ? members.reduce((a, m) => a + (m.kills ?? 0), 0) : null
    const o = objectives?.get(teamId)
    return {
      team_id: teamId,
      kills,
      towers: o?.towers ?? null,
      dragons: o?.dragons ?? null,
      barons: o?.barons ?? null,
      heralds: o?.heralds ?? null,
      inhibitors: o?.inhibitors ?? null,
      grubs: o?.grubs ?? null,
    }
  })

  const queueId = capture.queueId ?? int(block?.queueId)
  const now = input.now ?? Date.now
  const gameLength = int(block?.gameLength) ?? (capture.lastGameTime !== null ? Math.round(capture.lastGameTime) : null)

  return {
    schema: LOL_LOCAL_MATCH_SCHEMA,
    game_id: gameId,
    platform_id: platformId,
    queue_id: queueId,
    queue_label: queueId !== null ? normalizeLolQueueId(queueId).queueLabel : null,
    game_mode: str(block?.gameMode) ?? capture.gameMode,
    map_id: capture.mapId,
    game_length_s: gameLength,
    ended_at: capture.endedAt ?? new Date(now()).toISOString(),
    patch: lolPatchFromVersion(identity.gameVersion),
    local_player: {
      puuid,
      riot_id: localRiotId ?? local?.riot_id ?? null,
      team_id: local?.team_id ?? null,
      participant_index: local?.participant_index ?? null,
    },
    winning_team_id: winningTeamId,
    participants,
    teams,
    events: capture.events,
    local_snapshots: capture.snapshots,
    sources: {
      eog: block !== null,
      live_events: hasEvents,
      live_snapshots: capture.snapshots.length > 0,
    },
    recording_id: input.recordingId ?? null,
  }
}

/** Desktop only sends local League reports when the API turns the feature on for this account. */
export function lolLocalReportsEnabled(user: { features?: { lol_local_reports?: unknown } | null } | null | undefined): boolean {
  return user?.features?.lol_local_reports === true
}
