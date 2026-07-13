/**
 * LoL Live Client Data API — https://127.0.0.1:2999/liveclientdata/
 * Separate from Valorant riot-local-api (same port, different JSON schema).
 */
import https from 'https'
import type { FinalPlayerStats, KillEvent, MatchData, ObjectiveEvent, ObjectiveKind } from './riot-types'
import { resolveLolMapLabel } from '../../src/lib/lol-maps'
import { assignKillSpreeRounds } from './kill-clip-grouping'
import { lolGameTimeToVideoOffsetMs } from './recording-sync'

const LIVE_CLIENT_HOST = '127.0.0.1'
const LIVE_CLIENT_PORT = 2999
const POLL_INTERVAL_MS = 3_000
const MISSED_POLLS_BEFORE_END = 3

export interface LolLiveScores {
  kills: number
  deaths: number
  assists: number
  creepScore: number
}

export interface LolLivePlayer {
  summonerName: string
  riotId?: string
  championName: string
  team?: string
  scores: LolLiveScores
  level?: number
}

export interface LolLiveGameEvent {
  EventID: number
  EventName: string
  EventTime: number
  KillerName?: string
  VictimName?: string
  Assisters?: string[]
  // Objective / highlight fields (present depending on EventName).
  DragonType?: string
  Stolen?: string | boolean
  TurretKilled?: string
  InhibKilled?: string
  Acer?: string
  AcingTeam?: string
  KillStreak?: number
  Recipient?: string
}

export interface LolLiveGameData {
  gameTime: number
  gameMode: string
  mapName: string
  mapNumber?: number
  gameId?: number
}

export interface LolAllGameData {
  activePlayer?: {
    summonerName?: string
    riotId?: string
    level?: number
  }
  allPlayers?: LolLivePlayer[]
  events?: { Events?: LolLiveGameEvent[] }
  gameData?: LolLiveGameData
}

export interface LolActiveMatchProbe {
  inMatch: boolean
  gameMode: string | null
  mapName: string | null
  gameTime: number
}

export interface LolLiveMatchContext {
  champion: string | null
  map: string | null
  kills: number
  deaths: number
  assists: number
  gameTime: number
}

function parseRiotId(riotId: string | undefined): { name: string | null; tag: string | null } {
  if (!riotId || !riotId.includes('#')) return { name: null, tag: null }
  const [name, tag] = riotId.split('#', 2)
  return { name: name || null, tag: tag || null }
}

/** Lower-cased identity token with the Riot #tag stripped. */
function idToken(value: string | null | undefined): string {
  return (value ?? '').split('#', 1)[0]!.trim().toLowerCase()
}

/** All lower-cased identifiers (game name, riot id, summoner name) for the local player. */
function localPlayerIdentifiers(data: LolAllGameData, local: LolLivePlayer | null): Set<string> {
  const ids = new Set<string>()
  const add = (v: string | null | undefined): void => {
    const token = idToken(v)
    if (token) ids.add(token)
  }
  add(data.activePlayer?.riotId)
  add(data.activePlayer?.summonerName)
  add(local?.riotId)
  add(local?.summonerName)
  return ids
}

function findLocalPlayer(data: LolAllGameData): LolLivePlayer | null {
  const active = data.activePlayer
  const players = data.allPlayers ?? []
  if (!players.length) return null

  // Exact riotId match is the most reliable.
  if (active?.riotId) {
    const match = players.find((p) => p.riotId === active.riotId)
    if (match) return match
  }
  if (active?.summonerName) {
    const match = players.find((p) => p.summonerName === active.summonerName)
    if (match) return match
  }
  // Fall back to matching on the #tag-stripped game name (Live Client formats vary by patch).
  const activeToken = idToken(active?.riotId ?? active?.summonerName)
  if (activeToken) {
    const match = players.find(
      (p) => idToken(p.riotId) === activeToken || idToken(p.summonerName) === activeToken,
    )
    if (match) return match
  }
  return players[0] ?? null
}

/** Exported for unit tests — normalize queue/mode label from live client. */
export function normalizeLolGameMode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const upper = raw.toUpperCase()
  if (upper.includes('TFT') || upper.includes('ARAM')) return upper
  // Live client reports CLASSIC for Summoner's Rift — desktop V1 targets ranked solo.
  if (upper === 'CLASSIC') return 'RANKED_SOLO'
  return upper
}

/** @deprecated Use resolveLolMapLabel from src/lib/lol-maps — kept for existing imports. */
export const resolveLolMapName = resolveLolMapLabel

