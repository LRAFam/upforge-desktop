/**
 * Whole-round review ("AI reviews your round") — renderer helpers.
 * Shown only when BOTH the desktop flag is on (dev builds, or `uf.roundReview` = '1') and the
 * API reports the feature enabled. Pricing isn't decided, so production builds keep it hidden.
 */
export interface RoundReviewFix { title: string; detail: string; evidence_ms: number[] }
export interface RoundReview {
  id: number
  round_number: number
  status: 'queued' | 'processing' | 'completed' | 'failed'
  credit_returned: boolean
  story: string | null
  fixes: RoundReviewFix[]
  error: string | null
  /** 'not_enough_to_coach' when the round had too little to review (refunded); otherwise 'review_failed'. */
  error_code?: 'not_enough_to_coach' | 'review_failed' | null
  created_at: string | null
}
export interface RoundReviewAllowance { enabled: boolean; used: number; limit: number; remaining: number; resets_at: string }

export function roundReviewFlag(dev: boolean, storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    const v = storage?.getItem('uf.roundReview')
    if (v === '1') return true
    if (v === '0') return false
  } catch { /* storage blocked */ }
  return dev
}

export const roundReviewEnabled = (): boolean =>
  roundReviewFlag(import.meta.env.DEV, typeof localStorage === 'undefined' ? null : localStorage)

/** "3 of 10 round reviews left this month" — whole numbers, singular when it's one. */
export function allowanceLine(a: RoundReviewAllowance | null): string {
  if (!a) return ''
  const n = a.remaining
  return `${n} of ${a.limit} round ${a.limit === 1 ? 'review' : 'reviews'} left this month`
}

export function isDone(r: RoundReview | null | undefined): boolean {
  return r?.status === 'completed' || r?.status === 'failed'
}

/** Seconds to seek to for a fix's evidence: 2 s of lead-in, never negative. */
export function jumpSeconds(evidenceMs: number): number {
  return Math.max(0, evidenceMs / 1000 - 2)
}

export function clockLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Poll until the review is done. Caps the number of polls; returns the last state. */
export async function pollRoundReview(
  get: () => Promise<RoundReview | null>,
  opts: { intervalMs?: number; maxPolls?: number; sleep?: (ms: number) => Promise<void>; onUpdate?: (r: RoundReview) => void } = {},
): Promise<RoundReview | null> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  let last: RoundReview | null = null
  for (let i = 0; i < (opts.maxPolls ?? 150); i++) {
    const r = await get()
    if (r) { last = r; opts.onUpdate?.(r) }
    if (isDone(r)) return r
    await sleep(opts.intervalMs ?? 4000)
  }
  return last
}
