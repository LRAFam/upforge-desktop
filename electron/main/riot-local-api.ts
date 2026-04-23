import https from 'https'
import net from 'net'

export interface GameEvent {
  EventID: number
  EventName: string
  EventTime: number
}

/** A kill/death event with full participant info from the Riot Live Client API */
export interface KillEvent extends GameEvent {
  EventName: 'ChampionKill'
  killerName: string
  victimName: string
  assistants: string[]
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

/** Full enriched match data — superset of MatchTimeline */
export interface MatchData {
  game: string
  map: string | null
  agent: string | null
  gameMode: string | null
  /** The local player's Riot ID (gameName#tagLine) — used to identify kills/deaths */
  playerName: string | null
  /** All timestamped events (lightweight, for frame selection) */
  events: GameEvent[]
  /** Kill events with full participant details */
  killEvents: KillEvent[]
  /** Kill events where the local player is the killer */
  playerKills: KillEvent[]
  /** Kill events where the local player is the victim */
  playerDeaths: KillEvent[]
  /** Round-by-round summaries */
  roundSummaries: RoundSummary[]
  /** Final player stats snapshot taken when match ends */
  finalStats: FinalPlayerStats | null
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
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private matchData: MatchData | null = null
  private lastGameMode: string | null = null
  private agent = new https.Agent({ rejectUnauthorized: false })
  private roundNumber = 0

  start(game: string): void {
    this.matchData = {
      game,
      map: null,
      agent: null,
      gameMode: null,
      playerName: null,
      events: [],
      killEvents: [],
      playerKills: [],
      playerDeaths: [],
      roundSummaries: [],
      finalStats: null,
      startTime: Date.now(),
      endTime: null
    }
    this.roundNumber = 0
    this._pollGameData()
    this.pollInterval = setInterval(() => this._pollGameData(), 10_000)
    console.log(`[RiotLocalApi] Started polling for ${game}`)
  }

  async stop(): Promise<MatchData | null> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    if (this.matchData) {
      // Do a final poll to capture end-of-match stats
      await this._pollGameData()
      this.matchData.endTime = Date.now()
    }
    const result = this.matchData
    this.matchData = null
    console.log(`[RiotLocalApi] Stopped. Captured ${result?.events.length ?? 0} events, ${result?.killEvents.length ?? 0} kills, ${result?.roundSummaries.length ?? 0} rounds.`)
    return result
  }

