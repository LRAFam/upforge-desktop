import { EventEmitter } from 'events'
import { exec } from 'child_process'
import { promisify } from 'util'
import { isGsiMatchLive, isGsiReceiving } from './steam-gsi-server'
import {
  interpretTasklistProcessStdout,
  type ProcessProbeResult,
} from './match-wait-guard'

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
  lol: ['League of Legends.exe'],
}
const VALORANT_CLIENT_PROCESS = 'VALORANT.exe'

/** Stable priority when multiple games run — user's primary wins if it is running. */
export const GAME_DETECTION_ORDER = ['valorant', 'cs2', 'deadlock', 'lol'] as const

// Poll interval when no game is running (check for game start)
const POLL_IDLE_MS = 5000
// Poll interval while a game is active (check for game stop) — less frequent to reduce in-game overhead
const POLL_ACTIVE_MS = 10000

/**
 * Pick which game to track when several are open.
 * Prefers settings.primaryGame when its process is running; otherwise first in stable order.
 */
export function pickGameToTrack(
  runningGames: string[],
  watchGame: string | null,
): string | null {
  if (!runningGames.length) return null
  if (watchGame && runningGames.includes(watchGame)) return watchGame
  return GAME_DETECTION_ORDER.find((game) => runningGames.includes(game)) ?? runningGames[0] ?? null
}

export function runningGamesFromTasklist(stdout: string): string[] {
  const lower = stdout.toLowerCase()
  return GAME_DETECTION_ORDER.filter((game) =>
    GAME_PROCESSES[game].some((processName) => lower.includes(`"${processName.toLowerCase()}"`)),
  )
}

/** The launcher/client is safe for UI readiness, but never for match recording. */
export function isValorantClientOpenFromTasklist(stdout: string): boolean {
  const lower = stdout.toLowerCase()
  return lower.includes(`"${VALORANT_CLIENT_PROCESS.toLowerCase()}"`)
    || lower.includes('"valorant-win64-shipping.exe"')
}

/**
 * CS2 often stays open in the menu after a match while the user plays another title.
 * Yield tracking when GSI shows CS2 is not in a live map.
 */
export function pickHandoffGameWhenIdleInMenu(
  activeGame: string,
  runningGames: string[],
  watchGame: string | null,
): string | null {
  if (activeGame !== 'cs2') return null
  if (isGsiReceiving() && isGsiMatchLive()) return null
  const others = runningGames.filter((g) => g !== 'cs2')
  if (!others.length) return null
  return pickGameToTrack(others, watchGame)
}

export class GameDetector extends EventEmitter {
  private _polling = false
  private _interval: NodeJS.Timeout | null = null
  private _activeGame: string | null = null
  private _simTimer: NodeJS.Timeout | null = null
  /** Consecutive tasklist misses before emitting game-stopped (avoids flake mid-match). */
  private _missedPollStreak = 0
  private static readonly MISSED_POLLS_BEFORE_STOP = 2
  /** Last primary game from settings — preferred when multiple games are running. */
  private _watchGame: string | null = null
  private _valorantClientOpen = false

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

  /** True in the Valorant client/lobby or a live map. UI-only: never starts recording. */
  isValorantClientOpen(): boolean {
    return this._valorantClientOpen
  }

  /**
   * Clear tracked active game without emitting game-stopped.
   * Use when the process exited but poll streak has not caught up yet (e.g. CS2 restart).
   */
  resetActiveGame(game: string): void {
    if (this._activeGame === game) {
      this._activeGame = null
      this._missedPollStreak = 0
    }
  }

  /**
   * Sync with settings.primaryGame — clears stale active state when the user
   * picks a different game in Settings while not recording.
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
   * Tasklist timeouts/errors are treated as still running (avoid false match cancels).
   */
  async isMatchProcessRunning(): Promise<boolean> {
    return this.isGameProcessRunning('valorant')
  }

  /** Tri-state probe for Valorant Shipping.exe (running / stopped / unknown). */
  async probeMatchProcess(): Promise<ProcessProbeResult> {
    return this.probeGameProcess('valorant')
  }

