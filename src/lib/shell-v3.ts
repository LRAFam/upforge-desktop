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