  /**
   * Returns true if Valorant's Live Client Data server is listening on port 2999.
   * Uses a raw TCP connect — no SSL issues, no cert problems.
   * Port 2999 is ONLY open when a match is actively in progress.
   */
  async isMatchActive(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket()
      socket.setTimeout(2000)
      socket.on('connect', () => { socket.destroy(); resolve(true) })
      socket.on('error', () => resolve(false))
      socket.on('timeout', () => { socket.destroy(); resolve(false) })
      socket.connect(2999, '127.0.0.1')
    })
  }

  /**
   * Probe the Riot Live Client API and return the gameMode string (e.g. "CLASSIC", "COMPETITIVE",
   * "DEATHMATCH", "SPIKERUSH", "SNOWBALL", "SWIFTPLAY").
   * Returns null when the game is not yet in a loadable state.
   */
  async getGameMode(): Promise<string | null> {
    try {
      const data = await this._fetch('https://127.0.0.1:2999/liveclientdata/allgamedata')
      const mode = (data.gameData as Record<string, unknown> | undefined)?.gameMode
      const result = typeof mode === 'string' ? mode.toUpperCase() : null
      if (result) this.lastGameMode = result
      return result
    } catch {
      return null
    }
  }

  /** Returns the last known game mode — useful after stop() is called */
  getLastGameMode(): string | null {
    return this.lastGameMode
  }

  private async _pollGameData(): Promise<void> {
    try {
      const data = await this._fetch('https://127.0.0.1:2999/liveclientdata/allgamedata')
      if (!this.matchData) return

      const gameData = data.gameData as Record<string, unknown> | undefined
      const activePlayer = data.activePlayer as Record<string, unknown> | undefined
      const allPlayers = data.allPlayers as Array<Record<string, unknown>> | undefined

      // Extract map, agent, game mode and player identity on first poll
      if (!this.matchData.map && gameData?.mapName) {
        this.matchData.map = gameData.mapName as string
      }
      if (!this.matchData.agent && activePlayer?.championName) {
        this.matchData.agent = activePlayer.championName as string
      }
      if (gameData?.gameMode) {
        const mode = (gameData.gameMode as string).toUpperCase()
        this.matchData.gameMode = mode
        this.lastGameMode = mode
      }
      // Capture the local player's Riot ID — used to identify their kills/deaths
      if (!this.matchData.playerName && activePlayer?.summonerName) {
        this.matchData.playerName = activePlayer.summonerName as string
        console.log(`[RiotLocalApi] Player identified: ${this.matchData.playerName}`)
      }

      // Process new events
      if (Array.isArray(data.events?.Events)) {
        const existingIds = new Set(this.matchData.events.map((e) => e.EventID))

        for (const rawEvent of data.events.Events) {
          const eventId = rawEvent.EventID as number
          const eventName = rawEvent.EventName as string
          const eventTime = rawEvent.EventTime as number

          if (existingIds.has(eventId)) continue
          existingIds.add(eventId)

          const base: GameEvent = { EventID: eventId, EventName: eventName, EventTime: eventTime }
          this.matchData.events.push(base)

          if (eventName === 'ChampionKill') {
            const kill: KillEvent = {
              ...base,
              EventName: 'ChampionKill',
              killerName: (rawEvent.KillerName as string) ?? '',
              victimName: (rawEvent.VictimName as string) ?? '',
              assistants: Array.isArray(rawEvent.Assistants) ? rawEvent.Assistants as string[] : []
            }
            this.matchData.killEvents.push(kill)

            const playerName = this.matchData.playerName?.toLowerCase()
            if (playerName) {
              if (kill.killerName.toLowerCase().includes(playerName) || kill.killerName.toLowerCase() === playerName) {
                this.matchData.playerKills.push(kill)
              } else if (kill.victimName.toLowerCase().includes(playerName) || kill.victimName.toLowerCase() === playerName) {
                this.matchData.playerDeaths.push(kill)
              }
            }
          }

          // Track round completions — capture player stats snapshot at each round end
          if (eventName === 'RoundEnded' || eventName === 'RoundDecided') {
            this.roundNumber++
            const playerStats = this._extractPlayerStats(allPlayers, this.matchData.playerName)
            this.matchData.roundSummaries.push({
              roundNumber: this.roundNumber,
              winningTeam: (rawEvent.WinningTeam as string) ?? null,
              ceremony: (rawEvent.Ceremony as string) ?? (rawEvent.RoundResult as string) ?? null,
              endTime: eventTime,
              playerStats
            })
          }
        }
      }

      // Continuously update final stats from allPlayers (overwritten each poll)
      const finalStats = this._extractPlayerStats(allPlayers, this.matchData.playerName)
      if (finalStats) {
        this.matchData.finalStats = {
          ...finalStats,
          summonerName: this.matchData.playerName,
          agent: this.matchData.agent,
          team: this._getPlayerTeam(allPlayers, this.matchData.playerName),
          level: this._getPlayerLevel(allPlayers, this.matchData.playerName)
        }
      }
    } catch {
      // Game not running yet or between rounds — silently ignore
    }
  }

  private _extractPlayerStats(
    allPlayers: Array<Record<string, unknown>> | undefined,
    playerName: string | null
  ): RoundPlayerStats | null {
    if (!allPlayers || !playerName) return null
    const nameLower = playerName.toLowerCase()
    const player = allPlayers.find((p) => {
      const name = ((p.summonerName as string) ?? '').toLowerCase()
      return name === nameLower || name.includes(nameLower)
    })
    if (!player) return null
    const scores = player.scores as Record<string, number> | undefined
    if (!scores) return null
    return {
      kills: scores.kills ?? 0,
      deaths: scores.deaths ?? 0,
      assists: scores.assists ?? 0,
      score: scores.creepScore ?? scores.wardScore ?? 0
    }
  }

  private _getPlayerTeam(
    allPlayers: Array<Record<string, unknown>> | undefined,
    playerName: string | null
  ): string | null {
    if (!allPlayers || !playerName) return null
    const nameLower = playerName.toLowerCase()
    const player = allPlayers.find((p) => ((p.summonerName as string) ?? '').toLowerCase().includes(nameLower))
    return (player?.team as string) ?? null
  }

  private _getPlayerLevel(
    allPlayers: Array<Record<string, unknown>> | undefined,
    playerName: string | null
  ): number {
    if (!allPlayers || !playerName) return 0
    const nameLower = playerName.toLowerCase()
    const player = allPlayers.find((p) => ((p.summonerName as string) ?? '').toLowerCase().includes(nameLower))
    return (player?.level as number) ?? 0
  }

  private _fetch(url: string): Promise<Record<string, unknown> & {
    gameData?: Record<string, unknown>
    activePlayer?: Record<string, unknown>
    allPlayers?: Array<Record<string, unknown>>
    events?: { Events: Array<Record<string, unknown>> }
  }> {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { agent: this.agent }, (res) => {
        let body = ''
        res.on('data', (chunk) => body += chunk)
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`))
            return
          }
          try { resolve(JSON.parse(body)) }
          catch { reject(new Error('Invalid JSON')) }
        })
      })
      req.on('error', reject)
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('Timeout')) })
    })
  }
}
