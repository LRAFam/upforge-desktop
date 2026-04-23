import https from 'https'

export interface GameEvent {
  EventID: number
  EventName: string
  EventTime: number
}

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
  private timeline: MatchTimeline | null = null
  private lastGameMode: string | null = null
  private agent = new https.Agent({ rejectUnauthorized: false })

  start(game: string): void {
    this.timeline = {
      game,
      map: null,
      agent: null,
      events: [],
      startTime: Date.now(),
      endTime: null
    }
    this._pollGameData()
    this.pollInterval = setInterval(() => this._pollGameData(), 10_000)
    console.log(`[RiotLocalApi] Started polling for ${game}`)
  }

  stop(): MatchTimeline | null {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    if (this.timeline) {
      this.timeline.endTime = Date.now()
    }
    const result = this.timeline
    this.timeline = null
    console.log(`[RiotLocalApi] Stopped. Captured ${result?.events.length ?? 0} events.`)
    return result
  }

  /**
   * Returns true if the Riot Live Client API is responding — this is the reliable match-start
   * signal. The API only responds once the game has loaded in (after loading screen).
   */
  async isMatchActive(): Promise<boolean> {
    try {
      await this._fetch('https://127.0.0.1:2999/liveclientdata/allgamedata')
      return true
    } catch {
      return false
    }
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
      if (!this.timeline) return

      // Extract map, agent, and game mode on first poll
      if (!this.timeline.map && data.gameData?.mapName) {
        this.timeline.map = data.gameData.mapName as string
      }
      if (!this.timeline.agent && data.activePlayer?.championName) {
        this.timeline.agent = data.activePlayer.championName as string
      }
      if (data.gameData?.gameMode) {
        this.lastGameMode = (data.gameData.gameMode as string).toUpperCase()
      }

      // Collect new events
      if (Array.isArray(data.events?.Events)) {
        const existingIds = new Set(this.timeline.events.map((e: GameEvent) => e.EventID))
        for (const event of data.events.Events) {
          if (!existingIds.has(event.EventID)) {
            this.timeline.events.push({
              EventID: event.EventID,
              EventName: event.EventName,
              EventTime: event.EventTime
            })
          }
        }
      }
    } catch {
      // Game not running yet or between rounds — silently ignore
    }
  }

  private _fetch(url: string): Promise<Record<string, unknown> & { gameData?: Record<string, unknown>; activePlayer?: Record<string, unknown>; events?: { Events: GameEvent[] } }> {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { agent: this.agent }, (res) => {
        let body = ''
        res.on('data', (chunk) => body += chunk)
        res.on('end', () => {
          try { resolve(JSON.parse(body)) }
          catch { reject(new Error('Invalid JSON')) }
        })
      })
      req.on('error', reject)
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('Timeout')) })
    })
  }
}
