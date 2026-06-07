import https from 'https'
import tls from 'tls'
import fs from 'fs'
import path from 'path'
import {
  resolveAgentName,
  resolveWeaponName,
  resolveMapName,
  resolveTierName,
  resolveEconomyWeapon,
  resolveEconomyArmor,
} from './riot-lookup-tables'
export {
  resolveAgentName,
  resolveWeaponName,
  resolveMapName,
  resolveTierName,
  resolveEconomyWeapon,
  resolveEconomyArmor,
} from './riot-lookup-tables'
import { applySpatialEnrichment } from './spatial/enrich'
import { deriveMatchScore } from './match-score'
import {
  shouldApplyMatchDetails,
  shouldUseMatchHistoryFallback,
} from './match-details-validation'
export type {
  GameEvent,
  KillEvent,
  SpikePlantedEvent,
  SpikeDefusedEvent,
  SpikeDetonatedEvent,
  FirstBloodEvent,
  AbilityState,
  PlayerAbilities,
  RoundPlayerStats,
  RoundSummary,
  TeamPlayerSnapshot,
  FinalPlayerStats,
  RoundScore,
  LockfileData,
  SessionState,
  MatchData,
  MatchTimeline,
} from './riot-types'
import type {
  GameEvent,
  KillEvent,
  SpikePlantedEvent,
  SpikeDefusedEvent,
  SpikeDetonatedEvent,
  LockfileData,
  SessionState,
  MatchData,
  RoundScore,
  FinalPlayerStats,
  TeamPlayerSnapshot,
  RoundSummary,
} from './riot-types'

export class RiotLocalApi {
  private tlsAgent = new https.Agent({ rejectUnauthorized: false })
  private lockfileData: LockfileData | null = null
  private ownPuuid: string | null = null
  private accessToken: string | null = null
  private entitlementsToken: string | null = null
  private region: string | null = null
  private playerName: string | null = null
  private playerTag: string | null = null
  /** Current Riot client version — fetched from valorant-api.com at init, used in PVP API headers. */
  private clientVersion = 'release-09.08-shipping-15-2656652'
  private matchData: MatchData | null = null
  private presencePollInterval: ReturnType<typeof setInterval> | null = null
  /** Lightweight INGAME→MENUS watcher when recording was skipped (no matchData / no start()). */
  private menuWatchInterval: ReturnType<typeof setInterval> | null = null
  private menuWatchGeneration = 0
  private wsSocket: tls.TLSSocket | null = null
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
  private lastSessionLoopState: string = 'MENUS'
  private matchEnded = false
  private currentMatchId: string | null = null
  private lastGameMode: string | null = null
  /** Counts how many times core-game agent fetch has been attempted this match. */
  private agentFetchAttempts = 0
  /** Max retries for agent fetch — covers ~3 mins of polling (every 3 s) during loading + early game. */
  private readonly MAX_AGENT_FETCH_ATTEMPTS = 60
  /** Circuit breaker: consecutive getSessionState failures */
  private _sessionStateFailures = 0
  private readonly SESSION_STATE_CB_THRESHOLD = 10
  private _sessionStateCbOpen = false
  private _sessionStateCbResetAt = 0

  /**
   * Fired when presence transitions INGAME -> MENUS (match ended).
   * Set this before calling start() to stop recording promptly.
   */
  public onMatchEnded: (() => void | Promise<void>) | null = null

  /**
   * Poll presence until the player returns to menus after a skipped match.
   * Unlike onMatchEnded, this works without start() / matchData (recording was skipped).
   */
  watchUntilMenus(onReturn: () => void | Promise<void>): void {
    this.cancelMenuWatch()
    const gen = ++this.menuWatchGeneration
    let lastLoop: string | null = null
    let sawIngame = false

    const tick = async () => {
      if (gen !== this.menuWatchGeneration) return
      try {
        const state = await this.getSessionState()
        const loop = state?.sessionLoopState ?? 'MENUS'

        // Only fire after a real INGAME session ends — not PREGAME→MENUS (agent select back-out)
        // and not a false positive on the first poll when loop is already MENUS.
        if (sawIngame && lastLoop === 'INGAME' && loop === 'MENUS') {
          this.cancelMenuWatch()
          console.log('[RiotLocalApi] Skipped match ended — player returned to menus')
          await Promise.resolve(onReturn())
          return
        }

        if (loop === 'INGAME') {
          sawIngame = true
          lastLoop = 'INGAME'
        } else if (loop !== 'PREGAME') {
          lastLoop = loop
        }
      } catch { /* Riot API flake — keep polling */ }
    }

    this.menuWatchInterval = setInterval(() => { void tick() }, 2000)
    void tick()
  }

  cancelMenuWatch(): void {
    this.menuWatchGeneration++
    if (this.menuWatchInterval) {
      clearInterval(this.menuWatchInterval)
      this.menuWatchInterval = null
    }
  }

  /** Return a snapshot of internal state for the developer diagnostics panel. */
  getDiagnostics(): {
    lockfileFound: boolean
    ownPuuid: string | null
    region: string | null
    playerName: string | null
    playerTag: string | null
    accessTokenPresent: boolean
    entitlementsTokenPresent: boolean
    clientVersion: string
    matchDataActive: boolean
    currentMatchId: string | null
    circuitBreakerOpen: boolean
    sessionStateFailures: number
    lastSessionLoopState: string
  } {
    return {
      lockfileFound: this.lockfileData !== null,
      ownPuuid: this.ownPuuid,
      region: this.region,
      playerName: this.playerName,
      playerTag: this.playerTag,
      accessTokenPresent: !!this.accessToken,
      entitlementsTokenPresent: !!this.entitlementsToken,
      clientVersion: this.clientVersion,
      matchDataActive: this.matchData !== null,
      currentMatchId: this.currentMatchId ?? this.matchData?.matchId ?? null,
      circuitBreakerOpen: this._sessionStateCbOpen,
      sessionStateFailures: this._sessionStateFailures,
      lastSessionLoopState: this.lastSessionLoopState,
    }
  }



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
    // Fetch current client version for Riot PVP API headers (non-blocking)
    this._fetchClientVersion().catch(() => {})
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

