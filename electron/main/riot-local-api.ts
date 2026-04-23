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
  /** Spike plant events */
  spikePlants: SpikePlantedEvent[]
  /** Spike defuse events */
  spikeDefuses: SpikeDefusedEvent[]
  /** Spike detonation events */
  spikeDetonations: SpikeDetonatedEvent[]
  /** First blood events (one per round) */
  firstBloods: FirstBloodEvent[]
  /** Round-by-round summaries */
  roundSummaries: RoundSummary[]
  /** Final player stats snapshot taken when match ends */
  finalStats: FinalPlayerStats | null
  /** Stats for every player on both teams — captured at match end */
  teamSnapshot: TeamPlayerSnapshot[]
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
  /** Tracks the current spike state within a round — reset when a new round starts */
  private currentRoundSpike: { planted: boolean; site: string | null; planter: string | null; defused: boolean; defuser: string | null; detonated: boolean } = { planted: false, site: null, planter: null, defused: false, defuser: null, detonated: false }
  /** Tracks first blood in current round */
  private currentRoundFirstBlood: { killerName: string; victimName: string } | null = null
  /** Latest cached activePlayer gold and abilities */
  private latestGold: number | null = null
  private latestAbilities: PlayerAbilities | null = null

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
      spikePlants: [],
      spikeDefuses: [],
      spikeDetonations: [],
      firstBloods: [],
      roundSummaries: [],
      finalStats: null,
      teamSnapshot: [],
      startTime: Date.now(),
      endTime: null
    }
    this.roundNumber = 0
    this.currentRoundSpike = { planted: false, site: null, planter: null, defused: false, defuser: null, detonated: false }
    this.currentRoundFirstBlood = null
    this.latestGold = null
    this.latestAbilities = null
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
    console.log(`[RiotLocalApi] Stopped. Captured ${result?.events.length ?? 0} events, ${result?.killEvents.length ?? 0} kills, ${result?.roundSummaries.length ?? 0} rounds, ${result?.spikePlants.length ?? 0} spike plants, ${result?.teamSnapshot.length ?? 0} players.`)
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
        // mapName may be a full internal path like "/Game/Maps/Ascent/Ascent" — extract last segment
        const raw = gameData.mapName as string
        this.matchData.map = raw.includes('/') ? raw.split('/').filter(Boolean).pop() ?? raw : raw
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

      // Cache current gold and abilities from activePlayer (overwritten each poll)
      if (activePlayer) {
        const gold = activePlayer.currentGold
        if (typeof gold === 'number') this.latestGold = gold

        const rawAbilities = activePlayer.abilities as Record<string, Record<string, unknown>> | undefined
        if (rawAbilities) {
          this.latestAbilities = this._parseAbilities(rawAbilities)
        }
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
              if (kill.killerName.toLowerCase() === playerName) {
                this.matchData.playerKills.push(kill)
              } else if (kill.victimName.toLowerCase() === playerName) {
                this.matchData.playerDeaths.push(kill)
              }
            }
          }

          if (eventName === 'FirstBlood') {
            const fb: FirstBloodEvent = {
              ...base,
              EventName: 'FirstBlood',
              killerName: (rawEvent.KillerName as string) ?? '',
              victimName: (rawEvent.VictimName as string) ?? ''
            }
            this.matchData.firstBloods.push(fb)
            this.currentRoundFirstBlood = { killerName: fb.killerName, victimName: fb.victimName }
          }

          if (eventName === 'SpikePlanted') {
            const plant: SpikePlantedEvent = {
              ...base,
              EventName: 'SpikePlanted',
              planter: (rawEvent.BombPlanter as string) ?? '',
              site: (rawEvent.PlantSite as string) ?? ''
            }
            this.matchData.spikePlants.push(plant)
            this.currentRoundSpike.planted = true
            this.currentRoundSpike.site = plant.site
            this.currentRoundSpike.planter = plant.planter
          }

          if (eventName === 'SpikeDefused') {
            const defuse: SpikeDefusedEvent = {
              ...base,
              EventName: 'SpikeDefused',
              defuser: (rawEvent.BombDefuser as string) ?? ''
            }
            this.matchData.spikeDefuses.push(defuse)
            this.currentRoundSpike.defused = true
            this.currentRoundSpike.defuser = defuse.defuser
          }

          if (eventName === 'SpikeDetonated') {
            const detonate: SpikeDetonatedEvent = { ...base, EventName: 'SpikeDetonated' }
            this.matchData.spikeDetonations.push(detonate)
            this.currentRoundSpike.detonated = true
          }

          // Track round completions — capture full snapshot at each round end
          if (eventName === 'RoundEnded' || eventName === 'RoundDecided') {
            this.roundNumber++
            const playerStats = this._extractPlayerStats(allPlayers, this.matchData.playerName)
            const playerName = this.matchData.playerName?.toLowerCase() ?? ''

            const playerGotFirstBlood = !!this.currentRoundFirstBlood &&
              this.currentRoundFirstBlood.killerName.toLowerCase() === playerName
            const playerWasFirstBlood = !!this.currentRoundFirstBlood &&
              this.currentRoundFirstBlood.victimName.toLowerCase() === playerName

            this.matchData.roundSummaries.push({
              roundNumber: this.roundNumber,
              winningTeam: (rawEvent.WinningTeam as string) ?? null,
              ceremony: (rawEvent.Ceremony as string) ?? (rawEvent.RoundResult as string) ?? null,
              endTime: eventTime,
              playerStats,
              spikePlanted: this.currentRoundSpike.planted,
              spikeSite: this.currentRoundSpike.site,
              spikePlanter: this.currentRoundSpike.planter,
              spikeDefused: this.currentRoundSpike.defused,
              spikeDefuser: this.currentRoundSpike.defuser,
              spikeDetonated: this.currentRoundSpike.detonated,
              playerGold: this.latestGold,
              playerAbilities: this.latestAbilities,
              playerGotFirstBlood,
              playerWasFirstBlood
            })

            // Reset round-scoped trackers
            this.currentRoundSpike = { planted: false, site: null, planter: null, defused: false, defuser: null, detonated: false }
            this.currentRoundFirstBlood = null
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

      // Merge team snapshot so disconnected players are preserved
      if (allPlayers && allPlayers.length > 0) {
        const existing = new Map(this.matchData.teamSnapshot.map((p) => [p.summonerName, p]))
        for (const p of allPlayers) {
          const scores = p.scores as Record<string, number> | undefined
          const name = (p.summonerName as string) ?? (p.riotId as string) ?? 'Unknown'
          existing.set(name, {
            summonerName: name,
            agent: (p.championName as string) ?? null,
            team: (p.team as string) ?? 'Unknown',
            kills: scores?.kills ?? 0,
            deaths: scores?.deaths ?? 0,
            assists: scores?.assists ?? 0,
            score: scores?.combatScore ?? scores?.creepScore ?? 0,
            level: (p.level as number) ?? 0
          })
        }
        this.matchData.teamSnapshot = [...existing.values()]
      }
    } catch {
      // Game not running yet or between rounds — silently ignore
    }
  }

  private _parseAbilities(raw: Record<string, Record<string, unknown>>): PlayerAbilities {
    const parseSlot = (slot: Record<string, unknown> | undefined): AbilityState | null => {
      if (!slot) return null
      return {
        displayName: (slot.displayName as string) ?? (slot.id as string) ?? 'Unknown',
        charges: typeof slot.charges === 'number' ? (slot.charges as number) : null,
        currentPoints: typeof slot.currentPoints === 'number' ? (slot.currentPoints as number) : null,
        maxPoints: typeof slot.maxPoints === 'number' ? (slot.maxPoints as number) : null
      }
    }
    return {
      ability1: parseSlot(raw.Ability1),
      ability2: parseSlot(raw.Ability2),
      grenade: parseSlot(raw.Grenade),
      signature: parseSlot(raw.Signature),
      ultimate: parseSlot(raw.Ultimate)
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
      return name === nameLower
    })
    if (!player) return null
    const scores = player.scores as Record<string, number> | undefined
    if (!scores) return null
    return {
      kills: scores.kills ?? 0,
      deaths: scores.deaths ?? 0,
      assists: scores.assists ?? 0,
      score: scores.combatScore ?? scores.creepScore ?? 0
    }
  }

  private _getPlayerTeam(
    allPlayers: Array<Record<string, unknown>> | undefined,
    playerName: string | null
  ): string | null {
    if (!allPlayers || !playerName) return null
    const nameLower = playerName.toLowerCase()
    const player = allPlayers.find((p) => ((p.summonerName as string) ?? '').toLowerCase() === nameLower)
    return (player?.team as string) ?? null
  }

  private _getPlayerLevel(
    allPlayers: Array<Record<string, unknown>> | undefined,
    playerName: string | null
  ): number {
    if (!allPlayers || !playerName) return 0
    const nameLower = playerName.toLowerCase()
    const player = allPlayers.find((p) => ((p.summonerName as string) ?? '').toLowerCase() === nameLower)
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
