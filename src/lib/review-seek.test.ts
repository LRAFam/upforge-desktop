import { describe, expect, it, vi } from 'vitest'
import { createReviewSeek } from './review-seek'
class Video extends EventTarget {
  currentTime = 0
  seeking = false
}
describe('review seeking', () => {
  it('completes only the newest of rapid jumps', () => {
    const video = new Video(), seeks = createReviewSeek()
    const old = vi.fn(), latest = vi.fn()
    seeks.seek(video, 60, old, vi.fn())
    seeks.seek(video, 300, latest, vi.fn())
    video.seeking = true
    video.dispatchEvent(new Event('seeked'))
    expect(latest).not.toHaveBeenCalled()
    video.seeking = false
    video.dispatchEvent(new Event('seeked'))
    expect(old).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledTimes(1)
  })
  it('does not pretend a slow seek has completed after 2.5 seconds', () => {
    vi.useFakeTimers()
    try {
      const video = new Video(), done = vi.fn()
      createReviewSeek().seek(video, 60, done, vi.fn())
      vi.advanceTimersByTime(10000)
      expect(done).not.toHaveBeenCalled()
      video.dispatchEvent(new Event('seeked'))
      expect(done).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })
  it('cleans up on errors, source changes and disposal', () => {
    for (const event of ['error', 'emptied', 'dispose']) {
      const video = new Video(), seeks = createReviewSeek(), done = vi.fn(), failed = vi.fn()
      seeks.seek(video, 60, done, failed)
      if (event === 'dispose') seeks.cancel()
      else video.dispatchEvent(new Event(event))
      video.dispatchEvent(new Event('seeked'))
      expect(done).not.toHaveBeenCalled()
      expect(failed).toHaveBeenCalledTimes(event === 'dispose' ? 0 : 1)
    }
  })
  it('finishes a no-op without waiting for an event that may never arrive', () => {
    const done = vi.fn()
    createReviewSeek().seek(new Video(), 0, done, vi.fn())
    expect(done).toHaveBeenCalledTimes(1)
  })
})
