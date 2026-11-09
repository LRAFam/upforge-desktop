/**
 * Recording ownership decisions shared by the game detector handlers in index.ts.
 *
 * Card 232: a League recording that never stopped kept OBS "owned" for 3.5 h. Every later
 * game-started (Valorant) was ignored because a capture was already active, so OBS kept
 * recording the League capture source. These helpers keep that logic small and testable.
 */

interface Logger {
  info: (message: string) => void
  warn: (message: string) => void
}

export type GameStartedWhileRecordingDecision = 'finalize-previous' | 'ignore-same-game' | 'retry-stop'

/** What to do when a game process starts while UpForge still owns an OBS recording. */
export function decideGameStartedWhileRecording(input: {
  startedGame: string
  recordingGame: string | null
  /** The owning match already ran its finalise, so only the OBS stop is stranded. */
  matchHandled: boolean
}): GameStartedWhileRecordingDecision {
  if (input.matchHandled) return 'retry-stop'
  // Unknown owner: keep the old behaviour rather than cut a recording we cannot attribute.
  if (!input.recordingGame || input.recordingGame === input.startedGame) return 'ignore-same-game'
  return 'finalize-previous'
}

export interface GameStartOwnershipDeps {
  game: string
  /** The match-end finalise currently running, if any. */
  finalizeInFlight: () => Promise<unknown> | null
  /** Release ownership when OBS reports idle. */
  releaseStale: () => Promise<boolean>
  isRecording: () => boolean
  recordingGame: () => string | null
  matchHandled: () => boolean
  finalize: (game: string, source: string) => Promise<unknown>
  retryStop: () => Promise<unknown>
  log: Logger
}

export interface GameStartOwnershipResult {
  action: 'proceed' | 'ignore'
  /** True when an older game's recording was saved to make room for this game. */
  finalizedPrevious: boolean
}

async function settle(promise: Promise<unknown> | null): Promise<void> {
  if (promise) await promise.catch(() => undefined)
}

/**
 * Resolve recording ownership before a game-started handler begins its match flow.
 * Awaits an in-flight finalise first (fixes the same-poll stop:lol → start:valorant race).
 */