/** @deprecated Use assignKillSpreeRounds from kill-clip-grouping.ts */
export function assignLolKillSpreeRounds(killEvents: KillEvent[]): void {
  assignKillSpreeRounds(killEvents)
}

function parseStolen(raw: string | boolean | undefined): boolean {
  if (typeof raw === 'boolean') return raw
  return typeof raw === 'string' && raw.toLowerCase() === 'true'
}

/** Human label for a multikill streak count (2 → "Double Kill" … 5 → "Penta Kill"). */
function multikillLabel(streak: number | undefined): string | null {
  switch (streak) {
    case 2: return 'Double Kill'
    case 3: return 'Triple Kill'
    case 4: return 'Quadra Kill'
    case 5: return 'Penta Kill'
    default: return streak ? `${streak}x Multikill` : null
  }
}

/** Live Client EventName → objective kind (only mapped names become objectives). */
const OBJECTIVE_EVENT_KINDS: Record<string, ObjectiveKind> = {
  DragonKill: 'dragon',
  BaronKill: 'baron',
  HeraldKill: 'herald',
  TurretKilled: 'tower',
  InhibKilled: 'inhibitor',
  Ace: 'ace',
  Multikill: 'multikill',
}

/** Exported for unit tests — extract objective/highlight events from the live client feed. */
export function buildLolObjectiveEvents(
  events: LolLiveGameEvent[],
  opts: {
    isLocal: (name: string) => boolean
    gameClockZeroEpoch: number | null
    recordingStartTime: number
  },
): ObjectiveEvent[] {
  const objectives: ObjectiveEvent[] = []
  for (const evt of events) {
    const kind = OBJECTIVE_EVENT_KINDS[evt.EventName]
    if (!kind) continue

    const rawKiller = evt.Acer ?? evt.KillerName ?? ''
    const gameTimeMs = Math.round(evt.EventTime * 1000)

    let detail: string | null = null
    if (kind === 'dragon') detail = evt.DragonType ?? null
    else if (kind === 'multikill') detail = multikillLabel(evt.KillStreak)
    else if (kind === 'tower') detail = evt.TurretKilled ?? null
    else if (kind === 'inhibitor') detail = evt.InhibKilled ?? null

    objectives.push({
      EventID: evt.EventID,
      EventName: evt.EventName,
      EventTime: evt.EventTime,
      kind,
      killerName: rawKiller ? (opts.isLocal(rawKiller) ? 'You' : rawKiller) : undefined,
      team: evt.AcingTeam ?? null,
      detail,
      stolen: parseStolen(evt.Stolen),
      timeSinceGameStartMillis: gameTimeMs,
      videoOffsetMs: lolGameTimeToVideoOffsetMs(gameTimeMs, {
        gameClockZeroEpoch: opts.gameClockZeroEpoch,
        recordingStartTime: opts.recordingStartTime,
      }),
    })
  }
  return objectives
}

