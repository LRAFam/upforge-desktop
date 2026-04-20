import { EventEmitter } from 'events'
import psList from 'ps-list'

const GAME_PROCESSES: Record<string, string> = {
  valorant: 'VALORANT-Win64-Shipping.exe',
  cs2: 'cs2.exe'
}

const POLL_INTERVAL_MS = 5000

export class GameDetector extends EventEmitter {
  private _polling = false
  private _interval: NodeJS.Timeout | null = null
  private _activeGame: string | null = null

  start(): void {
    if (this._polling) return
    this._polling = true
    this._interval = setInterval(() => this._poll(), POLL_INTERVAL_MS)
    console.log('[GameDetector] Started polling every', POLL_INTERVAL_MS, 'ms')
  }

  stop(): void {
    this._polling = false
    if (this._interval) {
      clearInterval(this._interval)
      this._interval = null
    }
  }

  currentGame(): string | null {
    return this._activeGame
  }

  private async _poll(): Promise<void> {
    try {
      const processes = await psList()
      const processNames = new Set(processes.map((p) => p.name))

      for (const [game, processName] of Object.entries(GAME_PROCESSES)) {
        const running = processNames.has(processName)

        if (running && this._activeGame !== game) {
          this._activeGame = game
          this.emit('game-started', game)
        } else if (!running && this._activeGame === game) {
          this._activeGame = null
          this.emit('game-stopped', game)
        }
      }
    } catch (err) {
      console.error('[GameDetector] Poll error:', err)
    }
  }
}
