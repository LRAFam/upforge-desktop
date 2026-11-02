/**
 * Pure helpers for the UI v3 shell banners and shared dialogs (agent-shell).
 * Kept out of the components so the wording, tones and trim maths are unit-tested.
 */

/** Status dot on a v3 banner row: gold = warning, red = payment problem, win = done, faint = info. */
export type BannerTone = 'gold' | 'red' | 'win' | 'faint'

export type AppUpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | string

export interface UpdateBannerLine {
  text: string
  tone: BannerTone
  /** Pulse the dot: only while something is happening now. */
  live: boolean
  /** Show the install action (ready only). */
  canInstall: boolean
  /** Rounded download percent, or null when unknown / not downloading. */
  percent: number | null
}

/** One-line copy for the app update banner. Returns null when the banner should not show. */
export function updateBannerLine(phase: AppUpdatePhase, version: string | null | undefined, percent: number): UpdateBannerLine | null {
  const v = version ? ` v${version}` : ''
  if (phase === 'downloading') {
    const pct = Number.isFinite(percent) && percent > 0 ? Math.min(100, Math.round(percent)) : null
    return { text: `Downloading update${v}…`, tone: 'faint', live: true, canInstall: false, percent: pct }
  }
  if (phase === 'available') {
    return { text: `Update${v} available. Downloading in background.`, tone: 'faint', live: true, canInstall: false, percent: null }
  }
  if (phase === 'ready') {
    return { text: `UpForge${v} is ready to install`, tone: 'red', live: false, canInstall: true, percent: null }
  }
  return null
}

/** Trim modal time label: m:ss, or m:ss.s when precise (zero-padded; the classic modal printed 1:5.4). */
export function formatTrimTime(secs: number, precise = false): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00'
  const total = precise ? Math.round(secs * 10) / 10 : Math.floor(secs)
  const m = Math.floor(total / 60)
  const s = precise ? (total % 60).toFixed(1).padStart(4, '0') : String(Math.floor(total % 60)).padStart(2, '0')
  return `${m}:${s}`
}

/** Minimum kept length between the trim handles (seconds). */
export const TRIM_MIN_GAP = 0.5

const round1 = (n: number) => Math.round(n * 10) / 10

/** Move the trim start by delta, clamped to [0, end - gap], rounded to 0.1s. */
export function nudgeTrimStart(start: number, end: number, delta: number): number {
  return round1(Math.max(0, Math.min(end - TRIM_MIN_GAP, start + delta)))
}

/** Move the trim end by delta, clamped to [start + gap, duration], rounded to 0.1s. */
export function nudgeTrimEnd(start: number, end: number, duration: number, delta: number): number {
  return round1(Math.max(start + TRIM_MIN_GAP, Math.min(duration, end + delta)))
}

/** Kept range as percentages of the full length, for the range bar. Safe for a zero duration. */
export function trimRangePercent(start: number, end: number, duration: number): { left: number; width: number } {
  if (!Number.isFinite(duration) || duration <= 0) return { left: 0, width: 0 }
  const clamp = (n: number) => Math.max(0, Math.min(100, n))
  const left = clamp((start / duration) * 100)
  const right = clamp((end / duration) * 100)
  return { left, width: Math.max(0, right - left) }
}

/** Demo preview match confidence → v3 tone. Mismatch blocks attaching, so it reads as a warning. */
export function demoAssessmentTone(confidence: string | null | undefined): BannerTone {
  if (confidence === 'strong') return 'win'
  if (confidence === 'mismatch') return 'gold'
  return 'faint'
}

/** Achievement toast: the gold star is only for a real achievement from the catalogue. */
export function isGenuineAchievement(id: string | null | undefined, catalogue: ReadonlyArray<{ id: string }>): boolean {
  return !!id && catalogue.some((a) => a.id === id)
}

/**
 * Achievement toast queue: one toast at a time, a short gap between them.
 * `next()` is idempotent for the toast on screen (the toast fires both onDismiss and @dismiss),
 * so a double call can no longer skip a queued achievement.
 */
export interface ToastQueue<T> {
  push: (items: T[]) => void
  next: () => void
  dispose: () => void
}

export function createToastQueue<T>(opts: {
  gapMs: number
  onChange: (current: T | null) => void
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}): ToastQueue<T> {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const pending: T[] = []
  let current: T | null = null
  let gap: unknown = null

  const show = () => {
    gap = null
    current = pending.shift() ?? null
    opts.onChange(current)
  }

  return {
    push(items) {
      if (!items.length) return
      pending.push(...items)
      if (current === null && gap === null) show()
    },
    next() {
      if (current === null) return
      current = null
      opts.onChange(null)
      if (pending.length) gap = setTimer(show, opts.gapMs)
    },
    dispose() {
      if (gap !== null) clearTimer(gap)
      gap = null
    },
  }
}

// ── audit 2026-11-02 — shell: title bar + nav rules ─────────────────────────

/**
 * Title-bar account label: one format for every game. The in-game identity for the current game
 * when it's linked (Riot ID for Valorant/League, Steam name for CS2), else the UpForge username.
 * No game suffix: the game switcher beside it already shows the game.
 */
export function titleBarAccountLabel(
  game: string,
  ids: { riotId?: string | null; lolRiotId?: string | null; cs2SteamName?: string | null; userName?: string | null },
): string | null {
  const clean = (v: string | null | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const inGame = game === 'valorant' ? clean(ids.riotId)
    : game === 'lol' ? clean(ids.lolRiotId)
      : game === 'cs2' ? clean(ids.cs2SteamName)
        : null
  return inGame ?? clean(ids.userName) ?? clean(ids.riotId)
}

/**
 * What the title-bar status shows: 'recording', the OBS state, or nothing.
 * When the OBS banner is on screen (it carries the actions), the title bar stays quiet so the
 * message appears once.
 */
export function titleBarObsConnected(opts: {
  recording: boolean
  obsConnected: boolean | null
  showChip: boolean
  bannerShown: boolean
}): boolean | null {
  if (opts.recording) return opts.obsConnected ?? true
  if (!opts.showChip || opts.bannerShown) return null
  return opts.obsConnected
}

/**
 * UI v3 routes that stay in the nav for every game, so the sidebar doesn't move when the game
 * changes: Progress (per-game stats), Practice (the aim trainer is game-agnostic; sensitivity
 * follows the chosen game) and Squad (members only — the squad plan covers every game).
 */
// Squad is a paid team plan for teams who may play any game: members reach it in every game
// (user decision 2 Nov 2026). Non-members never see it (SidebarV3 checks membership).
// Students: coaches review students' matches whatever game they have selected.
export const V3_ALL_GAME_ROUTES = ['/stats', '/training', '/squad', '/students'] as const

export function v3AllowedRoutes(gameRoutes: readonly string[]): string[] {
  return [...new Set([...gameRoutes, ...V3_ALL_GAME_ROUTES])]
}