  /**
   * Restore active-game tracking after a false game-stopped (process flake mid-load).
   * Does not emit game-started.
   */
  reviveActiveGame(game: string): void {
    if (!GAME_PROCESSES[game]) return
    this._activeGame = game
    this._missedPollStreak = 0
  }

  /**
   * Tri-state process probe. Prefer this over boolean checks when deciding to cancel
   * match-wait — `'unknown'` must not count as a process exit.
   */
  async probeGameProcess(game: string): Promise<ProcessProbeResult> {
    if (!IS_WIN) return 'stopped'
    const processNames = GAME_PROCESSES[game]
    if (!processNames?.length) return 'stopped'
    const results = await Promise.all(processNames.map((n) => this._probeProcess(n)))
    if (results.includes('running')) return 'running'
    if (results.every((r) => r === 'stopped')) return 'stopped'
    return 'unknown'
  }

  /**
   * Check whether a supported game's capture process is running.
   * `'unknown'` (tasklist timeout/error) counts as running so we do not false-cancel.
   */
  async isGameProcessRunning(game: string): Promise<boolean> {
    const result = await this.probeGameProcess(game)
    return result !== 'stopped'
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

  private async _poll(): Promise<void> {
    // Game detection only works on Windows — Valorant/CS2 don't run on Mac/Linux
    if (!IS_WIN) return

    try {
      const { stdout } = await execAsync(
        'tasklist /fo csv /nh',
        { windowsHide: true, timeout: 4000, maxBuffer: 2 * 1024 * 1024 },
      )
      const runningGames = runningGamesFromTasklist(stdout)
      this._valorantClientOpen = isValorantClientOpenFromTasklist(stdout)

      const active = this._activeGame

      // CS2 stays open in menu after a match — hand off when Valorant/Deadlock starts.
      if (active && runningGames.includes(active)) {
        const handoff = pickHandoffGameWhenIdleInMenu(active, runningGames, this._watchGame)
        if (handoff) {
          this._missedPollStreak = 0
          this._activeGame = null
          this.emit('game-stopped', active)
          console.log(`[GameDetector] ${active} idle in menu — handing off to ${handoff}`)
          this._activeGame = handoff
          this.emit('game-started', handoff)
          return
        }
        this._missedPollStreak = 0
        return
      }

      // Stick to the active game until its process is gone — ignore other running games.
      if (active) {
        this._missedPollStreak++
        if (this._missedPollStreak < GameDetector.MISSED_POLLS_BEFORE_STOP) {
          console.log(
            `[GameDetector] ${active} process miss ${this._missedPollStreak}/` +
            `${GameDetector.MISSED_POLLS_BEFORE_STOP} — waiting before game-stopped`,
          )
          return
        }

        this._missedPollStreak = 0
        this._activeGame = null
        this.emit('game-stopped', active)
        console.log(`[GameDetector] ${active} stopped`)
      }

      if (!runningGames.length) return

      const next = pickGameToTrack(runningGames, this._watchGame)
      if (!next) return

      this._activeGame = next
      this._missedPollStreak = 0
      this.emit('game-started', next)
      if (runningGames.length > 1) {
        console.log(
          `[GameDetector] ${next} started (${runningGames.length} games running — tracking ${next} per primary/first-until-close)`,
        )
      } else {
        console.log(`[GameDetector] ${next} started`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const timedOut = /ETIMEDOUT|timeout/i.test(msg)
      console.warn(
        timedOut
          ? '[GameDetector] Full tasklist poll timed out — keeping active game state'
          : '[GameDetector] Poll error:',
        err,
      )
    }
  }

  /**
   * Probe a single named process via filtered tasklist.
   * Timeouts/errors → `'unknown'` (never treat as stopped).
   */
  private async _probeProcess(processName: string): Promise<ProcessProbeResult> {
    try {
      const { stdout } = await execAsync(
        `tasklist /fi "IMAGENAME eq ${processName}" /fo csv /nh`,
        { windowsHide: true, timeout: 4000 },
      )
      return interpretTasklistProcessStdout(stdout, processName)
    } catch {
      return 'unknown'
    }
  }
}
