import axios from 'axios'

interface GameEvent {
  EventID: number
  EventName: string
  EventTime: number
}

interface RiotSnapshot {
  activePlayer: Record<string, unknown> | null
  gameData: Record<string, unknown> | null
  events: GameEvent[]
  capturedAt: number
}

export class RiotLocalAPI {
  private _polling = false
  private _interval: NodeJS.Timeout | null = null
  private _events: GameEvent[] = []
  private _lastSnapshot: RiotSnapshot | null = null
  private _seenEventIds = new Set<number>()

  private readonly BASE_URL = 'https://127.0.0.1:2999'
  private readonly POLL_INTERVAL_MS = 5000

  start(): void {
    if (this._polling) return
    this._polling = true
    this._events = []
    this._seenEventIds = new Set()
    this._lastSnapshot = null

    this._interval = setInterval(() => this._poll(), this.POLL_INTERVAL_MS)
    console.log('[RiotLocalAPI] Started polling localhost:2999')
  }

  stop(): RiotSnapshot | null {
    this._polling = false
    if (this._interval) {
      clearInterval(this._interval)
      this._interval = null
    }
    console.log(`[RiotLocalAPI] Stopped. Captured ${this._events.length} events.`)
    return this._lastSnapshot
  }

  private async _poll(): Promise<void> {
    try {
      const client = axios.create({
        baseURL: this.BASE_URL,
        timeout: 3000,
        // Riot Local API uses a self-signed cert
        httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
      })

      const [allDataRes, eventsRes] = await Promise.allSettled([
        client.get('/liveclientdata/allgamedata'),
        client.get('/liveclientdata/eventdata')
      ])

      const allData = allDataRes.status === 'fulfilled' ? allDataRes.value.data : null
      const eventsData = eventsRes.status === 'fulfilled' ? eventsRes.value.data : null

      // Collect new events (deduplicated by EventID)
      if (eventsData?.Events) {
        for (const event of eventsData.Events as GameEvent[]) {
          if (!this._seenEventIds.has(event.EventID)) {
            this._seenEventIds.add(event.EventID)
            this._events.push(event)
          }
        }
      }

      this._lastSnapshot = {
        activePlayer: allData?.activePlayer || null,
        gameData: allData?.gameData || null,
        events: [...this._events],
        capturedAt: Date.now()
      }
    } catch {
      // Riot Local API not available — game may not be fully loaded yet
    }
  }
}
