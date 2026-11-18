/**
 * Friendly copy for AI clip review refusals and failed reviews.
 * The API refuses some clips before any allowance is used (HTTP 422):
 *  - clip_review_game_unsupported: clip coaching is Valorant-only for now
 *  - clip_review_too_long: clip is over the review length limit
 * A review that returns no coaching ends as `failed`; failed reviews never count
 * against the monthly allowance.
 */
export const CLIP_REVIEW_DEFAULT_MAX_SECONDS = 180

export const CLIP_REVIEW_GAME_UNSUPPORTED_MESSAGE =
  'AI clip coaching works on Valorant clips only for now. Nothing was used from your allowance.'

export const CLIP_REVIEW_FAILED_MESSAGE =
  "The AI coach couldn't finish a review for this clip. Failed reviews don't use your allowance. Try again."

export function clipReviewTooLongMessage(maxSeconds?: number | null): string {
  const max = Number.isFinite(maxSeconds) && Number(maxSeconds) > 0 ? Math.round(Number(maxSeconds)) : CLIP_REVIEW_DEFAULT_MAX_SECONDS
  return `AI clip coaching works on clips up to ${max} seconds. Trim this clip, then try again. Nothing was used from your allowance.`
}

/** Friendly text for a refusal code from POST /api/clips/{id}/analyse, or null when it isn't one. */
export function clipReviewRefusalMessage(code: unknown, maxSeconds?: number | null): string | null {
  if (code === 'clip_review_game_unsupported') return CLIP_REVIEW_GAME_UNSUPPORTED_MESSAGE
  if (code === 'clip_review_too_long') return clipReviewTooLongMessage(maxSeconds)
  return null
}

/** Checked before asking to spend a review, using GET /clips/{id}/review quota hints. */
export function clipReviewPrecheck(
  clip: { durationSeconds?: number | null },
  quota: { gameSupported?: boolean | null; maxDurationSeconds?: number | null },
): string | null {
  if (quota.gameSupported === false) return CLIP_REVIEW_GAME_UNSUPPORTED_MESSAGE
  const max = quota.maxDurationSeconds
  if (typeof max === 'number' && max > 0 && typeof clip.durationSeconds === 'number' && clip.durationSeconds > max) {
    return clipReviewTooLongMessage(max)
  }
  return null
}

/**
 * Local-clip request failure (apiPost rejects with `{ status, code, data }`).
 * `refused` = the API declined this clip before spending anything: the clip goes back to
 * "not reviewed" rather than "failed".
 */
export function clipReviewRequestFailure(err: unknown): { error: string; refused: boolean } | null {
  const e = err as { status?: number; code?: unknown; data?: { max_duration_seconds?: number } } | null
  if (!e || e.status !== 422) return null
  const message = clipReviewRefusalMessage(e.code, e.data?.max_duration_seconds)
  return message ? { error: message, refused: true } : null
}
