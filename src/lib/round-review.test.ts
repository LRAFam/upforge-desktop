import { describe, expect, it } from 'vitest'
import { allowanceLine, clockLabel, jumpSeconds, pollRoundReview, roundReviewFlag, type RoundReview } from './round-review'

const review = (status: RoundReview['status']): RoundReview => ({ id: 1, round_number: 3, status, credit_returned: false, story: null, fixes: [], error: null, created_at: null })

describe('round review helpers', () => {
  it('is on in dev, off in production unless switched on', () => {
    expect(roundReviewFlag(true, null)).toBe(true)
    expect(roundReviewFlag(false, null)).toBe(false)
    expect(roundReviewFlag(false, { getItem: () => '1' })).toBe(true)
    expect(roundReviewFlag(true, { getItem: () => '0' })).toBe(false)
  })
  it('words the allowance in whole numbers', () => {
    expect(allowanceLine({ enabled: true, used: 7, limit: 10, remaining: 3, resets_at: '' })).toBe('3 of 10 round reviews left this month')
    expect(allowanceLine({ enabled: true, used: 0, limit: 1, remaining: 1, resets_at: '' })).toBe('1 of 1 round review left this month')
  })
  it('jumps to 2 s before the evidence', () => {
    expect(jumpSeconds(190000)).toBe(188)
    expect(jumpSeconds(500)).toBe(0)
    expect(clockLabel(190000)).toBe('3:10')
  })
  it('polls until done and stops at the cap', async () => {
    const states = [review('queued'), review('processing'), review('completed')]
    let i = 0
    const done = await pollRoundReview(async () => states[Math.min(i++, 2)], { sleep: async () => {} })
    expect(done?.status).toBe('completed')
    let calls = 0
    const capped = await pollRoundReview(async () => { calls++; return review('processing') }, { maxPolls: 3, sleep: async () => {} })
    expect(calls).toBe(3)
    expect(capped?.status).toBe('processing')
  })
})
