import { expect, it } from 'vitest'
import { cloudClipReview } from './cloud-clip-review'
const sample = () => ({ clip: { id: 12, video_url: 'https://media.example/clip.mp4', trigger: 'kill', duration_seconds: 20, created_at: '2026-09-29T10:00:00Z', clip_analysis: { status: 'completed', verdict: 'Good trade', overall_score: 75 } }, quota: { limit: 10, used: 1, remaining: 9 } })
it('opens existing cloud coaching without inventing a local file', () => {
  const result = cloudClipReview(sample())
  expect(result.clip).toMatchObject({ id: 'cloud:12', apiClipId: 12, path: 'https://media.example/clip.mp4', verdict: 'Good trade', overallScore: 75, uploadStatus: 'uploaded' })
})
it('rejects unsafe media addresses and invalid quota metadata', () => {
  for (const video_url of ['file:///etc/private', 'https://user:password@media.example/clip.mp4', 'javascript:alert(1)']) {
    const value = sample(); value.clip.video_url = video_url
    expect(() => cloudClipReview(value)).toThrow()
  }
  const value = sample(); value.quota.remaining = -1
  expect(() => cloudClipReview(value)).toThrow()
})
it('accepts explicit unlimited allowances without unsafe integer arithmetic', () => {
  const value = { ...sample(), quota: { limit: null, used: 2, remaining: null } }
  expect(cloudClipReview(value).quota.limit).toBeNull()
  expect(() => cloudClipReview({ ...value, quota: { limit: null, used: 2, remaining: 10 } })).toThrow()
})
