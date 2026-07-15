import { describe, expect, it, vi } from 'vitest'
import { runLateClipRetry } from './late-clip-retry'

describe('runLateClipRetry', () => {
  it('waits for match-time background work to be allowed before retrying', async () => {
    const order: string[] = []
    const deps = {
      waitUntilAllowed: vi.fn(async () => { order.push('allowed') }),
      retryCs2DemoClips: vi.fn(async () => { order.push('retry') }),
    }

    await runLateClipRetry({
      game: 'cs2',
      readyPath: 'match.mkv',
      savedRecordingId: 'recording-1',
      timeline: null,
      matchSessionStart: 1,
      matchId: null,
    }, deps as never, { analysisJobId: null })

    expect(order).toEqual(['allowed', 'retry'])
  })
})
