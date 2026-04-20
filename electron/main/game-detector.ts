import { EventEmitter } from 'events'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const IS_WIN = process.platform === 'win32'

// Process names to watch per game (Windows only)
const GAME_PROCESSES: Record<string, string[]> = {
  valorant: ['VALORANT.exe', 'VALORANT-Win64-Shipping.exe'],
  cs2: ['cs2.exe']
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

  /** Simulate a game session for testing on non-Windows platforms */
  simulateGame(game = 'valorant', durationMs = 10000): void {
    console.log(`[GameDetector] ⚡ Simulating ${game} session for ${durationMs}ms`)
    this._activeGame = game
    this.emit('game-started', game)
    setTimeout(() => {
      this._activeGame = null
      this.emit('game-stopped', game)
    }, durationMs)
  }

  private async _poll(): Promise<void> {
    // Game detection only works on Windows — Valorant/CS2 don't run on Mac/Linux
    if (!IS_WIN) return

    try {
      const runningNames = await this._getRunningProcessNames()

      for (const [game, processNames] of Object.entries(GAME_PROCESSES)) {
        const running = processNames.some((name) => runningNames.has(name.toLowerCase()))

        if (running && this._activeGame !== game) {
          this._activeGame = game
          this.emit('game-started', game)
          console.log(`[GameDetector] ${game} started`)
        } else if (!running && this._activeGame === game) {
          this._activeGame = null
          this.emit('game-stopped', game)
          console.log(`[GameDetector] ${game} stopped`)
        }
      }
    } catch (err) {
      console.error('[GameDetector] Poll error:', err)
    }
  }

  /** Use Windows tasklist (built-in) to get running process names */
  private async _getRunningProcessNames(): Promise<Set<string>> {
    const { stdout } = await execAsync('tasklist /fo csv /nh', { windowsHide: true })
    const names = new Set<string>()
    for (const line of stdout.split('\n')) {
      const match = line.match(/^"([^"]+)"/)
      if (match) names.add(match[1].toLowerCase())
    }
    return names
  }
}
