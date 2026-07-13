/**
 * game-config.ts
 * Single source of truth for per-game behaviour in the main process.
 *
 * Historically game-specific logic was scattered across index.ts as inline
 * `if (game === 'lol')` branches and hardcoded defaults (which caused bugs like
 * LoL showing Valorant's "swiftplay" mode). New games should be added here, not
 * by sprinkling more conditionals through the codebase.
 */

import { resolveLolMapLabel } from '../../src/lib/lol-maps'

export type GameId = 'valorant' | 'cs2' | 'deadlock' | 'lol'

export interface GameConfig {
  id: GameId
  /** Human-readable name for notifications, tray tooltips, and activity log. */
  label: string
  /**
   * Fallback game-mode label used when the live/timeline mode is unknown.
   * Valorant resolves its mode live (see `resolveGameMode`); this is the last resort.
   */
  defaultGameMode: string
  /**
   * Whether the game has discrete rounds (Valorant/CS2). Round-less games
   * (LoL/Deadlock) group kills by time proximity for clip extraction instead.
   */
  supportsRounds: boolean
  /** OBS capture policy — see `obsCaptureConfig` for details. */
  obsCapture: {
    /**
     * Use OBS window_capture instead of game_capture. Needed when the
     * game-capture hook is blocked/unreliable:
     * - CS2 / Deadlock: Source 2 titles block the hook.
     * - League of Legends: Vanguard anti-cheat blocks the hook (black VOD).
     */
    useWindowCapture: boolean
    /**
     * OBS window_capture method:
     *   0 = Automatic (BitBlt — black screen for GPU-accelerated/anti-cheat games)
     *   2 = Windows Graphics Capture (WGC) — reliable for hardware-accelerated + anti-cheat titles.
     */
    windowCaptureMethod: number
  }
}

export const GAME_CONFIG: Record<GameId, GameConfig> = {
  valorant: {
    id: 'valorant',
    label: 'Valorant',
    defaultGameMode: 'UNKNOWN',
    supportsRounds: true,
    obsCapture: { useWindowCapture: false, windowCaptureMethod: 0 },
  },
  cs2: {
    id: 'cs2',
    label: 'CS2',
    defaultGameMode: 'COMPETITIVE',
    supportsRounds: true,
    obsCapture: { useWindowCapture: true, windowCaptureMethod: 0 },
  },
  deadlock: {
    id: 'deadlock',
    label: 'Deadlock',
    defaultGameMode: 'COMPETITIVE',
    supportsRounds: false,
    obsCapture: { useWindowCapture: true, windowCaptureMethod: 0 },
  },
  lol: {
    id: 'lol',
    label: 'League of Legends',
    defaultGameMode: 'RANKED_SOLO',
    supportsRounds: false,
    // Vanguard blocks the game-capture hook — WGC window capture avoids a black VOD.
    obsCapture: { useWindowCapture: true, windowCaptureMethod: 2 },
  },
}

export const GAME_IDS = Object.keys(GAME_CONFIG) as GameId[]

/** Coerce any string to a known game id, defaulting to Valorant. */
export function normalizeGameId(value: string | null | undefined): GameId {
  if (value === 'cs2' || value === 'deadlock' || value === 'valorant' || value === 'lol') {
    return value
  }
  return 'valorant'
}

export function gameConfig(game: string | null | undefined): GameConfig {
  return GAME_CONFIG[normalizeGameId(game)]
}

/** Human-readable game name (e.g. "League of Legends"). */
export function gameLabel(game?: string | null): string {
  return gameConfig(game).label
}

/** Idle tray tooltip for a given game (or generic Valorant if unknown). */
export function idleTooltip(game?: string | null): string {
  return `UpForge — ${gameLabel(game)} AI Coaching`
}

/** Whether the game uses round-based grouping (vs time-proximity for LoL/Deadlock). */
export function gameSupportsRounds(game: string | null | undefined): boolean {
  return gameConfig(game).supportsRounds
}

/** OBS capture policy (window vs game capture, and window-capture method) for a game. */
export function obsCaptureConfig(game: string | null | undefined): GameConfig['obsCapture'] {
  return gameConfig(game).obsCapture
}

export interface ResolveGameModeOpts {
  /** Mode captured on the match timeline (used by all games except Valorant's live path). */
  timelineMode?: string | null
  /** Valorant's live client mode from `riotLocalApi.getLastGameMode()`. */
  valorantLiveMode?: string | null
}

/**
 * Resolve the game-mode label to persist on a recording, preferring the
 * game-appropriate live/timeline source and falling back to the game's default.
 * Centralises the logic that previously lived as inline ternaries in index.ts.
 */
export function resolveGameMode(game: string | null | undefined, opts: ResolveGameModeOpts = {}): string {
  const cfg = gameConfig(game)
  if (cfg.id === 'valorant') {
    return opts.valorantLiveMode ?? opts.timelineMode ?? cfg.defaultGameMode
  }
  return opts.timelineMode ?? cfg.defaultGameMode
}

/** Human-readable map label for UI and recording metadata. */
export function resolveMapLabel(game: string | null | undefined, raw: string | null | undefined): string {
  if (normalizeGameId(game) === 'lol') return resolveLolMapLabel(raw)
  return raw?.trim() ?? ''
}
