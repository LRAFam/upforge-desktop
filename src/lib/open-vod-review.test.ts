import { it, expect, vi } from 'vitest'
import { openAnalysisVodReview } from './open-vod-review'
import type { Router } from 'vue-router'
it('opens a saved comparison by ID without embedding footage URLs or private notes', async () => {
  const data = { game: 'valorant' }
  vi.stubGlobal('window', { api: { analyses: { getTimeline: vi.fn().mockResolvedValue(data) } } })
  const push = vi.fn()
  const id = 'abcdef00-1234-4321-abcd-000000000001'
  expect(await openAnalysisVodReview({ push } as unknown as Router, 639, { comparisonId: id })).toBe(true)
  expect(push).toHaveBeenCalledWith({ path: '/vod-review', query: { timelineId: '639', comparisonId: id } })
  vi.unstubAllGlobals()
})
it('does not navigate if the source timeline cannot be loaded', async () => {
  vi.stubGlobal('window', { api: { analyses: { getTimeline: vi.fn().mockResolvedValue(null) } } })
  const push = vi.fn()
  expect(await openAnalysisVodReview({ push } as unknown as Router, 639)).toBe(false)
  expect(push).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})
