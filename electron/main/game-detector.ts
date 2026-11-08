import { EventEmitter } from 'events'
import log from 'electron-log'
import { exec } from 'child_process'
import { promisify } from 'util'
import { isGsiMatchLive, isGsiReceiving } from './steam-gsi-server'
import {
  interpretTasklistProcessStdout,
  type ProcessProbeResult,
} from './match-wait-guard'
import {
  POLL_ACTIVE_MS,
  POLL_CONFIRMED_MS,
  POLL_IDLE_MS,
  PROCESS_SNAPSHOT_MAX_AGE_MS,
  nextProcessPollDelayMs,
  probeFromSnapshot,
  type ProcessSnapshot,
} from './process-poll-plan'

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

export interface GameDetectorOptions {
  /** Full `tasklist /fo csv /nh` output. Injected by tests; Windows uses tasklist. */
  listProcesses?: () => Promise<string>
}

export class GameDetector extends EventEmitter {
  private readonly _listProcesses: (() => Promise<string>) | null
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
  /** Game a game API confirmed is in a live match — full tasklist slows to POLL_CONFIRMED_MS. */
  private _confirmedGame: string | null = null
  /** Latest full process list, reused by in-match process checks. */
  private _snapshot: ProcessSnapshot | null = null
  private _pollInFlight: Promise<void> | null = null
  private _timerDueAt = 0

  constructor(opts: GameDetectorOptions = {}) {
    super()
    this._listProcesses = opts.listProcesses ?? null
  }

  start(): void {
    if (this._polling) return
    this._polling = true
    this._scheduleNext()
    console.log(
      '[GameDetector] Started polling (idle: %dms, active: %dms, confirmed match: %dms)',
      POLL_IDLE_MS, POLL_ACTIVE_MS, POLL_CONFIRMED_MS,
    )
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
      log.info(`[GameDetector] ${stopped} stopped (primary game switched to ${normalized})`)
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
   * Start a fresh match watch for a game that is still running (after a match ended / was skipped).
   * Keeps the game active so the next poll does NOT emit a second game-started: two emits used to run
   * two CS2 match flows at once, each starting and stopping recordings ("app"/"cs2" lines alternating).
   */
  rearmWatch(game: string): void {
    this.reviveActiveGame(game)
    this.emit('game-started', game)
  }

  /** Run one process poll now (tests). */
  pollOnce(): Promise<void> {
    return this._poll()
  }

  /**
   * Set while a game API (Valorant presence, CS2/Deadlock GSI, LoL live client) shows a live
   * match. The full process poll then runs every POLL_CONFIRMED_MS instead of POLL_ACTIVE_MS.
   */
  setMatchConfirmed(confirmed: boolean): void {
    const next = confirmed ? this._activeGame : null
    if (next === this._confirmedGame) return
    this._confirmedGame = next
    // Leaving a confirmed match: do not sit on a 30 s timer.
    if (!next && this._polling && this._interval && this._timerDueAt - Date.now() > POLL_ACTIVE_MS) {
      this._scheduleNext()
    }
  }

  /**
   * Process probe that reuses the latest full tasklist when it is at most `maxAgeMs` old.
   * Otherwise runs one full poll now (shared with the detector's own timer), so in-match
   * checks never spawn a second, filtered tasklist. Poll failure → 'unknown'.
   */
  async probeGameProcessRecent(
    game: string,
    maxAgeMs = PROCESS_SNAPSHOT_MAX_AGE_MS,
  ): Promise<ProcessProbeResult> {
    if (!IS_WIN && !this._listProcesses) return 'stopped'
    const processNames = GAME_PROCESSES[game]
    if (!processNames?.length) return 'stopped'
    const cached = probeFromSnapshot(this._snapshot, processNames, maxAgeMs)
    if (cached) return cached
    const before = this._snapshot
    await this._pollNow()
    if (this._snapshot === before) return 'unknown'
    return probeFromSnapshot(this._snapshot, processNames, Number.POSITIVE_INFINITY) ?? 'unknown'
  }

  /** Shipping.exe check for the in-match loop — reuses the latest full process list. */
  async isMatchProcessRunningRecent(): Promise<boolean> {
    return await this.probeGameProcessRecent('valorant') !== 'stopped'
  }

  /** Out-of-band poll: joins a poll in flight, then restarts the timer from now. */
  private async _pollNow(): Promise<void> {
    await this._pollShared()
    if (this._polling) this._scheduleNext()
  }

  private _pollShared(): Promise<void> {
    if (!this._pollInFlight) {
      this._pollInFlight = this._poll().finally(() => { this._pollInFlight = null })
    }
    return this._pollInFlight
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
    // Replace any pending timer so out-of-band polls never fork a second timer chain.
    if (this._interval) clearTimeout(this._interval)
    const delay = nextProcessPollDelayMs({
      activeGame: this._activeGame,
      matchConfirmed: this._confirmedGame !== null && this._confirmedGame === this._activeGame,
      missedPollStreak: this._missedPollStreak,
    })
    this._timerDueAt = Date.now() + delay
    this._interval = setTimeout(async () => {
      this._interval = null
      await this._pollShared()
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
    if (!IS_WIN && !this._listProcesses) return

    try {
      const stdout = this._listProcesses
        ? await this._listProcesses()
        : (await execAsync(
            'tasklist /fo csv /nh',
            { windowsHide: true, timeout: 4000, maxBuffer: 2 * 1024 * 1024 },
          )).stdout
      this._snapshot = { stdout, at: Date.now() }
      const runningGames = runningGamesFromTasklist(stdout)
      const valorantClientOpen = isValorantClientOpenFromTasklist(stdout)
      if (valorantClientOpen !== this._valorantClientOpen) {
        this._valorantClientOpen = valorantClientOpen
        this.emit('valorant-client-changed', valorantClientOpen)
      }

      const active = this._activeGame

      // CS2 stays open in menu after a match — hand off when Valorant/Deadlock starts.
      if (active && runningGames.includes(active)) {
        const handoff = pickHandoffGameWhenIdleInMenu(active, runningGames, this._watchGame)
        if (handoff) {
          this._missedPollStreak = 0
          this._activeGame = null
          this.emit('game-stopped', active)
          log.info(`[GameDetector] ${active} idle in menu — handing off to ${handoff}`)
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
        log.info(`[GameDetector] ${active} stopped`)
      }

      if (!runningGames.length) return

      const next = pickGameToTrack(runningGames, this._watchGame)
      if (!next) return

      this._activeGame = next
      this._missedPollStreak = 0
      this.emit('game-started', next)
      if (runningGames.length > 1) {
        log.info(
          `[GameDetector] ${next} started (${runningGames.length} games running — tracking ${next} per primary/first-until-close)`,
        )
      } else {
        log.info(`[GameDetector] ${next} started`)
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