  /** Fetch the current Riot client version from valorant-api.com (non-blocking). */
  private async _fetchClientVersion(): Promise<void> {
    try {
      const res = await fetch('https://valorant-api.com/v1/version')
      const data = await res.json() as { data?: { riotClientVersion?: string } }
      if (data?.data?.riotClientVersion) {
        this.clientVersion = data.data.riotClientVersion
        console.log(`[RiotLocalApi] Client version: ${this.clientVersion}`)
      }
    } catch { /* keep fallback version */ }
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

    // Circuit breaker — stop hammering the local API after repeated failures
    if (this._sessionStateCbOpen) {
      if (Date.now() < this._sessionStateCbResetAt) return null
      this._sessionStateCbOpen = false
      this._sessionStateFailures = 0
    }

    try {
      const data = await this._fetchLocal<{
        presences: Array<{ puuid: string; product: string; private: string }>
      }>('/chat/v4/presences')
      if (!this._validateShape(data, ['presences'])) {
        this._sessionStateFailures++
        if (this._sessionStateFailures >= this.SESSION_STATE_CB_THRESHOLD) {
          this._sessionStateCbOpen = true
          this._sessionStateCbResetAt = Date.now() + 30_000
        }
        return null
      }
      const own = data.presences?.find((p) => p.puuid === this.ownPuuid && p.product === 'valorant')
      if (!own?.private) return null
      const decoded = JSON.parse(Buffer.from(own.private, 'base64').toString()) as Record<string, unknown>
      const mpd = (decoded.matchPresenceData ?? {}) as Record<string, unknown>
      const provisioningFlow = (decoded.provisioningFlow ?? mpd.provisioningFlow ?? '') as string
      const isReplay = provisioningFlow.toLowerCase() === 'replay'
      this._sessionStateFailures = 0
      return {
        sessionLoopState: (mpd.sessionLoopState ?? decoded.sessionLoopState ?? 'MENUS') as string,
        queueId: (mpd.queueId ?? decoded.queueId ?? null) as string | null,
        matchMap: (mpd.matchMap ?? decoded.matchMap ?? null) as string | null,
        allyScore: (decoded.partyOwnerMatchScoreAllyTeam ?? 0) as number,
        enemyScore: (decoded.partyOwnerMatchScoreEnemyTeam ?? 0) as number,
        isReplay,
      }
    } catch {
      this._sessionStateFailures++
      if (this._sessionStateFailures >= this.SESSION_STATE_CB_THRESHOLD) {
        this._sessionStateCbOpen = true
        this._sessionStateCbResetAt = Date.now() + 30_000
      }
      return null
    }
  }

