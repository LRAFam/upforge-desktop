import { describe, expect, it } from 'vitest'
import { getVodFileReadiness, waitUntilVodFileReady } from './analysis-readiness'
import type { PendingRecording } from './recordings-store'

function baseRecording(overrides: Partial<PendingRecording> = {}): PendingRecording {
  return {
    id: 'rec-1',
    path: '/tmp/match.mkv',
    recordedAt: Date.now(),
    game: 'valorant',
    riotName: 'test',
    riotTag: 'NA1',
    map: 'Ascent',
    agent: 'Jett',
    gameMode: 'COMPETITIVE',
    timeline: null,
    clipsOnly: false,
    cloudArchived: false,
    archiveId: null,
    analysed: false,
    pipelineStatus: null,
    ...overrides,
  } as PendingRecording
}

describe('getVodFileReadiness', () => {
  it('returns not_required for clips-only sessions', () => {
    expect(getVodFileReadiness(baseRecording({ clipsOnly: true, path: undefined }))).toBe('not_required')
  })
})

describe('waitUntilVodFileReady', () => {
  it('returns unavailable when the recording is missing', async () => {
    const result = await waitUntilVodFileReady(() => undefined, 'gone', async () => {})
    expect(result.ok).toBe(false)
    expect(result.readiness.state).toBe('unavailable')
  })

  it('resolves immediately for clips-only sessions', async () => {
    const rec = baseRecording({ clipsOnly: true, path: undefined })
    const result = await waitUntilVodFileReady(() => rec, rec.id, async () => {})
    expect(result.ok).toBe(true)
  })
})
