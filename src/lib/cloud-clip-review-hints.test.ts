import { expect, it } from 'vitest'
import { cloudClipReview } from './cloud-clip-review'

it('keeps the API review gate hints (game support, max length) on the quota', () => {
  const base = { clip: { id: 12, video_url: 'https://media.example/clip.mp4', trigger: 'kill', duration_seconds: 20, created_at: '2026-09-29T10:00:00Z' } }
  const withHints = cloudClipReview({ ...base, quota: { limit: 10, used: 1, remaining: 9, max_duration_seconds: 180, game_supported: false } })
  expect(withHints.quota).toMatchObject({ gameSupported: false, maxDurationSeconds: 180 })
  const older = cloudClipReview({ ...base, quota: { limit: 10, used: 1, remaining: 9 } })
  expect(older.quota.gameSupported).toBeNull()
  expect(older.quota.maxDurationSeconds).toBeNull()
})
