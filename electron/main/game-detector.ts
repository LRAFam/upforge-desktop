import { EventEmitter } from 'events'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const IS_WIN = process.platform === 'win32'

// Process names to watch per game (Windows only).
// For Valorant we ONLY watch VALORANT-Win64-Shipping.exe — the in-game process.
// VALORANT.exe is the launcher/lobby and runs even while the player is in the main menu;
// using it as the trigger would fire game-started in the lobby before a match begins.
// VALORANT-Win64-Shipping.exe is loaded only when a map is actually loading/playing.
const GAME_PROCESSES: Record<string, string[]> = {
  valorant: ['VALORANT-Win64-Shipping.exe'],
  cs2: ['cs2.exe'],
  deadlock: ['deadlock.exe'],
}

// Poll interval when no game is running (check for game start)
const POLL_IDLE_MS = 5000
// Poll interval while a game is active (check for game stop) — less frequent to reduce in-game overhead
const POLL_ACTIVE_MS = 10000

export class GameDetector extends EventEmitter {
  private _polling = false
  private _interval: NodeJS.Timeout | null = null
  private _activeGame: string | null = null
  private _simTimer: NodeJS.Timeout | null = null
  /** Consecutive tasklist misses before emitting game-stopped (avoids flake mid-match). */
  private _missedPollStreak = 0
  private static readonly MISSED_POLLS_BEFORE_STOP = 2
  /** Last primary game from settings — used to clear stale active state on manual switch. */
  private _watchGame: string | null = null

  start(): void {
    if (this._polling) return
    this._polling = true
    this._scheduleNext()
    console.log('[GameDetector] Started polling (idle: %dms, active: %dms)', POLL_IDLE_MS, POLL_ACTIVE_MS)
  }

  stop(): void {
    this._polling = false
    if (this._interval) {
      clearInterval(this._interval)
      this._interval = null
    }
    if (this._simTimer) {
      clearTimeout(this._simTimer)
      this._simTimer = null
    }
  }

  currentGame(): string | null {
    return this._activeGame
  }

  /**
   * Sync with settings.primaryGame — clears stale active state when the user
   * picks a different game in Settings. All supported games are always polled.
   */
  setWatchGame(
    game: string | null,
    options?: { deferActiveStop?: boolean },
  ): void {
    const normalized = game && GAME_PROCESSES[game] ? game : null
    this._watchGame = normalized

    if (
      normalized &&
      this._activeGame &&
      this._activeGame !== normalized &&
      !options?.deferActiveStop
    ) {
      const stopped = this._activeGame
      this._activeGame = null
      this.emit('game-stopped', stopped)
      console.log(`[GameDetector] ${stopped} stopped (primary game switched to ${normalized})`)
    }

    if (this._polling) {
      void this._poll()
    }
  }

  /**
   * Returns true if the Valorant *game* process is running (not just the launcher).
   * VALORANT-Win64-Shipping.exe only appears during actual match loading/play.
   * VALORANT.exe is the launcher — it runs from client open, not just during matches.
   */
  async isMatchProcessRunning(): Promise<boolean> {
    return this.isGameProcessRunning('valorant')
  }

  /** Check whether a supported game's capture process is running. */
  async isGameProcessRunning(game: string): Promise<boolean> {
    if (!IS_WIN) return false
    const processNames = GAME_PROCESSES[game]
    if (!processNames?.length) return false
    try {
      const results = await Promise.all(processNames.map((n) => this._isProcessRunning(n)))
      return results.some(Boolean)
    } catch {
      return false
    }
  }

  private _scheduleNext(): void {
    if (!this._polling) return
    const delay = this._activeGame ? POLL_ACTIVE_MS : POLL_IDLE_MS
    this._interval = setTimeout(async () => {
      await this._poll()
      this._scheduleNext()
    }, delay)
  }

  /** Simulate a game session for testing on non-Windows platforms */
  simulateGame(game = 'valorant', durationMs = 10000): void {
    // Cancel any in-flight simulation before starting a new one
    if (this._simTimer) {
      clearTimeout(this._simTimer)
      this._simTimer = null
    }
    console.log(`[GameDetector] ⚡ Simulating ${game} session for ${durationMs}ms`)
    this._activeGame = game
    this.emit('game-started', game)
    this._simTimer = setTimeout(() => {
      this._simTimer = null
      this._activeGame = null
      this.emit('game-stopped', game)
    }, durationMs)
  }

  private _gamesToPoll(): Array<[string, string[]]> {
    return Object.entries(GAME_PROCESSES)
  }

  private async _poll(): Promise<void> {
    // Game detection only works on Windows — Valorant/CS2 don't run on Mac/Linux
    if (!IS_WIN) return

    try {
      for (const [game, processNames] of this._gamesToPoll()) {
        const running = (
          await Promise.all(processNames.map((n) => this._isProcessRunning(n)))
        ).some(Boolean)

        if (running && this._activeGame !== game) {
          const previous = this._activeGame
          this._activeGame = game
          this._missedPollStreak = 0
          if (previous) {
            this.emit('game-stopped', previous)
            console.log(`[GameDetector] ${previous} stopped (switched to ${game})`)
          }
          this.emit('game-started', game)
          console.log(`[GameDetector] ${game} started`)
        } else if (running && this._activeGame === game) {
          this._missedPollStreak = 0
        } else if (!running && this._activeGame === game) {
          this._missedPollStreak++
          if (this._missedPollStreak < GameDetector.MISSED_POLLS_BEFORE_STOP) {
            console.log(
              `[GameDetector] ${game} process miss ${this._missedPollStreak}/` +
              `${GameDetector.MISSED_POLLS_BEFORE_STOP} — waiting before game-stopped`,
            )
            continue
          }
          this._missedPollStreak = 0
          this._activeGame = null
          this.emit('game-stopped', game)
          console.log(`[GameDetector] ${game} stopped`)
        }
      }
    } catch (err) {
      console.error('[GameDetector] Poll error:', err)
    }
  }

  /**
   * Check if a single named process is running using a filtered tasklist query.
   * Much cheaper than listing all processes — Windows only returns the matched rows.
   */
  private async _isProcessRunning(processName: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        `tasklist /fi "IMAGENAME eq ${processName}" /fo csv /nh`,
        { windowsHide: true, timeout: 4000 }
      )
      return stdout.toLowerCase().includes(processName.toLowerCase())
    } catch {
      return false
    }
  }
}
