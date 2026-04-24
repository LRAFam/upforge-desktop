import https from 'https'
import tls from 'tls'
import fs from 'fs'
import path from 'path'

/**
 * Maps Riot's internal agent UUIDs (characterId) to display names.
 * Source: valorant-api.com — update when new agents are released.
 */
const AGENT_UUID_TO_NAME: Record<string, string> = {
  '5f8d3a7f-467b-97f3-062c-0a0fad1b84d5': 'Brimstone',
  '707eab51-4836-f488-046a-cda6bf494859': 'Viper',
  '22697a3d-45bf-be07-69e9-f3e05cb36c1b': 'Chamber',
  '601dbbe7-43ce-be57-2a40-4abd24953ffd': 'KAY/O',
  '6f2a04ca-43e0-be17-7f36-b3908627744d': 'Skye',
  '117ed9e3-49f3-6512-3ccf-0cada7e3823b': 'Cypher',
  '320b2a48-4d9b-a075-30f1-1f93a9b638fa': 'Sova',
  '1e58de9c-4950-5125-93e9-a0aee9f98746': 'Killjoy',
  '95b78ed7-4637-86d9-7e41-71ba8c293152': 'Harbor',
  '7f94d92c-4234-0a36-9646-3a87eb8b5c89': 'Yoru',
  'a3bfb853-43b2-7238-a4f1-ad90e9e46bcc': 'Reyna',
  '9f0d8ba9-4140-b941-57d3-a7ad57c6b417': 'Breach',
  'add6443a-41bd-e414-f6ad-e58d267f4e95': 'Deadlock',
  '1dbf2edd-4729-0984-3115-daa5eed44993': 'Clove',
  'efba5359-4016-a1e5-7626-b1ae1d5c8209': 'Gekko',
  '5295c2c1-4d88-b2c2-0948-c991c95f8fd5': 'Fade',
  '8e253930-4c05-31dd-1b6c-968525494517': 'Neon',
  '41fb69c1-4189-7b37-f117-bcaf1e96f1bf': 'Astra',
  '569fdd95-4d10-43ab-ca70-79becc718b46': 'Sage',
  'f94c3b30-42be-e959-889c-5aa313dba261': 'Phoenix',
  'bb2a4828-46eb-8cd1-e765-15848195d751': 'Jett',
  '0e38b510-41a8-5780-5e8f-568b2a4f2d6c': 'Iso',
  'dade69b4-4f5a-8528-247b-219e5a1facd6': 'Raze',
  'e370fa57-4757-3604-3648-499e1f642d3f': 'Omen',
  '1180a69f-4def-1bc1-6071-d8b28b1c47bd': 'Waylay',
  'cc8b64c8-4b25-4ff9-6e7f-37b4da43d235': 'Tejo',
  '7c8a4701-4de6-9355-b254-e09bc2a34b72': 'Miks',
  'efba5359-4016-a1e5-7626-b1ae76895940': 'Vyse',
  '92eeef5d-43b5-1d4a-8d03-b3927a09034b': 'Veto',
}

/** Resolve a Riot characterId UUID to a display name, returning the UUID unchanged if unknown. */
export function resolveAgentName(characterId: string | null | undefined): string | null {
  if (!characterId) return null
  return AGENT_UUID_TO_NAME[characterId.toLowerCase()] ?? characterId
}

/**
 * Maps Riot's internal map codenames (the last segment of a mapId path) to display names.
 * Source: valorant-api.com — update when new maps are released.
 *
 * Riot returns paths like "/Game/Maps/Duality/Duality" — we take the last segment ("Duality")
 * and resolve it here. Also handles the full path and partial matches.
 */
const MAP_CODENAME_TO_NAME: Record<string, string> = {
  // Current maps
  ascent: 'Ascent',
  duality: 'Bind',
  triad: 'Haven',
  bonsai: 'Split',
  port: 'Icebox',
  foxtrot: 'Breeze',
  canyon: 'Fracture',
  pitt: 'Pearl',
  jam: 'Lotus',
  juliett: 'Sunset',
  infinity: 'Abyss',
  // TDM / special modes
  hurm_alley: 'Team Deathmatch',
  hurm_bowl: 'Team Deathmatch',
  hurm_district: 'Team Deathmatch',
  hurm_kasbah: 'Team Deathmatch',
  // Range
  range: 'The Range',
}