/** Exported for unit tests — map live client snapshot to MatchData. */
export function buildMatchDataFromLolSnapshot(
  data: LolAllGameData,
  opts: {
    recordingStartTime: number
    matchStartTime?: number | null
    gameplayStartTime?: number | null
    /** Epoch ms of Riot's in-game clock zero (from the first live snapshot). */
    gameClockZeroEpoch?: number | null
  },
): MatchData {
  const local = findLocalPlayer(data)
  const active = data.activePlayer
  const gameData = data.gameData
  const riotParts = parseRiotId(active?.riotId ?? local?.riotId)
  const gameTimeSec = gameData?.gameTime ?? 0
  const recordingStart = opts.recordingStartTime
  const matchStart = opts.matchStartTime ?? recordingStart
  // Anchor for event timing: the wall-clock moment Riot's game clock read 0.
  // Falls back to gameplay/match start when the live snapshot didn't capture it.
  const gameClockZeroEpoch = opts.gameClockZeroEpoch ?? opts.gameplayStartTime ?? matchStart

  const kills = local?.scores.kills ?? 0
  const deaths = local?.scores.deaths ?? 0
  const assists = local?.scores.assists ?? 0

  const finalStats: FinalPlayerStats = {
    kills,
    deaths,
    assists,
    score: 0,
    summonerName: local?.summonerName ?? active?.summonerName ?? null,
    agent: local?.championName ?? null,
    team: local?.team ?? null,
    level: local?.level ?? active?.level ?? 0,
    headshotPct: null,
    adr: null,
    accountLevel: null,
  }

  // Exact identity match (with the Riot #tag stripped) — substring matching caused
  // false negatives/positives across Live Client patches, leaving playerKills empty.
  const localIds = localPlayerIdentifiers(data, local)
  const isLocal = (name: string): boolean => {
    const token = idToken(name)
    return token.length > 0 && localIds.has(token)
  }

  const killEvents: KillEvent[] = []
  for (const evt of data.events?.Events ?? []) {
    if (evt.EventName !== 'ChampionKill') continue
    const gameTimeMs = Math.round(evt.EventTime * 1000)
    const rawKiller = evt.KillerName ?? ''
    const rawVictim = evt.VictimName ?? ''
    // Tag the local player as "You" so the VOD viewer highlights their kills/deaths.
    killEvents.push({
      EventID: evt.EventID,
      EventName: 'ChampionKill',
      EventTime: evt.EventTime,
      killerName: isLocal(rawKiller) ? 'You' : rawKiller,
      victimName: isLocal(rawVictim) ? 'You' : rawVictim,
      assistants: evt.Assisters ?? [],
      timeSinceGameStartMillis: gameTimeMs,
      videoOffsetMs: lolGameTimeToVideoOffsetMs(gameTimeMs, {
        gameClockZeroEpoch,
        recordingStartTime: recordingStart,
      }),
    })
  }

  // LoL has no rounds — leave kill events round-free so the VOD viewer renders a
  // continuous match timeline (not fake "rounds"). The clip pipeline groups the
  // player's kills into time-proximity sprees on its own copy at extraction time.
  const playerKills = killEvents.filter((k) => k.killerName === 'You')
  const playerDeaths = killEvents.filter((k) => k.victimName === 'You')

  const objectiveEvents = buildLolObjectiveEvents(data.events?.Events ?? [], {
    isLocal,
    gameClockZeroEpoch,
    recordingStartTime: recordingStart,
  })

  return {
    game: 'lol',
    matchId: gameData?.gameId != null ? String(gameData.gameId) : null,
    puuid: null,
    region: null,
    queueId: '420',
    map: resolveLolMapLabel(gameData?.mapName),
    agent: local?.championName ?? null,
    gameMode: normalizeLolGameMode(gameData?.gameMode),
    playerName: riotParts.name ?? local?.summonerName ?? null,
    playerTag: riotParts.tag,
    // Store the in-game clock-zero epoch as the match start so VOD offset math
    // (gameTimeToEventVideoOffsetMs) can re-derive event positions correctly.
    matchStartTime: gameClockZeroEpoch,
    gameplayStartTime: gameClockZeroEpoch,
    recordingStartTime: recordingStart,
    roundScores: [],
    events: data.events?.Events ?? [],
    killEvents,
    playerKills,
    playerDeaths,
    spikePlants: [],
    spikeDefuses: [],
    spikeDetonations: [],
    firstBloods: [],
    objectiveEvents,
    roundSummaries: [],
    finalStats,
    teamSnapshot: (data.allPlayers ?? []).map((p) => ({
      summonerName: p.summonerName,
      agent: p.championName,
      team: p.team ?? 'UNKNOWN',
      kills: p.scores.kills,
      deaths: p.scores.deaths,
      assists: p.scores.assists,
      score: 0,
      level: p.level ?? 0,
      puuid: null,
      competitiveTier: 0,
      competitiveTierName: 'Unranked',
      abilityCasts: null,
    })),
    matchDetails: { liveClient: data },
    startTime: matchStart,
    endTime: Date.now(),
  }
}

/** Exported for unit tests — detect whether snapshot represents an active game. */
export function isLolLiveMatchActive(data: LolAllGameData | null | undefined): boolean {
  if (!data?.gameData) return false
  const time = data.gameData.gameTime
  if (typeof time !== 'number' || Number.isNaN(time)) return false
  return time >= 0 && (data.allPlayers?.length ?? 0) > 0
}

function liveGet<T>(path: string, timeoutMs = 1_500): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: LIVE_CLIENT_HOST,
        port: LIVE_CLIENT_PORT,
        path,
        method: 'GET',
        rejectUnauthorized: false,
        timeout: timeoutMs,
      },
      (res) => {
        let body = ''
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => {
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`Live Client HTTP ${res.statusCode}`))
            return
          }
          try {
            resolve(JSON.parse(body) as T)
          } catch {
            reject(new Error('Live Client JSON parse error'))
          }
        })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Live Client timeout'))
    })
    req.end()
  })
}

