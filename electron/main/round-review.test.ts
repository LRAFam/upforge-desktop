import { describe, expect, it, vi } from 'vitest'
import { requestRoundReview, validJobId, validRound } from './round-review'

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
})