/** Resolve a Riot map ID (full path or last segment) to a display name. */
export function resolveMapName(mapId: string | null | undefined): string | null {
  if (!mapId) return null
  const segment = mapId.split('/').filter(Boolean).pop() ?? mapId
  return MAP_CODENAME_TO_NAME[segment.toLowerCase()] ?? segment
}

export interface GameEvent {
  EventID: number
  EventName: string
  EventTime: number
}

/** A kill/death event — now populated from Riot MatchDetails API post-match */
export interface KillEvent extends GameEvent {
  EventName: 'ChampionKill'
  killerName: string
  victimName: string
  assistants: string[]
  /** Milliseconds since game start — from Riot MatchDetails timeSinceGameStartMillis */
  timeSinceGameStartMillis?: number
  /** Offset from recording start in ms — use this to seek video to the kill */
  videoOffsetMs?: number
  /** Weapon/damage type (e.g. "Weapon", "Ability", "Bomb") */
  weapon?: string
  /** Raw PUUIDs for backend resolution */
  killerPuuid?: string
  victimPuuid?: string
  /** Which round this kill occurred in (0-indexed) */
  round?: number
}

/** Spike planted event — includes site (A/B/C) and who planted */
export interface SpikePlantedEvent extends GameEvent {
  EventName: 'SpikePlanted'
  planter: string
  site: string
}

/** Spike defused event — who defused */
export interface SpikeDefusedEvent extends GameEvent {
  EventName: 'SpikeDefused'
  defuser: string
}

/** Spike detonated event */
export interface SpikeDetonatedEvent extends GameEvent {
  EventName: 'SpikeDetonated'
}

/** First blood event */
export interface FirstBloodEvent extends GameEvent {
  EventName: 'FirstBlood'
  killerName: string
  victimName: string
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
}

/** Per-player stats snapshot for the full team — captured at match end */
export interface TeamPlayerSnapshot {
  summonerName: string
  agent: string | null
  team: string
  kills: number
  deaths: number
  assists: number
  /** Combat score */
  score: number
  level: number
}

/** Final match stats for the local player, captured at match end */
export interface FinalPlayerStats {
  kills: number
  deaths: number
  assists: number
  score: number
  /** Riot display name (gameName#tagLine) */
  summonerName: string | null
  /** Agent played */
  agent: string | null
  team: string | null
  level: number
}

/** Round score snapshot captured from presence polling */
export interface RoundScore {
  allyScore: number
  enemyScore: number
  /** Epoch ms when this score was detected */
  detectedAt: number
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
}

/** Full enriched match data — superset of MatchTimeline */
export interface MatchData {
  game: string

  // Identity (NEW)
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

  // Timing (critical for video frame mapping — NEW)
  /** Epoch ms when presence transitioned to INGAME (= real match start) */
  matchStartTime: number | null
  /** Epoch ms when recorder.start() was called */
  recordingStartTime: number

  // Round score progression from presence polling (NEW)
  roundScores: RoundScore[]

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

export class RiotLocalApi {
  private tlsAgent = new https.Agent({ rejectUnauthorized: false })
  private lockfileData: LockfileData | null = null
  private ownPuuid: string | null = null
  private accessToken: string | null = null
  private entitlementsToken: string | null = null
  private region: string | null = null
  private playerName: string | null = null
  private playerTag: string | null = null
  private matchData: MatchData | null = null
  private presencePollInterval: ReturnType<typeof setInterval> | null = null
  private wsSocket: tls.TLSSocket | null = null
  private lastSessionLoopState: string = 'MENUS'
  private matchEnded = false
  private currentMatchId: string | null = null
  private lastGameMode: string | null = null

  /**
   * Fired when presence transitions INGAME -> MENUS (match ended).
   * Set this before calling start() to stop recording promptly.
   */
  public onMatchEnded: (() => void) | null = null

  // ──────────────────────────────────────────────────────────────────────
  // LOCKFILE
  // ──────────────────────────────────────────────────────────────────────