  private _validateShape(obj: unknown, keys: string[]): obj is Record<string, unknown> {
    if (typeof obj !== 'object' || obj === null) return false
    return keys.every(k => k in (obj as Record<string, unknown>))
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
      if (this.matchData && !this.matchEnded) {
        this.wsReconnectTimer = setTimeout(() => this._connectWebSocket(), 5000)
      }
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
    if (uri.includes('/core-game/v1/matches/')) {
      if (!this.currentMatchId) {
        const m = uri.match(/core-game\/v1\/matches\/([0-9a-f-]{36})/i)
        if (m) {
          this.currentMatchId = m[1]
          if (this.matchData) this.matchData.matchId = m[1]
          console.log(`[RiotLocalApi] Match ID from WS URI: ${m[1]}`)
        }
      }
      // Extract agent from the WS payload if not yet captured
      if (this.matchData && !this.matchData.agent) {
        const players = data.Players as Array<{ Subject?: string; CharacterID?: string }> | undefined
        const own = players?.find(p => p.Subject?.toLowerCase() === this.ownPuuid?.toLowerCase())
        if (own?.CharacterID) {
          const agentName = resolveAgentName(own.CharacterID)
          if (agentName) {
            this.matchData.agent = agentName
            console.log(`[RiotLocalApi] Agent from WS core-game event: ${agentName}`)
          }
        }
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

    // If agent still unknown, try core-game REST API — retry until match ends
    if (!this.matchData.agent && this.agentFetchAttempts < this.MAX_AGENT_FETCH_ATTEMPTS && this.ownPuuid) {
      this.agentFetchAttempts++
      this._fetchAgentFromCoreGame().catch(() => { /* swallow — not fatal */ })
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
      const endedCb = this.onMatchEnded
      this.onMatchEnded = null
      if (endedCb) {
        Promise.resolve(endedCb()).catch((err) => {
          console.error('[RiotLocalApi] onMatchEnded handler error:', err)
        })
      }
      return
    }
    this.lastSessionLoopState = sessionLoopState
  }

  // ──────────────────────────────────────────────────────────────────────
  // MATCH LIFECYCLE
  // ──────────────────────────────────────────────────────────────────────

  /** Fetch agent from the local core-game (or pre-game) API during a live/loading match. */
  private async _fetchAgentFromCoreGame(): Promise<void> {
    if (!this.matchData || !this.ownPuuid) return
    try {
      // Core-game endpoint is available once the game has fully loaded into the match
      const player = await this._fetchLocal<{ Subject: string; MatchID: string }>(
        `/core-game/v1/players/${this.ownPuuid}`
      )
      if (!player?.MatchID) {
        // Fall back to pre-game endpoint (agent select / loading screen phase)
        await this._fetchAgentFromPreGame()
        return
      }
      // Capture matchId while we have it — enables post-match MatchDetails fetch
      if (!this.matchData.matchId && player.MatchID) {
        this.matchData.matchId = player.MatchID
        this.currentMatchId = player.MatchID
        console.log(`[RiotLocalApi] Match ID from core-game REST: ${player.MatchID}`)
      }
      const match = await this._fetchLocal<{
        Players?: Array<{ Subject?: string; CharacterID?: string }>
      }>(`/core-game/v1/matches/${player.MatchID}`)
      const own = match?.Players?.find(
        (p) => p.Subject?.toLowerCase() === this.ownPuuid?.toLowerCase()
      )
      if (own?.CharacterID && this.matchData) {
        const agentName = resolveAgentName(own.CharacterID)
        if (agentName) {
          this.matchData.agent = agentName
          console.log(`[RiotLocalApi] Agent from core-game REST: ${agentName}`)
        }
      }
    } catch (err) {
      // Core-game not yet available — try pre-game instead
      console.log(
        `[RiotLocalApi] Core-game attempt ${this.agentFetchAttempts} failed: ` +
        `${err instanceof Error ? err.message : String(err)}`
      )
      try { await this._fetchAgentFromPreGame() } catch { /* ignore */ }
    }
  }

  /** Try pre-game API for agent during agent select / loading screen. */
  private async _fetchAgentFromPreGame(): Promise<void> {
    if (!this.matchData || !this.ownPuuid) return
    try {
      const player = await this._fetchLocal<{ Subject: string; MatchID: string }>(
        `/pregame/v1/players/${this.ownPuuid}`
      )
      if (!player?.MatchID) return
      const match = await this._fetchLocal<{
        AllyTeam?: { Players?: Array<{ Subject?: string; CharacterID?: string }> }
      }>(`/pregame/v1/matches/${player.MatchID}`)
      const own = match?.AllyTeam?.Players?.find(
        (p) => p.Subject?.toLowerCase() === this.ownPuuid?.toLowerCase()
      )
      if (own?.CharacterID && this.matchData) {
        const agentName = resolveAgentName(own.CharacterID)
        if (agentName) {
          this.matchData.agent = agentName
          console.log(`[RiotLocalApi] Agent from pre-game REST: ${agentName}`)
        }
      }
    } catch { /* pre-game not available */ }
  }

  /**
   * Start tracking a match.
   * @param game           'valorant' or 'cs2'
   * @param matchStartTime  Epoch ms when presence transitioned to INGAME
   */
  start(game: string, matchStartTime?: number): void {
    if (this.matchData && !this.matchEnded) {
      console.warn('[RiotLocalApi] start() called while match already active — ignoring duplicate start')
      return
    }
    this.matchEnded = false
    this.currentMatchId = null
    this.agentFetchAttempts = 0
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
      gameplayStartTime: null,
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
      videoSyncOffsetMs: DEFAULT_VIDEO_SYNC_OFFSET_MS,
    }
    this._connectWebSocket()
    this.presencePollInterval = setInterval(() => this._pollPresence(), 10_000)
    // Attempt agent fetch immediately (game is already INGAME by the time start() is called)
    setTimeout(() => this._fetchAgentFromCoreGame().catch(() => {}), 500)
    console.log(`[RiotLocalApi] Match tracking started (game=${game} matchStartTime=${matchStartTime})`)
  }

  /** Update the recording start time once the recorder has actually begun capturing. */
  setRecordingStartTime(ts: number): void {
    if (this.matchData) this.matchData.recordingStartTime = ts
  }

  /**
   * Mark the moment actual gameplay began (buy phase of round 1).
   * Called by the overlay poll the first time it sees INGAME state after recording starts.
   * This corrects for the loading screen gap between INGAME presence and real game start.
   */
  setGameplayStartTime(ts: number): void {
    if (this.matchData && this.matchData.gameplayStartTime == null) {
      this.matchData.gameplayStartTime = ts
      console.log(`[RiotLocalApi] Gameplay start time captured: offset from recording = ${ts - this.matchData.recordingStartTime}ms`)
    }
  }

  /**
   * Stop tracking and return enriched MatchData.
   * Fetches Riot MatchDetails API post-match if matchId + region are available.
   */
  async stop(): Promise<MatchData | null> {
    if (this.presencePollInterval) { clearInterval(this.presencePollInterval); this.presencePollInterval = null }
    if (this.wsReconnectTimer) { clearTimeout(this.wsReconnectTimer); this.wsReconnectTimer = null }
    if (this.wsSocket) { this.wsSocket.destroy(); this.wsSocket = null }
    if (!this.matchData) return null
    this.matchData.endTime = Date.now()
    if (!this.matchData.matchId && this.currentMatchId) this.matchData.matchId = this.currentMatchId

    console.log(
      `[RiotLocalApi] Stop — matchId=${this.matchData.matchId} region=${this.region} ` +
      `agent=${this.matchData.agent} agentAttempts=${this.agentFetchAttempts}`
    )

    await this._refreshTokens()

    // If auth was never initialized (lockfile missing at game-start), try once more now —
    // the Riot Client is still running in post-game lobby.
    if (!this.accessToken || !this.entitlementsToken) {
      console.log('[RiotLocalApi] stop() — no tokens, attempting late initAuth')
      await this.initAuth()
    }

    // If region is still unknown, try fetching it from the chat session one more time.
    // This handles the case where region wasn't available during initAuth() but is now
    // (e.g. Riot Client connection was slow at game start).
    if (!this.region && this.lockfileData) {
      try {
        const sess = await this._fetchLocal<{ region: string }>('/chat/v1/session')
        if (sess.region) {
          this.region = _normalizeRegion(sess.region)
          console.log(`[RiotLocalApi] Region recovered at match-end: ${this.region}`)
        }
      } catch { /* ignore — proceed without region */ }
    }

    // If we still don't have a matchId, look it up via match history (not for custom/practice).
    if (
      !this.matchData.matchId
      && this.region
      && this.ownPuuid
      && shouldUseMatchHistoryFallback(this.matchData)
    ) {
      console.log('[RiotLocalApi] No matchId captured — trying match history fallback')
      const latestId = await this._fetchLatestMatchId()
      if (latestId) {
        this.matchData.matchId = latestId
        console.log(`[RiotLocalApi] matchId from history: ${latestId}`)
      }
    } else if (!this.matchData.matchId) {
      console.log(
        `[RiotLocalApi] Skipping match history fallback (mode=${this.matchData.gameMode} map=${this.matchData.map})`
      )
    }

    if (this.matchData.matchId && this.region) {
      console.log(`[RiotLocalApi] Fetching MatchDetails for ${this.matchData.matchId}`)
      const details = await this._fetchMatchDetails(this.matchData.matchId)
      if (details) {
        const validation = shouldApplyMatchDetails(this.matchData, details)
        if (validation.apply) {
          this.matchData.matchDetails = details
          this._populateFromMatchDetails(details)
        } else {
          console.warn(
            `[RiotLocalApi] Rejected MatchDetails for ${this.matchData.matchId}: ${validation.reason} — using presence/WS data only`
          )
          this.matchData.matchId = null
        }
      } else {
        console.log('[RiotLocalApi] MatchDetails fetch failed — using presence data only')
      }
    } else {
      console.log(
        `[RiotLocalApi] Skipping MatchDetails — matchId=${this.matchData.matchId} region=${this.region} ` +
        `accessToken=${!!this.accessToken} entitlementsToken=${!!this.entitlementsToken} — clips will NOT be extracted`
      )
    }

    const result = this.matchData
    this.matchData = null
    console.log(
      `[RiotLocalApi] Stop complete — kills=${result.killEvents.length} ` +
      `rounds=${result.roundSummaries.length} matchId=${result.matchId} agent=${result.agent}`
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
            'X-Riot-ClientVersion': this.clientVersion,
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

  /** Fetch the most recent matchId from the Riot match-history API as a fallback. */
  private async _fetchLatestMatchId(): Promise<string | null> {
    if (!this.region || !this.ownPuuid || !this.accessToken || !this.entitlementsToken) return null
    return new Promise((resolve) => {
      const req = https.get(
        {
          hostname: `pd.${this.region}.a.pvp.net`,
          port: 443,
          path: `/match-history/v1/history/${this.ownPuuid}?startIndex=0&endIndex=1`,
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'X-Riot-Entitlements-JWT': this.entitlementsToken!,
            'X-Riot-ClientPlatform':
              'ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9',
            'X-Riot-ClientVersion': this.clientVersion,
          },
        },
        (res) => {
          let body = ''
          res.on('data', (chunk: Buffer) => (body += chunk))
          res.on('end', () => {
            if (res.statusCode !== 200) {
              console.log(`[RiotLocalApi] MatchHistory HTTP ${res.statusCode}: ${body.slice(0, 200)}`)
              resolve(null); return
            }
            try {
              const parsed = JSON.parse(body) as { History?: Array<{ MatchID: string }> }
              const matchId = parsed.History?.[0]?.MatchID ?? null
              console.log(`[RiotLocalApi] MatchHistory returned matchId=${matchId}`)
              resolve(matchId)
            } catch { resolve(null) }
          })
        }
      )
      req.on('error', (err: Error) => { console.log(`[RiotLocalApi] MatchHistory error: ${err.message}`); resolve(null) })
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

    // Replace event streams — do not append onto presence/WS data from a different match.
    this.matchData.killEvents = []
    this.matchData.events = []
    this.matchData.playerKills = []
    this.matchData.playerDeaths = []
    this.matchData.roundSummaries = []
    this.matchData.teamSnapshot = []
    this.matchData.spikePlants = []
    this.matchData.spikeDefuses = []
    this.matchData.spikeDetonations = []
    this.matchData.firstBloods = []

    if (matchInfo?.mapId) {
      this.matchData.map = resolveMapName(matchInfo.mapId as string)
    }
    if (matchInfo?.queueID && !this.matchData.queueId) {
      const queueId = matchInfo.queueID as string
      this.matchData.queueId = queueId
      this.matchData.gameMode = _normalizeQueueId(queueId)
      this.lastGameMode = this.matchData.gameMode
    }

    const ownLower = this.ownPuuid?.toLowerCase()
    const ownPlayer = players?.find((p) => (p.subject as string)?.toLowerCase() === ownLower)

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
          score: stats.score ?? 0,
          summonerName: gameName ?? this.matchData.playerName ?? null,
          agent: this.matchData.agent,
          team: (ownPlayer.teamId as string) ?? null,
          level: (ownPlayer.accountLevel as number) ?? 0,
          // HS% and ADR are computed later once we've processed all round damage events
          headshotPct: null, adr: null,
          accountLevel: (ownPlayer.accountLevel as number) ?? null,
        }
      }
    }

    if (players && players.length > 0) {
      this.matchData.teamSnapshot = players.map((p) => {
        const stats = p.stats as Record<string, unknown> | undefined
        const casts = (stats?.abilityCasts) as Record<string, number> | undefined
        const agentName = resolveAgentName(p.characterId as string) ?? null
        const gameName = (p.gameName as string) || null
        const tier = (p.competitiveTier as number) ?? 0
        return {
          summonerName: gameName ?? agentName ?? `Player ${((p.subject as string) ?? '').slice(0, 6)}`,
          agent: agentName,
          team: (p.teamId as string) ?? 'Unknown',
          kills: (stats?.kills as number) ?? 0,
          deaths: (stats?.deaths as number) ?? 0,
          assists: (stats?.assists as number) ?? 0,
          score: (stats?.score as number) ?? 0,
          level: (p.accountLevel as number) ?? 0,
          puuid: (p.subject as string) ?? null,
          competitiveTier: tier,
          competitiveTierName: resolveTierName(tier),
          abilityCasts: casts ? {
            grenade: casts.grenadeCasts ?? 0,
            ability1: casts.ability1Casts ?? 0,
            ability2: casts.ability2Casts ?? 0,
            ultimate: casts.ultimateCasts ?? 0,
          } : null,
        }
      })
    }

    // Kill events — map Riot game-clock ms to position in the local recording file.
    // timeSinceGameStartMillis tracks in-round time (after loading), closer to gameplayStartTime
    // than INGAME presence (matchStartTime, which includes the loading screen).
    const { offset: recordingOffset, recordingLagMs, clockSkewMs, loadSkewMs, reference } =
      computeRecordingOffsetMeta(this.matchData)
    console.log(
      `[RiotLocalApi] videoOffset base — matchStart=${this.matchData.matchStartTime} ` +
      `gameplayStart=${this.matchData.gameplayStartTime} recordingStart=${this.matchData.recordingStartTime} ` +
      `recordingLag=${recordingLagMs}ms clockSkew=${clockSkewMs}ms loadSkew=${loadSkewMs}ms ` +
      `offset=${recordingOffset}ms (using ${reference})`
    )

    // PUUID → display label (Riot name, else agent — never raw UUID in UI)
    const puuidToAgent = new Map<string, string>()
    const puuidToName = new Map<string, string>()
    for (const p of (players ?? [])) {
      const sub = p.subject as string | undefined
      if (!sub) continue
      const agent = resolveAgentName(p.characterId as string)
      const gameName = (p.gameName as string) || null
      if (agent) puuidToAgent.set(sub, agent)
      if (gameName) puuidToName.set(sub, gameName)
      else if (agent) puuidToName.set(sub, agent)
    }

    const _resolveName = (puuid: string | undefined): string => {
      if (!puuid) return 'Unknown'
      if (puuid.toLowerCase() === ownLower) return 'You'
      return puuidToName.get(puuid) ?? puuidToAgent.get(puuid) ?? 'Enemy'
    }

    if (allKills && allKills.length > 0) {
      let eventId = 1
      for (const k of allKills) {
        // `timeSinceGameStartMillis` is populated for competitive/unrated.
        // For TDM/hurm Riot returns 0; use `gameTime` (also ms since game start) as fallback.
        const rawTsgm = k.timeSinceGameStartMillis as number | undefined
        const tsgm = (rawTsgm != null && rawTsgm > 0) ? rawTsgm : ((k.gameTime as number) ?? 0)
        const videoOffsetMs = Math.max(0, recordingOffset + tsgm)
        const killerPuuid = k.killer as string
        const victimPuuid = k.victim as string
        const ev: KillEvent = {
          EventID: eventId++,
          EventName: 'ChampionKill',
          EventTime: tsgm / 1000,
          killerName: _resolveName(killerPuuid),
          victimName: _resolveName(victimPuuid),
          assistants: (k.assistants as string[]) ?? [],
          timeSinceGameStartMillis: tsgm,
          videoOffsetMs,
          weapon: resolveWeaponName(
            (k.finishingDamage as Record<string, unknown>)?.damageType as string | undefined,
            (k.finishingDamage as Record<string, unknown>)?.damageItem as string | undefined,
          ) ?? undefined,
          killerPuuid,
          victimPuuid,
          round: (k.round as number) ?? 0,
        }
        this.matchData.killEvents.push(ev)
        // `events` is kept in-memory for legacy readers only; upload uses killEvents only.
        this.matchData.events.push(ev)
        // Case-insensitive PUUID comparison — Riot occasionally returns mixed-case UUIDs
        if (killerPuuid?.toLowerCase() === ownLower) this.matchData.playerKills.push(ev)
        if (victimPuuid?.toLowerCase() === ownLower) this.matchData.playerDeaths.push(ev)
      }
    }

    // TDM and Deathmatch have no rounds, no economy, no spike
    const isTDM = this.matchData.gameMode === 'TEAMDEATHMATCH'
    const isDM = this.matchData.gameMode === 'DEATHMATCH'
    const roundStartGameMs = buildRoundStartGameMs(allKills)

    if (!isTDM && !isDM && roundResults && roundResults.length > 0) {
      // Pre-build a per-round death count for the own player from the top-level kills array.
      // roundResults.playerStats only has kills/assists — deaths must be cross-referenced here.
      const deathsPerRound = new Map<number, number>()
      for (const k of (allKills ?? [])) {
        if ((k.victim as string)?.toLowerCase() === ownLower) {
          const r = (k.round as number) ?? 0
          deathsPerRound.set(r, (deathsPerRound.get(r) ?? 0) + 1)
        }
      }

      // Pre-compute HS% and ADR from per-round damage events.
      let totalDamage = 0
      let totalHeadshots = 0
      let totalShotsLanded = 0

      for (const round of roundResults) {
        const prs = (round.playerStats as Array<Record<string, unknown>> | undefined)
          ?.find((ps) => (ps.subject as string)?.toLowerCase() === ownLower)
        const damage = prs?.damage as Array<Record<string, unknown>> | undefined
        if (damage) {
          for (const d of damage) {
            const hs = (d.headshots as number) ?? 0
            const bs = (d.bodyshots as number) ?? 0
            const ls = (d.legshots as number) ?? 0
            totalHeadshots += hs
            totalShotsLanded += hs + bs + ls
            totalDamage += (d.damage as number) ?? 0
          }
        }
      }

      const roundCount = roundResults.length
      if (this.matchData.finalStats) {
        this.matchData.finalStats.adr = roundCount > 0
          ? Math.round((totalDamage / roundCount) * 10) / 10
          : null
        this.matchData.finalStats.headshotPct = totalShotsLanded > 0
          ? Math.round((totalHeadshots / totalShotsLanded) * 1000) / 10
          : null
      }

      for (const round of roundResults) {
        const roundNum = (round.roundNum as number) ?? 0
        const winningTeam = (round.winningTeam as string) ?? null
        const resultCode = (round.roundResultCode as string) ?? (round.roundResult as string) ?? null
        const bombPlanterRaw = (round.bombPlanter as string) ?? null
        const bombDefuserRaw = (round.bombDefuser as string) ?? null
        const bombPlanter = bombPlanterRaw ? _resolveName(bombPlanterRaw) : null
        const bombDefuser = bombDefuserRaw ? _resolveName(bombDefuserRaw) : null
        const plantSite = (round.plantSite as string) ?? null
        const prs = (round.playerStats as Array<Record<string, unknown>> | undefined)
          ?.find((ps) => (ps.subject as string)?.toLowerCase() === ownLower)
        const economy = prs?.economy as Record<string, unknown> | undefined
        this.matchData.roundSummaries.push({
          roundNumber: roundNum,
          winningTeam,
          ceremony: resultCode,
          endTime: (round.defuseRoundMsec as number) || (round.plantRoundMsec as number) || 0,
          playerStats: prs ? {
            kills: (prs.kills as unknown[])?.length ?? 0,
            deaths: deathsPerRound.get(roundNum) ?? 0,
            assists: (prs.assists as unknown[])?.length ?? 0,
            score: (prs.score as number) ?? 0,
          } : null,
          spikePlanted: !!bombPlanter, spikeSite: plantSite, spikePlanter: bombPlanter,
          spikeDefused: !!bombDefuser, spikeDefuser: bombDefuser,
          spikeDetonated: resultCode === 'BombDetonated',
          playerGold: (economy?.remaining as number) ?? null,
          playerAbilities: null,
          playerGotFirstBlood: false, playerWasFirstBlood: false,
          playerSpent: (economy?.spent as number) ?? null,
          playerLoadoutValue: (economy?.loadoutValue as number) ?? null,
          playerWeapon: resolveEconomyWeapon(economy?.weapon) ?? null,
          playerArmor: resolveEconomyArmor(economy?.armor) ?? null,
        })
        if (bombPlanter) {
          const plantLocal = (round.plantRoundTime as number) ?? (round.plantRoundMsec as number) ?? 0
          const gameTimeMs = (roundStartGameMs.get(roundNum) ?? 0) + plantLocal
          this.matchData.spikePlants.push({
            EventID: roundNum * 100 + 10, EventName: 'SpikePlanted',
            EventTime: plantLocal, planter: bombPlanter, site: plantSite ?? '',
            round: roundNum, gameTimeMs,
            videoOffsetMs: Math.max(0, recordingOffset + gameTimeMs),
          })
        }
        if (bombDefuser) {
          const defuseLocal = (round.defuseRoundTime as number) ?? (round.defuseRoundMsec as number) ?? 0
          const gameTimeMs = (roundStartGameMs.get(roundNum) ?? 0) + defuseLocal
          this.matchData.spikeDefuses.push({
            EventID: roundNum * 100 + 20, EventName: 'SpikeDefused',
            EventTime: defuseLocal, defuser: bombDefuser,
            round: roundNum, gameTimeMs,
            videoOffsetMs: Math.max(0, recordingOffset + gameTimeMs),
          })
        }
        if (resultCode === 'BombDetonated') {
          const detLocal = (round.defuseRoundTime as number) ?? (round.defuseRoundMsec as number) ?? 0
          const gameTimeMs = (roundStartGameMs.get(roundNum) ?? 0) + detLocal
          this.matchData.spikeDetonations.push({
            EventID: roundNum * 100 + 30, EventName: 'SpikeDetonated',
            EventTime: detLocal, round: roundNum, gameTimeMs,
            videoOffsetMs: Math.max(0, recordingOffset + gameTimeMs),
          })
        }
      }
    }

    try {
      applySpatialEnrichment(this.matchData)
    } catch (err) {
      console.warn('[RiotLocalApi] Spatial enrichment failed:', err)
    }

    const derived = deriveMatchScore(this.matchData)
    if (derived) {
      this.matchData.finalScore = derived
      // Presence roundScores can lag by one round — append authoritative final snapshot.
      const last = this.matchData.roundScores[this.matchData.roundScores.length - 1]
      if (
        !last
        || last.allyScore !== derived.allyScore
        || last.enemyScore !== derived.enemyScore
      ) {
        this.matchData.roundScores.push({
          allyScore: derived.allyScore,
          enemyScore: derived.enemyScore,
          detectedAt: Date.now(),
        })
      }
    }

    recomputeTimelineVideoOffsets(this.matchData)
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
      if (text.includes('swiftplay') || text.includes('swift play')) return 'SWIFTPLAY'
      if (text.includes('spikerush') || text.includes('spike rush')) return 'SPIKERUSH'
      if (text.includes('teamdeathmatch') || text.includes('hurm')) return 'TEAMDEATHMATCH'
      if (text.includes('competitive')) return 'COMPETITIVE'
      if (text.includes('deathmatch')) return 'DEATHMATCH'
      if (text.includes('unrated')) return 'CLASSIC'
      return null
    } catch {
      return null
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // LATE POST-MATCH HELPERS
  // ──────────────────────────────────────────────────────────────────────

  /**
   * One-shot match details fetch using stored tokens. Riot takes 1-3 minutes
   * to process match data after a game ends — callers should delay 60-120s before calling.
   */
  async fetchMatchDetailsLate(matchId: string): Promise<Record<string, unknown> | null> {
    // If auth was never initialized (e.g. lockfile wasn't available at game start),
    // try once more now — the Riot Client is still running post-match.
    if (!this.accessToken || !this.entitlementsToken) {
      console.log('[RiotLocalApi] fetchMatchDetailsLate — no tokens, attempting initAuth')
      await this.initAuth()
    } else {
      try { await this._refreshTokens() } catch { /* best-effort token refresh */ }
    }
    // Recover region if not yet set
    if (!this.region && this.lockfileData) {
      try {
        const sess = await this._fetchLocal<{ region: string }>('/chat/v1/session')
        if (sess.region) {
          this.region = _normalizeRegion(sess.region)
          console.log(`[RiotLocalApi] Region recovered for late fetch: ${this.region}`)
        }
      } catch { /* ignore */ }
    }
    if (!this.region || !this.accessToken || !this.entitlementsToken) {
      console.log(`[RiotLocalApi] fetchMatchDetailsLate — still no auth after retry (region=${this.region} token=${!!this.accessToken}) — clips cannot be extracted`)
      return null
    }
    return this._fetchMatchDetails(matchId)
  }

  /**
   * Populate an existing MatchData's kills/rounds from a late-fetched MatchDetails response.
   * Used to backfill kill events after Riot has finished processing the match.
   */
  populateMatchDataFromDetails(matchData: MatchData, details: Record<string, unknown>): void {
    const validation = shouldApplyMatchDetails(matchData, details)
    if (!validation.apply) {
      console.warn(
        `[RiotLocalApi] Late MatchDetails rejected for ${matchData.matchId}: ${validation.reason}`
      )
      return
    }
    const prev = this.matchData
    this.matchData = matchData
    try { this._populateFromMatchDetails(details) } finally { this.matchData = prev }
  }

  /**
   * Fetch agent and map directly from the pregame REST endpoint.
   * Available from the moment agent select begins through the loading screen.
   * Returns null if the pregame endpoint is not reachable (e.g. game hasn't loaded yet).
   */
  async getPregameContext(): Promise<{ agent: string | null; map: string | null; mode: string | null } | null> {
    if (!this.lockfileData || !this.ownPuuid) return null
    try {
      const player = await this._fetchLocal<{ Subject: string; MatchID: string }>(
        `/pregame/v1/players/${this.ownPuuid}`
      )
      if (!player?.MatchID) return null

      const match = await this._fetchLocal<{
        MapID?: string
        QueueID?: string
        AllyTeam?: { Players?: Array<{ Subject?: string; CharacterID?: string }> }
      }>(`/pregame/v1/matches/${player.MatchID}`)

      const mapName = match?.MapID ? resolveMapName(match.MapID) : null
      const mode = match?.QueueID ? _normalizeQueueId(match.QueueID) : null
      const own = match?.AllyTeam?.Players?.find(
        (p) => p.Subject?.toLowerCase() === this.ownPuuid?.toLowerCase()
      )
      const agentName = own?.CharacterID ? resolveAgentName(own.CharacterID) : null

      return { agent: agentName, map: mapName, mode }
    } catch {
      return null
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map Riot game-clock ms to position in the local recording file.
 *
 * Riot kill timestamps (`timeSinceGameStartMillis`) count from round gameplay, not INGAME
 * presence (loading screen). The ms from recording start to that clock-zero moment is:
 *   loadSkewMs - setupDelayMs
 * where setupDelayMs = recordingStart − matchStart (INGAME) and loadSkewMs ≈ loading duration.
 *
 * Do not use overlay `gameplayStartTime` directly — it is stamped when the first session poll
 * succeeds (often seconds late), which shifts every seek forward.
 */
function computeRecordingOffsetMeta(timeline: Pick<MatchData, 'gameplayStartTime' | 'matchStartTime' | 'recordingStartTime'>): {
  offset: number
  recordingLagMs: number
  clockSkewMs: number
  loadSkewMs: number
  reference: 'setupDelay' | 'pollLoad' | 'typicalLoad' | 'gameplayStartTime' | 'recordingLag'
} {
  const { gameplayStartTime, matchStartTime, recordingStartTime } = timeline
  const recordingLagMs = (matchStartTime != null && recordingStartTime != null)
    ? Math.max(0, recordingStartTime - matchStartTime)
    : 0
  const clockSkewMs = (gameplayStartTime != null && matchStartTime != null)
    ? gameplayStartTime - matchStartTime
    : 0

  const TYPICAL_LOAD_MS = 10_000
  const MIN_TRUSTED_POLL_LOAD_MS = 8_000
  const MAX_LOAD_MS = 22_000
  const MIN_SETUP_FOR_SYNC_MS = 5_000
  const MAX_SETUP_FOR_SYNC_MS = 20_000

  let loadSkewMs = TYPICAL_LOAD_MS
  let reference: ReturnType<typeof computeRecordingOffsetMeta>['reference'] = 'typicalLoad'

  if (matchStartTime != null) {
    if (
      recordingLagMs >= MIN_SETUP_FOR_SYNC_MS
      && recordingLagMs <= MAX_SETUP_FOR_SYNC_MS
    ) {
      // Recorder spun up near the end of loading — guns-up aligns with recording start.
      loadSkewMs = recordingLagMs
      reference = 'setupDelay'
    } else if (
      clockSkewMs >= MIN_TRUSTED_POLL_LOAD_MS
      && clockSkewMs <= MAX_LOAD_MS
      && clockSkewMs > recordingLagMs + 4_000
    ) {
      // Poll fired well after match start (plausibly near gameplay), not just recorder lag.
      loadSkewMs = clockSkewMs
      reference = 'pollLoad'
    }
    const offset = Math.max(0, loadSkewMs - recordingLagMs)
    return { offset, recordingLagMs, clockSkewMs, loadSkewMs, reference }
  }

  if (gameplayStartTime != null) {
    const offset = Math.max(0, gameplayStartTime - recordingStartTime)
    return { offset, recordingLagMs, clockSkewMs, loadSkewMs, reference: 'gameplayStartTime' }
  }

  return { offset: Math.max(0, -recordingLagMs), recordingLagMs, clockSkewMs, loadSkewMs, reference: 'recordingLag' }
}

/** Estimate each round's gameplay-start ms from kill gameTime − roundTime. */
function buildRoundStartGameMs(
  allKills: Array<Record<string, unknown>> | undefined,
): Map<number, number> {
  const map = new Map<number, number>()
  for (const k of allKills ?? []) {
    const r = (k.round as number) ?? 0
    const gameTime = (k.timeSinceGameStartMillis as number) ?? (k.gameTime as number) ?? 0
    const roundTime = (k.roundTime as number) ?? (k.timeSinceRoundStartMillis as number) ?? -1
    if (gameTime <= 0 || roundTime < 0) continue
    const start = gameTime - roundTime
    const prev = map.get(r)
    if (prev == null || start < prev) map.set(r, start)
  }
  return map
}

function patchSpikeVideoOffsets(
  timeline: MatchData,
  recordingOffset: number,
): void {
  const patch = (ev: { gameTimeMs?: number; videoOffsetMs?: number }) => {
    if (ev.gameTimeMs != null && !isNaN(ev.gameTimeMs)) {
      ev.videoOffsetMs = Math.max(0, recordingOffset + ev.gameTimeMs)
    }
  }
  for (const p of timeline.spikePlants ?? []) patch(p)
  for (const d of timeline.spikeDefuses ?? []) patch(d)
  for (const d of timeline.spikeDetonations ?? []) patch(d)
}

/** Keep spatial heatmap seek times aligned after offset recalculation. */
function syncSpatialVideoOffsets(timeline: MatchData): void {
  const events = timeline.spatialSummary?.events
  if (!events?.length) return
  let deathIdx = 0
  let killIdx = 0
  for (const ev of events) {
    if (ev.type === 'death') {
      const src = timeline.playerDeaths[deathIdx++]
      if (src?.videoOffsetMs != null) ev.videoOffsetMs = src.videoOffsetMs
    } else if (ev.type === 'kill') {
      const src = timeline.playerKills[killIdx++]
      if (src?.videoOffsetMs != null) ev.videoOffsetMs = src.videoOffsetMs
    }
  }
}

/** Default VOD sync nudge — events sit ~8s late without this offset on typical recordings. */
export const DEFAULT_VIDEO_SYNC_OFFSET_MS = -8_000

export function effectiveVideoSyncOffsetMs(timeline: MatchData): number {
  if (timeline.videoSyncOffsetMs != null) return timeline.videoSyncOffsetMs
  return DEFAULT_VIDEO_SYNC_OFFSET_MS
}

/** Total ms from recording start to Riot game-clock zero, including manual nudge. */
export function totalRecordingOffsetMs(timeline: MatchData): number {
  const { offset } = computeRecordingOffsetMeta(timeline)
  return offset + effectiveVideoSyncOffsetMs(timeline)
}

/** Shift all event timestamps by deltaMs and persist on the timeline object. */
export function nudgeTimelineSyncOffset(timeline: MatchData, deltaMs: number): void {
  timeline.videoSyncOffsetMs = (timeline.videoSyncOffsetMs ?? 0) + deltaMs
  recomputeTimelineVideoOffsets(timeline)
}

/** Recompute kill/death videoOffsetMs (fixes stored timelines + VOD review sync). */
export function recomputeTimelineVideoOffsets(timeline: MatchData): void {
  const recordingOffset = totalRecordingOffsetMs(timeline)
  const patch = (ev: KillEvent) => {
    const tsgm = ev.timeSinceGameStartMillis
    if (tsgm != null && !isNaN(tsgm)) {
      ev.videoOffsetMs = Math.max(0, recordingOffset + tsgm)
    }
  }
  for (const k of timeline.killEvents ?? []) patch(k)
  for (const k of timeline.playerKills ?? []) patch(k)
  for (const k of timeline.playerDeaths ?? []) patch(k)
  patchSpikeVideoOffsets(timeline, recordingOffset)
  syncSpatialVideoOffsets(timeline)
}

function _normalizeRegion(region: string): string {
  const r = region.replace(/\d+$/, '').toLowerCase()
  // Map EU shards (euw, eun) to 'eu'; Korean shard 'kr' to 'ko' (Riot PVP API naming)
  if (r.startsWith('eu')) return 'eu'
  if (r === 'kr') return 'ko'
  return r
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
