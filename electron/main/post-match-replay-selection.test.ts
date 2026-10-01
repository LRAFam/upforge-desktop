import { expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ find: vi.fn(), parse: vi.fn() }))
vi.mock('./source-replay-finder', () => ({ findLatestReplay: mocks.find }))
vi.mock('./demo-timeline', () => ({ buildTimelineFromDemo: mocks.parse }))
vi.mock('./source-replay-uploader', () => ({ SourceReplayUploader: vi.fn() }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }))
import { buildTimelineFromReplay } from './post-match-replay'

it('does not auto-attach a CS2 demo just because its file timestamp is recent', async () => {
  const result = await buildTimelineFromReplay({
    game: 'cs2', matchSessionStart: 1000, matchStartTime: 1000,
    recordingStartTime: 1000, gsiMap: 'de_dust2',
  }, { pollOnce: true })
  expect(result).toEqual({ timeline: null, demoPath: null })
  expect(mocks.find).not.toHaveBeenCalled()
  expect(mocks.parse).not.toHaveBeenCalled()
})