  readLockfile(): LockfileData | null {
    if (process.platform !== 'win32') return null
    const localAppData = process.env.LOCALAPPDATA
    if (!localAppData) return null
    const lockfilePath = path.join(localAppData, 'Riot Games', 'Riot Client', 'Config', 'lockfile')
    try {
      const content = fs.readFileSync(lockfilePath, 'utf8').trim()
      const parts = content.split(':')
      if (parts.length < 5) return null
      const port = parseInt(parts[2], 10)
      if (isNaN(port)) return null
      this.lockfileData = { port, password: parts[3] }
      return this.lockfileData
    } catch {
      return null
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // HTTP CLIENT (Riot Client Local API)
  // ──────────────────────────────────────────────────────────────────────

  private _fetchLocal<T>(apiPath: string): Promise<T> {
    const lf = this.lockfileData
    if (!lf) return Promise.reject(new Error('Lockfile not available'))
    const auth = Buffer.from(`riot:${lf.password}`).toString('base64')
    return new Promise((resolve, reject) => {
      const req = https.get(
        { hostname: '127.0.0.1', port: lf.port, path: apiPath,
          headers: { Authorization: `Basic ${auth}` }, agent: this.tlsAgent },
        (res) => {
          let body = ''
          res.on('data', (chunk) => (body += chunk))
          res.on('end', () => {
            if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} for ${apiPath}`)); return }
            try { resolve(JSON.parse(body) as T) } catch { reject(new Error('Invalid JSON')) }
          })
        }
      )
      req.on('error', reject)
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('Timeout')) })
    })
  }

  // ──────────────────────────────────────────────────────────────────────
  // AUTHENTICATION & IDENTITY
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Read the lockfile and fetch auth tokens + player identity from the Riot Client.
   * Call once when the game process starts. Returns true if successful.
   */
  async initAuth(): Promise<boolean> {
    const lf = this.readLockfile()
    if (!lf) {
      console.log('[RiotLocalApi] Lockfile not found')
      return false
    }
    try {
      const ent = await this._fetchLocal<{ subject: string; accessToken: string; token: string }>(
        '/entitlements/v1/token'
      )
      this.ownPuuid = ent.subject
      this.accessToken = ent.accessToken
      this.entitlementsToken = ent.token
    } catch (err) {
      console.log('[RiotLocalApi] Failed to fetch entitlements token:', err)
      return false
    }

    // Player name + region from chat session
    try {
      const sess = await this._fetchLocal<{
        game_name: string; game_tag: string; region: string; puuid: string
      }>('/chat/v1/session')
      if (sess.game_name) this.playerName = sess.game_name
      if (sess.game_tag) this.playerTag = sess.game_tag
      if (sess.region) this.region = _normalizeRegion(sess.region)
    } catch {
      // Fallback: extract region from Valorant launch args
      try {
        const ext = await this._fetchLocal<
          Record<string, { launchConfiguration?: { arguments?: string[] } }>
        >('/product-session/v1/external-sessions')
        for (const v of Object.values(ext)) {
          for (const arg of v?.launchConfiguration?.arguments ?? []) {
            const m = arg.match(/^-ares-deployment=(.+)$/)
            if (m) { this.region = m[1]; break }
          }
          if (this.region) break
        }
      } catch { /* ignore */ }
    }

    console.log(
      `[RiotLocalApi] Auth ready — puuid=${this.ownPuuid?.slice(0, 8)}... ` +
      `region=${this.region} player=${this.playerName}#${this.playerTag}`
    )
    return true
  }

  private async _refreshTokens(): Promise<void> {
    if (!this.lockfileData) return
    try {
      const ent = await this._fetchLocal<{ subject: string; accessToken: string; token: string }>(
        '/entitlements/v1/token'
      )
      this.accessToken = ent.accessToken
      this.entitlementsToken = ent.token
    } catch { /* use cached tokens */ }
  }

  // ──────────────────────────────────────────────────────────────────────
  // PRESENCE / SESSION STATE
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Poll /chat/v4/presences and return own Valorant session state.
   * The `private` field is base64-encoded JSON containing matchPresenceData.
   */
  async getSessionState(): Promise<SessionState | null> {
    if (!this.lockfileData || !this.ownPuuid) return null
    try {
      const data = await this._fetchLocal<{
        presences: Array<{ puuid: string; product: string; private: string }>
      }>('/chat/v4/presences')
      const own = data.presences?.find((p) => p.puuid === this.ownPuuid && p.product === 'valorant')
      if (!own?.private) return null
      const decoded = JSON.parse(Buffer.from(own.private, 'base64').toString()) as Record<string, unknown>
      const mpd = (decoded.matchPresenceData ?? {}) as Record<string, unknown>
      return {
        sessionLoopState: (mpd.sessionLoopState ?? decoded.sessionLoopState ?? 'MENUS') as string,
        queueId: (mpd.queueId ?? decoded.queueId ?? null) as string | null,
        matchMap: (mpd.matchMap ?? decoded.matchMap ?? null) as string | null,
        allyScore: (decoded.partyOwnerMatchScoreAllyTeam ?? 0) as number,
        enemyScore: (decoded.partyOwnerMatchScoreEnemyTeam ?? 0) as number,
      }
    } catch {
      return null
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // WEBSOCKET (match-end signal + matchId detection)
  // ──────────────────────────────────────────────────────────────────────

  private _connectWebSocket(): void {
    if (!this.lockfileData) return
    const { port, password } = this.lockfileData
    const authHeader = `Basic ${Buffer.from(`riot:${password}`).toString('base64')}`
    const wsKey = Buffer.from(Math.random().toString(36)).toString('base64')

    const socket = tls.connect(
      { host: '127.0.0.1', port, rejectUnauthorized: false },
      () => {
        socket.write(
          [`GET / HTTP/1.1`, `Host: 127.0.0.1:${port}`, `Upgrade: websocket`,
           `Connection: Upgrade`, `Sec-WebSocket-Key: ${wsKey}`, `Sec-WebSocket-Version: 13`,
           `Authorization: ${authHeader}`, ``, ``].join('\r\n')
        )
      }
    )

    this.wsSocket = socket
    let wsBuffer = Buffer.alloc(0)
    let handshakeDone = false

    socket.on('data', (chunk: Buffer) => {
      wsBuffer = Buffer.concat([wsBuffer, chunk])
      if (!handshakeDone) {
        const headerEnd = wsBuffer.indexOf('\r\n\r\n')
        if (headerEnd === -1) return
        handshakeDone = true
        this._wsSend(socket, JSON.stringify([5, 'OnJsonApiEvent']))
        wsBuffer = wsBuffer.slice(headerEnd + 4)
      }
      // Parse RFC 6455 frames (server->client, no masking)
      while (wsBuffer.length >= 2) {
        const b1 = wsBuffer[0]
        const b2 = wsBuffer[1]
        const opcode = b1 & 0x0f
        if (opcode === 8) break // close
        let payloadLen = b2 & 0x7f
        let offset = 2
        if (payloadLen === 126) {
          if (wsBuffer.length < 4) break
          payloadLen = wsBuffer.readUInt16BE(2); offset = 4
        } else if (payloadLen === 127) {
          if (wsBuffer.length < 10) break
          payloadLen = Number(wsBuffer.readBigUInt64BE(2)); offset = 10
        }
        if (wsBuffer.length < offset + payloadLen) break
        const payload = wsBuffer.slice(offset, offset + payloadLen).toString('utf8')
        wsBuffer = wsBuffer.slice(offset + payloadLen)
        if (!payload) continue
        try {
          const msg = JSON.parse(payload) as unknown[]
          if (Array.isArray(msg) && msg[0] === 8) this._handleWsEvent(msg[2] as Record<string, unknown>)
        } catch { /* ignore malformed frames */ }
      }
    })

    socket.on('error', (err: Error) => console.log('[RiotLocalApi] WS error:', err.message))
    socket.on('close', () => {
      console.log('[RiotLocalApi] WS closed')
      if (this.matchData && !this.matchEnded) setTimeout(() => this._connectWebSocket(), 5000)
    })
  }

  /** Send masked WebSocket frame (RFC 6455 — client->server frames must be masked) */
  private _wsSend(socket: tls.TLSSocket, payload: string): void {
    const data = Buffer.from(payload, 'utf8')
    const mask = Buffer.from([
      Math.floor(Math.random() * 256), Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256), Math.floor(Math.random() * 256),
    ])
    const masked = Buffer.alloc(data.length)
    for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4]
    let header: Buffer
    if (data.length < 126) {
      header = Buffer.from([0x81, 0x80 | data.length, ...mask])
    } else if (data.length < 65536) {
      header = Buffer.from([0x81, 0x80 | 126, data.length >> 8, data.length & 0xff, ...mask])
    } else { return }
    socket.write(Buffer.concat([header, masked]))
  }

  private _handleWsEvent(event: Record<string, unknown>): void {
    if (!event) return
    const uri = (event.uri as string) ?? ''
    const data = (event.data as Record<string, unknown>) ?? {}
    // Match end: ares-match-details event fires with matchId as payload
    if (uri.includes('ares-match-details/match-details/v1/matches')) {
      const matchId = data.payload as string
      if (matchId && matchId.length > 10) {
        console.log(`[RiotLocalApi] Match ID from WS: ${matchId}`)
        this.currentMatchId = matchId
        if (this.matchData) this.matchData.matchId = matchId
      }
    }
    // Extract matchId from core-game URI during match (backup)
    if (uri.includes('/core-game/v1/matches/') && !this.currentMatchId) {
      const m = uri.match(/core-game\/v1\/matches\/([0-9a-f-]{36})/)
      if (m) {
        this.currentMatchId = m[1]
        if (this.matchData) this.matchData.matchId = m[1]
        console.log(`[RiotLocalApi] Match ID from WS URI: ${m[1]}`)
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // PRESENCE POLLING (during match)
  // ──────────────────────────────────────────────────────────────────────

  private async _pollPresence(): Promise<void> {
    if (!this.matchData || this.matchEnded) return
    const state = await this.getSessionState()
    if (!state) return
    const { sessionLoopState, queueId, matchMap, allyScore, enemyScore } = state

    if (!this.matchData.map && matchMap && matchMap.length > 1) {
      this.matchData.map = resolveMapName(matchMap)
      console.log(`[RiotLocalApi] Map: ${this.matchData.map}`)
    }
    if (!this.matchData.queueId && queueId) {
      this.matchData.queueId = queueId
      const normalized = _normalizeQueueId(queueId)
      this.matchData.gameMode = normalized
      this.lastGameMode = normalized
      console.log(`[RiotLocalApi] Queue: ${queueId} -> ${normalized}`)
    }

    const last = this.matchData.roundScores[this.matchData.roundScores.length - 1]
    if (!last || last.allyScore !== allyScore || last.enemyScore !== enemyScore) {
      this.matchData.roundScores.push({ allyScore, enemyScore, detectedAt: Date.now() })
      if (sessionLoopState === 'INGAME' && (allyScore > 0 || enemyScore > 0))
        console.log(`[RiotLocalApi] Score: ${allyScore}-${enemyScore}`)
    }

    if (this.lastSessionLoopState === 'INGAME' && sessionLoopState === 'MENUS') {
      console.log('[RiotLocalApi] Match ended — presence returned to MENUS')
      this.matchEnded = true
      this.lastSessionLoopState = sessionLoopState
      this.onMatchEnded?.()
      return
    }
    this.lastSessionLoopState = sessionLoopState
  }

  // ──────────────────────────────────────────────────────────────────────
  // MATCH LIFECYCLE
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Start tracking a match.
   * @param game           'valorant' or 'cs2'
   * @param matchStartTime  Epoch ms when presence transitioned to INGAME
   */
  start(game: string, matchStartTime?: number): void {
    this.matchEnded = false
    this.currentMatchId = null
    this.lastSessionLoopState = 'INGAME'
    this.matchData = {
      game,
      matchId: null,
      puuid: this.ownPuuid,
      region: this.region,
      queueId: null,
      map: null,
      agent: null,
      gameMode: null,
      playerName: this.playerName,
      playerTag: this.playerTag,
      matchStartTime: matchStartTime ?? null,
      recordingStartTime: Date.now(),
      roundScores: [],
      events: [],
      killEvents: [],
      playerKills: [],
      playerDeaths: [],
      spikePlants: [],
      spikeDefuses: [],
      spikeDetonations: [],
      firstBloods: [],
      roundSummaries: [],
      finalStats: null,
      teamSnapshot: [],
      matchDetails: null,
      startTime: Date.now(),
      endTime: null,
    }
    this._connectWebSocket()
    this.presencePollInterval = setInterval(() => this._pollPresence(), 3000)
    console.log(`[RiotLocalApi] Match tracking started (game=${game} matchStartTime=${matchStartTime})`)
  }

  /**
   * Stop tracking and return enriched MatchData.
   * Fetches Riot MatchDetails API post-match if matchId + region are available.
   */
  async stop(): Promise<MatchData | null> {
    if (this.presencePollInterval) { clearInterval(this.presencePollInterval); this.presencePollInterval = null }
    if (this.wsSocket) { this.wsSocket.destroy(); this.wsSocket = null }
    if (!this.matchData) return null
    this.matchData.endTime = Date.now()
    if (!this.matchData.matchId && this.currentMatchId) this.matchData.matchId = this.currentMatchId

    if (this.matchData.matchId && this.region) {
      console.log(`[RiotLocalApi] Fetching MatchDetails for ${this.matchData.matchId}`)
      await this._refreshTokens()
      const details = await this._fetchMatchDetails(this.matchData.matchId)
      if (details) {
        this.matchData.matchDetails = details
        this._populateFromMatchDetails(details)
      } else {
        console.log('[RiotLocalApi] MatchDetails fetch failed — using presence data only')
      }
    } else {
      console.log(`[RiotLocalApi] Skipping MatchDetails — matchId=${this.matchData.matchId} region=${this.region}`)
    }

    const result = this.matchData
    this.matchData = null
    console.log(
      `[RiotLocalApi] Stop complete — kills=${result.killEvents.length} ` +
      `rounds=${result.roundSummaries.length} matchId=${result.matchId}`
    )
    return result
  }

  // ──────────────────────────────────────────────────────────────────────
  // POST-MATCH: RIOT MATCH DETAILS API
  // ──────────────────────────────────────────────────────────────────────

  private async _fetchMatchDetails(matchId: string): Promise<Record<string, unknown> | null> {
    if (!this.region || !this.accessToken || !this.entitlementsToken) return null
    return new Promise((resolve) => {
      const req = https.get(
        {
          hostname: `pd.${this.region}.a.pvp.net`,
          port: 443,
          path: `/match-details/v1/matches/${matchId}`,
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'X-Riot-Entitlements-JWT': this.entitlementsToken!,
            // Standard Valorant client platform header (required by Riot PvP API)
            'X-Riot-ClientPlatform':
              'ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9',
          },
        },
        (res) => {
          let body = ''
          res.on('data', (chunk) => (body += chunk))
          res.on('end', () => {
            if (res.statusCode !== 200) {
              console.log(`[RiotLocalApi] MatchDetails HTTP ${res.statusCode}`)
              resolve(null); return
            }
            try { resolve(JSON.parse(body) as Record<string, unknown>) } catch { resolve(null) }
          })
        }
      )
      req.on('error', (err: Error) => { console.log(`[RiotLocalApi] MatchDetails error: ${err.message}`); resolve(null) })
      req.setTimeout(15000, () => { req.destroy(); resolve(null) })
    })
  }

  /**
   * Populate MatchData from Riot MatchDetails.
   * Every kill gets a precise videoOffsetMs for seeking the recording to that exact moment.
   */
  private _populateFromMatchDetails(details: Record<string, unknown>): void {
    if (!this.matchData) return
    const matchInfo = details.matchInfo as Record<string, unknown> | undefined
    const players = details.players as Array<Record<string, unknown>> | undefined
    const roundResults = details.roundResults as Array<Record<string, unknown>> | undefined
    const allKills = details.kills as Array<Record<string, unknown>> | undefined

    if (matchInfo?.mapId) {
      this.matchData.map = resolveMapName(matchInfo.mapId as string)
    }
    if (matchInfo?.queueID && !this.matchData.queueId) {
      const queueId = matchInfo.queueID as string
      this.matchData.queueId = queueId
      this.matchData.gameMode = _normalizeQueueId(queueId)
      this.lastGameMode = this.matchData.gameMode
    }

    const ownPlayer = players?.find((p) => p.subject === this.ownPuuid)
    if (ownPlayer) {
      this.matchData.agent = resolveAgentName(ownPlayer.characterId as string) ?? this.matchData.agent
      const gameName = (ownPlayer.gameName as string) ?? null
      const tagLine = (ownPlayer.tagLine as string) ?? null
      if (gameName) this.matchData.playerName = gameName
      if (tagLine) this.matchData.playerTag = tagLine
      const stats = ownPlayer.stats as Record<string, number> | undefined
      if (stats) {
        this.matchData.finalStats = {
          kills: stats.kills ?? 0, deaths: stats.deaths ?? 0, assists: stats.assists ?? 0,
          score: stats.score ?? 0, summonerName: gameName, agent: this.matchData.agent,
          team: (ownPlayer.teamId as string) ?? null, level: 0,
        }
      }
    }

    if (players && players.length > 0) {
      this.matchData.teamSnapshot = players.map((p) => {
        const stats = p.stats as Record<string, number> | undefined
        return {
          summonerName: (p.gameName as string) ?? (p.subject as string),
          agent: resolveAgentName(p.characterId as string) ?? null,
          team: (p.teamId as string) ?? 'Unknown',
          kills: stats?.kills ?? 0, deaths: stats?.deaths ?? 0,
          assists: stats?.assists ?? 0, score: stats?.score ?? 0, level: 0,
        }
      })
    }

    // Kill events — video offset math:
    // videoOffsetMs = (matchStartTime - recordingStartTime) + timeSinceGameStartMillis
    const matchStartTime = this.matchData.matchStartTime
    const recordingStartTime = this.matchData.recordingStartTime
    const recordingOffset = matchStartTime != null ? matchStartTime - recordingStartTime : 0

    if (allKills && allKills.length > 0) {
      let eventId = 1
      for (const k of allKills) {
        const tsgm = (k.timeSinceGameStartMillis as number) ?? 0
        const videoOffsetMs = recordingOffset + tsgm
        const killerPuuid = k.killer as string
        const victimPuuid = k.victim as string
        const kPlayer = players?.find((p) => p.subject === killerPuuid)
        const vPlayer = players?.find((p) => p.subject === victimPuuid)
        const ev: KillEvent = {
          EventID: eventId++,
          EventName: 'ChampionKill',
          EventTime: tsgm / 1000,
          killerName: (kPlayer?.gameName as string) ?? killerPuuid?.slice(0, 8) ?? '',
          victimName: (vPlayer?.gameName as string) ?? victimPuuid?.slice(0, 8) ?? '',
          assistants: (k.assistants as string[]) ?? [],
          timeSinceGameStartMillis: tsgm,
          videoOffsetMs,
          weapon: ((k.finishingDamage as Record<string, unknown>)?.damageType as string) ?? 'Unknown',
          killerPuuid,
          victimPuuid,
          round: (k.round as number) ?? 0,
        }
        this.matchData.killEvents.push(ev)
        this.matchData.events.push(ev)
        if (killerPuuid === this.ownPuuid) this.matchData.playerKills.push(ev)
        if (victimPuuid === this.ownPuuid) this.matchData.playerDeaths.push(ev)
      }
    }

    if (roundResults && roundResults.length > 0) {
      for (const round of roundResults) {
        const roundNum = (round.roundNum as number) ?? 0
        const winningTeam = (round.winningTeam as string) ?? null
        const resultCode = (round.roundResultCode as string) ?? (round.roundResult as string) ?? null
        const bombPlanter = (round.bombPlanter as string) ?? null
        const bombDefuser = (round.bombDefuser as string) ?? null
        const plantSite = (round.plantSite as string) ?? null
        const prs = (round.playerStats as Array<Record<string, unknown>> | undefined)
          ?.find((ps) => ps.subject === this.ownPuuid)
        const economy = prs?.economy as Record<string, unknown> | undefined
        this.matchData.roundSummaries.push({
          roundNumber: roundNum + 1,
          winningTeam,
          ceremony: resultCode,
          endTime: (round.defuseRoundMsec as number) || (round.plantRoundMsec as number) || 0,
          playerStats: prs ? {
            kills: (prs.kills as unknown[])?.length ?? 0,
            deaths: 0,
            assists: (prs.assists as unknown[])?.length ?? 0,
            score: (prs.score as number) ?? 0,
          } : null,
          spikePlanted: !!bombPlanter, spikeSite: plantSite, spikePlanter: bombPlanter,
          spikeDefused: !!bombDefuser, spikeDefuser: bombDefuser,
          spikeDetonated: resultCode === 'BombDetonated',
          playerGold: (economy?.remaining as number) ?? null, playerAbilities: null,
          playerGotFirstBlood: false, playerWasFirstBlood: false,
        })
        if (bombPlanter) this.matchData.spikePlants.push({
          EventID: roundNum * 100 + 10, EventName: 'SpikePlanted',
          EventTime: (round.plantRoundMsec as number) ?? 0, planter: bombPlanter, site: plantSite ?? '',
        })
        if (bombDefuser) this.matchData.spikeDefuses.push({
          EventID: roundNum * 100 + 20, EventName: 'SpikeDefused',
          EventTime: (round.defuseRoundMsec as number) ?? 0, defuser: bombDefuser,
        })
        if (resultCode === 'BombDetonated') this.matchData.spikeDetonations.push({
          EventID: roundNum * 100 + 30, EventName: 'SpikeDetonated',
          EventTime: (round.defuseRoundMsec as number) ?? 0,
        })
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // BACKWARD COMPATIBILITY & FALLBACKS
  // ──────────────────────────────────────────────────────────────────────

  getLastGameMode(): string | null { return this.lastGameMode }

  async isMatchActive(): Promise<boolean> {
    const state = await this.getSessionState()
    return state?.sessionLoopState === 'INGAME'
  }

  async getGameMode(): Promise<string | null> {
    const state = await this.getSessionState()
    if (state?.queueId) {
      const mode = _normalizeQueueId(state.queueId)
      this.lastGameMode = mode
      return mode
    }
    return null
  }

  /**
   * Best-effort: read the Valorant log file and infer game mode from queue-related strings.
   * Fallback when lockfile API is unavailable.
   */
  async getGameModeFromLog(): Promise<string | null> {
    if (process.platform !== 'win32') return null
    const localAppData = process.env.LOCALAPPDATA
    if (!localAppData) return null
    const logPath = path.join(localAppData, 'VALORANT', 'Saved', 'Logs', 'VALORANT.log')
    try {
      const stat = fs.statSync(logPath)
      const readSize = Math.min(100_000, stat.size)
      const fd = fs.openSync(logPath, 'r')
      const buf = Buffer.alloc(readSize)
      fs.readSync(fd, buf, 0, readSize, stat.size - readSize)
      fs.closeSync(fd)
      const text = buf.toString('utf8').toLowerCase()
      if (text.includes('premier')) return 'PREMIER'
      if (text.includes('competitive')) return 'COMPETITIVE'
      if (text.includes('teamdeathmatch') || text.includes('hurm')) return 'TEAMDEATHMATCH'
      if (text.includes('deathmatch')) return 'DEATHMATCH'
      if (text.includes('spikerush') || text.includes('spike rush')) return 'SPIKERUSH'
      if (text.includes('swiftplay') || text.includes('swift play')) return 'SWIFTPLAY'
      if (text.includes('unrated')) return 'CLASSIC'
      return null
    } catch {
      return null
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function _normalizeRegion(region: string): string {
  return region.replace(/\d+$/, '').toLowerCase()
}

export function normalizeQueueId(queueId: string): string {
  return _normalizeQueueId(queueId)
}

function _normalizeQueueId(queueId: string): string {
  const map: Record<string, string> = {
    competitive: 'COMPETITIVE', unrated: 'CLASSIC', deathmatch: 'DEATHMATCH',
    spikerush: 'SPIKERUSH', swiftplay: 'SWIFTPLAY', snowball: 'SNOWBALL',
    premier: 'PREMIER', custom: 'CUSTOM', ggteam: 'ESCALATION',
    onefa: 'REPLICATION', hurm: 'TEAMDEATHMATCH', newmap: 'NEWMAP',
  }
  return map[queueId.toLowerCase()] ?? queueId.toUpperCase()
}
