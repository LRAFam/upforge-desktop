import { describe, expect, it } from 'vitest'
import {
  CLIP_REVIEW_FAILED_MESSAGE,
  CLIP_REVIEW_GAME_UNSUPPORTED_MESSAGE,
  clipReviewPrecheck,
  clipReviewRefusalMessage,
  clipReviewTooLongMessage,
} from './clip-review-errors'

describe('clip review refusal copy', () => {
  it('maps the API refusal codes to plain text, never the raw code', () => {
    const game = clipReviewRefusalMessage('clip_review_game_unsupported')
    expect(game).toBe(CLIP_REVIEW_GAME_UNSUPPORTED_MESSAGE)
    expect(game).not.toMatch(/clip_review/)
    expect(clipReviewRefusalMessage('clip_review_too_long', 120)).toMatch(/up to 120 seconds\. Trim this clip/)
    expect(clipReviewRefusalMessage('clip_review_too_long')).toMatch(/up to 180 seconds/)
    expect(clipReviewRefusalMessage('something_else')).toBeNull()
  })

  it('says a failed review costs nothing', () => {
    expect(CLIP_REVIEW_FAILED_MESSAGE).toMatch(/don't use your allowance/)
    expect(clipReviewTooLongMessage(-1)).toMatch(/180 seconds/)
  })

  it('prechecks game and length from the review quota hints', () => {
    expect(clipReviewPrecheck({ durationSeconds: 20 }, { gameSupported: false })).toBe(CLIP_REVIEW_GAME_UNSUPPORTED_MESSAGE)
    expect(clipReviewPrecheck({ durationSeconds: 200 }, { gameSupported: true, maxDurationSeconds: 180 })).toMatch(/180 seconds/)
    expect(clipReviewPrecheck({ durationSeconds: 180 }, { gameSupported: true, maxDurationSeconds: 180 })).toBeNull()
    expect(clipReviewPrecheck({ durationSeconds: 999 }, {})).toBeNull()
  })
})

describe('local clip request failures', () => {
  it('turns a 422 refusal into friendly text and marks it refused', async () => {
    const { clipReviewRequestFailure } = await import('./clip-review-errors')
    expect(clipReviewRequestFailure({ status: 422, code: 'clip_review_too_long', data: { max_duration_seconds: 90 } }))
      .toEqual({ error: expect.stringContaining('up to 90 seconds'), refused: true })
    expect(clipReviewRequestFailure({ status: 422, code: 'clip_review_game_unsupported' })?.error).toBe(CLIP_REVIEW_GAME_UNSUPPORTED_MESSAGE)
    expect(clipReviewRequestFailure({ status: 500, code: 'clip_review_too_long' })).toBeNull()
    expect(clipReviewRequestFailure(new Error('offline'))).toBeNull()
  })
})

describe('clips screen wiring', () => {
  it('prechecks before the spend confirmation and shows the failed-review note', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../views/ClipsView.vue', import.meta.url), 'utf8')
    expect(src).toMatch(/clipReviewPrecheck\(clip, result\.data\.quota\)/)
    expect(src).toMatch(/analysisResult\.refused/)
    expect((src.match(/data-test="clip-review-failed"/g) ?? []).length).toBe(2)
  })
})
