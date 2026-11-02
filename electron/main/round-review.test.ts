import { describe, expect, it, vi } from 'vitest'
import { getRoundReview, listRoundReviews, requestRoundReview, validJobId, validRound } from './round-review'

describe('round review client', () => {
  it('only accepts safe job ids and rounds 1–60', () => {
    expect(validJobId('abc-123_X')).toBe(true)
    expect(validJobId('../etc')).toBe(false)
    expect(validRound(1)).toBe(true)
    expect(validRound(61)).toBe(false)
    expect(validRound(2.5)).toBe(false)
  })
  it('never calls the API with a bad id', async () => {
    const api = { post: vi.fn() }
    const out = await requestRoundReview(api as never, '../x', 3)
    expect(out.ok).toBe(false)
    expect(api.post).not.toHaveBeenCalled()
  })
  it('passes the allowance back when the month is used up', async () => {
    const api = { post: vi.fn().mockRejectedValue({ response: { status: 402, data: { message: 'used up', allowance: { remaining: 0 } } } }) }
    const out = await requestRoundReview(api as never, 'job1', 3)
    expect(out).toMatchObject({ ok: false, status: 402, error: 'used up', allowance: { remaining: 0 } })
  })
  it('refuses a missing or malformed review from get', async () => {
    for (const data of [{}, { review: null }, { review: 'x' }, { review: { id: '7' } }, undefined]) {
      const api = { get: vi.fn().mockResolvedValue({ data }) }
      expect(await getRoundReview(api as never, 'job1', 3)).toEqual({ ok: false, error: 'Round review is unavailable right now.' })
    }
    const api = { get: vi.fn().mockResolvedValue({ data: { review: { id: 7 } } }) }
    expect(await getRoundReview(api as never, 'job1', 3)).toEqual({ ok: true, review: { id: 7 } })
  })
  it('refuses a missing or malformed review from request', async () => {
    for (const data of [{ charged: true }, { review: null }, { review: { id: null } }]) {
      const api = { post: vi.fn().mockResolvedValue({ data }) }
      expect(await requestRoundReview(api as never, 'job1', 3)).toEqual({ ok: false, error: 'Round review is unavailable right now.' })
    }
  })
  it('always lists reviews as an array', async () => {
    for (const reviews of [undefined, null, 'x', { 0: {} }]) {
      const api = { get: vi.fn().mockResolvedValue({ data: { reviews, allowance: { remaining: 1 } } }) }
      const out = await listRoundReviews(api as never, 'job1')
      expect(out).toMatchObject({ ok: true, reviews: [] })
    }
  })
})