export async function resolveGameStartOwnership(deps: GameStartOwnershipDeps): Promise<GameStartOwnershipResult> {
  const inFlight = deps.finalizeInFlight()
  if (inFlight) {
    deps.log.info(`[GameDetector] ${deps.game} started — waiting for the previous match to finish saving`)
    await settle(inFlight)
  }
  await deps.releaseStale()
  // The old game's own end signal may have started finalising while we queried OBS.
  const lateFinalize = deps.finalizeInFlight()
  if (lateFinalize) {
    await settle(lateFinalize)
    await deps.releaseStale()
  }
  if (!deps.isRecording()) return { action: 'proceed', finalizedPrevious: false }

  const recordingGame = deps.recordingGame()
  const decision = decideGameStartedWhileRecording({
    startedGame: deps.game,
    recordingGame,
    matchHandled: deps.matchHandled(),
  })
  if (decision === 'ignore-same-game') {
    deps.log.info(`[GameDetector] game-started ignored — capture already active (${recordingGame ?? 'unknown'} recording, ${deps.game} started)`)
    return { action: 'ignore', finalizedPrevious: false }
  }

  let finalizedPrevious = false
  if (decision === 'finalize-previous' && recordingGame) {
    deps.log.warn(`[GameDetector] ${deps.game} started while a ${recordingGame} recording is still owned — saving ${recordingGame} (game-switch)`)
    try {
      await deps.finalize(recordingGame, 'game-switch')
      finalizedPrevious = true
    } catch (err) {
      deps.log.warn(`[GameDetector] game-switch finalise failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  } else {
    deps.log.warn(`[GameDetector] ${deps.game} started while a finished match still owns OBS — retrying the stop`)
    await deps.retryStop().catch(() => undefined)
  }
  await settle(deps.finalizeInFlight())
  await deps.releaseStale()
  if (!deps.isRecording()) return { action: 'proceed', finalizedPrevious }
  deps.log.warn(`[GameDetector] game-started ignored — the previous recording could not stop (${deps.game} not recorded)`)
  return { action: 'ignore', finalizedPrevious }
}

/**
 * A game start ignored because the previous recording would not stop is otherwise never
 * picked up again: the detector already counts the game as active, so game-started only
 * fires after the game closes. Watch until OBS lets go, then clear the detector's active
 * game so the next poll re-emits game-started (the onStopGaveUp toast promises a retry).
 */
export function createIgnoredStartRearm(deps: {
  isRecording: () => boolean
  currentGame: () => string | null
  resetActiveGame: (game: string) => void
  /** Release ownership when OBS reports idle (e.g. the user restarted OBS). */
  releaseStale?: () => Promise<unknown>
  intervalMs?: number
  log?: Logger
}): { arm: (game: string) => void; cancel: () => void; armedGame: () => string | null } {
  let timer: ReturnType<typeof setInterval> | null = null
  let game: string | null = null
  let ticking = false
  const cancel = (): void => {
    if (timer) clearInterval(timer)
    timer = null
    game = null
  }
  const tick = async (): Promise<void> => {
    if (!game || ticking) return
    ticking = true
    try {
      if (deps.currentGame() !== game) return cancel()
      await deps.releaseStale?.().catch(() => undefined)
      if (!game || deps.isRecording()) return
      const target = game
      cancel()
      deps.log?.info(`[GameDetector] previous recording released — re-detecting ${target}`)
      deps.resetActiveGame(target)
    } finally {
      ticking = false
    }
  }
  return {
    arm(next) {
      cancel()
      game = next
      timer = setInterval(() => { void tick() }, deps.intervalMs ?? 15_000)
    },
    cancel,
    armedGame: () => game,
  }
}

/**
 * A game-stopped for a game that neither owns the current match flow nor the recording
 * (the flow already moved on to another game) must not tear down the new game's state.
 */
export function isSupersededGameStop(input: {
  stoppedGame: string
  flowGame: string | null
  recordingGame: string | null
}): boolean {
  if (!input.flowGame || input.flowGame === input.stoppedGame) return false
  return input.recordingGame !== input.stoppedGame
}

/**
 * Game a manual stop, an OBS-death finalise or a replay clip belongs to: the recording UpForge
 * owns, else the current match flow, else the detected process. Null when none — callers must
 * not fall back to Valorant or the selected game tab (settings.primaryGame).
 */
export function recordingOwnerGame(input: {
  sessionGame: string | null
  flowGame: string | null
  detectedGame: string | null
}): string | null {
  return input.sessionGame ?? input.flowGame ?? input.detectedGame ?? null
}

/**
 * Serialise async work: a second call waits for the first instead of being dropped.
 * Used for handleMatchEnd so a re-entrant finalise can never leave OBS owned.
 */
export function createSerialRunner(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve()
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task)
    tail = run.catch(() => undefined)
    return run
  }
}

// ── Max-duration safety stop ──────────────────────────────────────────────────

export const MAX_RECORDING_DURATION_MS: Readonly<Record<string, number>> = {
  lol: 90 * 60_000,
  valorant: 90 * 60_000,
  deadlock: 90 * 60_000,
  cs2: 120 * 60_000,
}
const DEFAULT_MAX_RECORDING_DURATION_MS = 120 * 60_000
/** How often the main process checks an owned recording against its cap. */
export const RECORDING_MAX_DURATION_CHECK_MS = 5 * 60_000

export function maxRecordingDurationMs(game: string): number {
  return MAX_RECORDING_DURATION_MS[game] ?? DEFAULT_MAX_RECORDING_DURATION_MS
}

export type MaxDurationAction = 'ok' | 'finalize' | 'keep-live'

export function decideMaxDurationAction(input: {
  game: string
  elapsedMs: number
  processRunning: boolean
  /** null = unknown (API unreachable). Unknown never cuts a running game. */
  liveMatch: boolean | null
}): MaxDurationAction {
  if (!(input.elapsedMs > maxRecordingDurationMs(input.game))) return 'ok'
  if (!input.processRunning || input.liveMatch === false) return 'finalize'
  return 'keep-live'
}

export async function checkRecordingMaxDuration(deps: {
  game: string
  now: number
  recordingStartedAt: number
  probeProcess: (game: string) => Promise<boolean>
  probeLiveMatch: (game: string) => Promise<boolean | null>
  finalize: (game: string, source: 'max-duration') => Promise<unknown>
  log: Logger
}): Promise<MaxDurationAction> {
  const elapsedMs = deps.now - deps.recordingStartedAt
  if (!(elapsedMs > maxRecordingDurationMs(deps.game))) return 'ok'
  const processRunning = await deps.probeProcess(deps.game)
  const liveMatch = processRunning ? await deps.probeLiveMatch(deps.game).catch(() => null) : null
  const action = decideMaxDurationAction({ game: deps.game, elapsedMs, processRunning, liveMatch })
  const minutes = Math.round(elapsedMs / 60_000)
  if (action === 'finalize') {
    deps.log.warn(`[Recorder] ${deps.game} recording ran ${minutes} min (cap ${maxRecordingDurationMs(deps.game) / 60_000}) with no live match — safety stop`)
    await deps.finalize(deps.game, 'max-duration')
  } else if (action === 'keep-live') {
    deps.log.warn(`[Recorder] ${deps.game} recording ran ${minutes} min but the match still looks live — checking again later`)
  }
  return action
}