export class LoLLiveClientApi {
  private _pollTimer: ReturnType<typeof setInterval> | null = null
  private _active = false
  private _seenLive = false
  private _missedPolls = 0
  private _lastSnapshot: LolAllGameData | null = null
  private _recordingStartTime = Date.now()
  private _matchStartTime: number | null = null
  private _gameplayStartTime: number | null = null
  private _gameClockZeroEpoch: number | null = null
  onMatchEnded: (() => void) | null = null

  async fetchAllGameData(): Promise<LolAllGameData | null> {
    try {
      return await liveGet<LolAllGameData>('/liveclientdata/allgamedata')
    } catch {
      return null
    }
  }

  async probeActiveMatch(): Promise<LolActiveMatchProbe | null> {
    const data = await this.fetchAllGameData()
    if (!data) return null
    return {
      inMatch: isLolLiveMatchActive(data),
      gameMode: normalizeLolGameMode(data.gameData?.gameMode),
      mapName: data.gameData?.mapName ?? null,
      gameTime: data.gameData?.gameTime ?? 0,
    }
  }

  getLiveMatchContext(): LolLiveMatchContext | null {
    const data = this._lastSnapshot
    if (!data) return null
    const local = findLocalPlayer(data)
    return {
      champion: local?.championName ?? null,
      map: data.gameData?.mapName ? resolveLolMapLabel(data.gameData.mapName) : null,
      kills: local?.scores.kills ?? 0,
      deaths: local?.scores.deaths ?? 0,
      assists: local?.scores.assists ?? 0,
      gameTime: data.gameData?.gameTime ?? 0,
    }
  }

  setRecordingStartTime(ms: number): void {
    this._recordingStartTime = ms
  }

  start(matchStartTime?: number): void {
    this.cancel()
    this._active = true
    this._seenLive = false
    this._missedPolls = 0
    this._lastSnapshot = null
    this._matchStartTime = matchStartTime ?? Date.now()
    this._gameplayStartTime = this._matchStartTime
    this._gameClockZeroEpoch = null

    void this._pollOnce()
    this._pollTimer = setInterval(() => { void this._pollOnce() }, POLL_INTERVAL_MS)
  }

  cancel(): void {
    this._active = false
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
    this.onMatchEnded = null
  }

  async stop(): Promise<MatchData | null> {
    const wasActive = this._active
    this.cancel()

    let snapshot = this._lastSnapshot
    if (!snapshot && wasActive) {
      snapshot = await this.fetchAllGameData()
    }
    if (!snapshot || !isLolLiveMatchActive(snapshot)) {
      if (snapshot) {
        return buildMatchDataFromLolSnapshot(snapshot, {
          recordingStartTime: this._recordingStartTime,
          matchStartTime: this._matchStartTime,
          gameplayStartTime: this._gameplayStartTime,
          gameClockZeroEpoch: this._gameClockZeroEpoch,
        })
      }
      return null
    }

    return buildMatchDataFromLolSnapshot(snapshot, {
      recordingStartTime: this._recordingStartTime,
      matchStartTime: this._matchStartTime,
      gameplayStartTime: this._gameplayStartTime,
      gameClockZeroEpoch: this._gameClockZeroEpoch,
    })
  }

  private _emitMatchEnd(): void {
    if (!this._active) return
    const cb = this.onMatchEnded
    this.onMatchEnded = null
    cb?.()
  }

  private async _pollOnce(): Promise<void> {
    if (!this._active) return

    const data = await this.fetchAllGameData()
    if (!data) {
      if (this._seenLive) {
        this._missedPolls++
        if (this._missedPolls >= MISSED_POLLS_BEFORE_END) {
          this._emitMatchEnd()
        }
      }
      return
    }

    if (isLolLiveMatchActive(data)) {
      this._seenLive = true
      this._missedPolls = 0
      this._lastSnapshot = data
      // Anchor to Riot's game clock: derive when the clock read 0 from the first
      // valid snapshot. gameTime advances with wall-clock, so Date.now() minus
      // the elapsed game time is a stable estimate independent of load duration.
      if (this._gameClockZeroEpoch == null) {
        const gt = data.gameData?.gameTime ?? 0
        if (gt >= 0) this._gameClockZeroEpoch = Date.now() - Math.round(gt * 1000)
      }
      if (!this._gameplayStartTime && (data.gameData?.gameTime ?? 0) > 30) {
        this._gameplayStartTime = Date.now()
      }
    }

    const events = data.events?.Events ?? []
    if (events.some((e) => e.EventName === 'GameEnd')) {
      this._lastSnapshot = data
      this._emitMatchEnd()
    }
  }
}
