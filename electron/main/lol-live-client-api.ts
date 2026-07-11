/**
 * LoL Live Client Data API — https://127.0.0.1:2999/liveclientdata/
 * Separate from Valorant riot-local-api (same port, different JSON schema).
 */
import https from 'https'
import type { FinalPlayerStats, KillEvent, MatchData } from './riot-types'

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

function findLocalPlayer(data: LolAllGameData): LolLivePlayer | null {
  const active = data.activePlayer
  const players = data.allPlayers ?? []
  if (!players.length) return null

  if (active?.riotId) {
    const match = players.find((p) => p.riotId === active.riotId)
    if (match) return match
  }
  if (active?.summonerName) {
    const match = players.find((p) => p.summonerName === active.summonerName)
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

/** Exported for unit tests — map live client snapshot to MatchData. */
export function buildMatchDataFromLolSnapshot(
  data: LolAllGameData,
  opts: {
    recordingStartTime: number
    matchStartTime?: number | null
    gameplayStartTime?: number | null
  },
): MatchData {
  const local = findLocalPlayer(data)
  const active = data.activePlayer
  const gameData = data.gameData
  const riotParts = parseRiotId(active?.riotId ?? local?.riotId)
  const gameTimeSec = gameData?.gameTime ?? 0
  const recordingStart = opts.recordingStartTime
  const matchStart = opts.matchStartTime ?? recordingStart

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

  const killEvents: KillEvent[] = []
  for (const evt of data.events?.Events ?? []) {
    if (evt.EventName !== 'ChampionKill' && evt.EventName !== 'Multikill') continue
    if (evt.EventName !== 'ChampionKill') continue
    const gameTimeMs = Math.round(evt.EventTime * 1000)
    killEvents.push({
      EventID: evt.EventID,
      EventName: 'ChampionKill',
      EventTime: evt.EventTime,
      killerName: evt.KillerName ?? '',
      victimName: evt.VictimName ?? '',
      assistants: evt.Assisters ?? [],
      timeSinceGameStartMillis: gameTimeMs,
      videoOffsetMs: Math.max(0, gameTimeMs - Math.max(0, recordingStart - (opts.gameplayStartTime ?? matchStart))),
    })
  }

  const localName = (local?.summonerName ?? active?.summonerName ?? '').toLowerCase()
  const playerKills = killEvents.filter((k) =>
    localName && k.killerName.toLowerCase().includes(localName),
  )
  const playerDeaths = killEvents.filter((k) =>
    localName && k.victimName.toLowerCase().includes(localName),
  )

  return {
    game: 'lol',
    matchId: gameData?.gameId != null ? String(gameData.gameId) : null,
    puuid: null,
    region: null,
    queueId: '420',
    map: gameData?.mapName ?? "Summoner's Rift",
    agent: local?.championName ?? null,
    gameMode: normalizeLolGameMode(gameData?.gameMode),
    playerName: riotParts.name ?? local?.summonerName ?? null,
    playerTag: riotParts.tag,
    matchStartTime: matchStart,
    gameplayStartTime: opts.gameplayStartTime ?? matchStart,
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
      map: data.gameData?.mapName ?? null,
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
        })
      }
      return null
    }

    return buildMatchDataFromLolSnapshot(snapshot, {
      recordingStartTime: this._recordingStartTime,
      matchStartTime: this._matchStartTime,
      gameplayStartTime: this._gameplayStartTime,
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
