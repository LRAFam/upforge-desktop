import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearCoachReviewCache,
  fetchCoachReviewSummary,
  getCachedCoachReview,
  loadCoachReviewSummaries,
} from './coach-review-cache'

const getAnalysisReview = vi.fn()

beforeEach(() => {
  getAnalysisReview.mockReset()
  ;(globalThis as any).window = { api: { coach: { getAnalysisReview } } }
  clearCoachReviewCache()
})

describe('fetchCoachReviewSummary', () => {
  it('maps a successful review to a summary', async () => {
    getAnalysisReview.mockResolvedValue({
      id: 7,
      status: 'completed',
      annotations: [{}, {}, {}],
      coach: { display_name: 'Coach Kim' },
    })
    await expect(fetchCoachReviewSummary(1)).resolves.toEqual({
      status: 'completed',
      annotationCount: 3,
      coachName: 'Coach Kim',
    })
  })

  it('caches a missing review as null and does not fetch again', async () => {
    getAnalysisReview.mockResolvedValue(null)
    await expect(fetchCoachReviewSummary(2)).resolves.toBeNull()
    expect(getCachedCoachReview(2)).toBeNull()
    await expect(fetchCoachReviewSummary(2)).resolves.toBeNull()
    expect(getAnalysisReview).toHaveBeenCalledTimes(1)
  })

  it('does not cache a thrown error and retries on the next call', async () => {
    getAnalysisReview
      .mockRejectedValueOnce(new Error('ipc failed'))
      .mockResolvedValueOnce({ id: 9, status: 'in_progress', annotations: [], coach: null })
    await expect(fetchCoachReviewSummary(3)).resolves.toBeNull()
    expect(getCachedCoachReview(3)).toBeUndefined()
    await expect(fetchCoachReviewSummary(3)).resolves.toEqual({
      status: 'in_progress',
      annotationCount: 0,
      coachName: null,
    })
    expect(getAnalysisReview).toHaveBeenCalledTimes(2)
  })

  it('shares one in-flight request between concurrent calls', async () => {
    let resolve!: (v: unknown) => void
    getAnalysisReview.mockReturnValue(new Promise(r => { resolve = r }))
    const a = fetchCoachReviewSummary(4)
    const b = fetchCoachReviewSummary(4)
    resolve({ id: 1, status: 'pending', annotations: [{}] })
    const [ra, rb] = await Promise.all([a, b])
    expect(ra).toEqual(rb)
    expect(ra?.annotationCount).toBe(1)
    expect(getAnalysisReview).toHaveBeenCalledTimes(1)
  })

  it('maps an unknown status to pending', async () => {
    getAnalysisReview.mockResolvedValue({ id: 5, status: 'archived' })
    const summary = await fetchCoachReviewSummary(5)
    expect(summary?.status).toBe('pending')
  })
})

describe('loadCoachReviewSummaries', () => {
  it('returns only non-null entries', async () => {
    getAnalysisReview.mockImplementation(async (id: number) => {
      if (id === 10) return { id: 100, status: 'completed', annotations: [{}], coach: { display_name: 'A' } }
      if (id === 11) return null
      throw new Error('boom')
    })
    const result = await loadCoachReviewSummaries([10, 11, 12])
    expect(Object.keys(result)).toEqual(['10'])
    expect(result[10]).toEqual({ status: 'completed', annotationCount: 1, coachName: 'A' })
  })
})
