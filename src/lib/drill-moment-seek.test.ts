import { describe, expect, it, vi } from 'vitest'
import { createDrillMomentSeek } from './drill-moment-seek'

const url = 'https://media.upforge.gg/source.mp4'
const response = (seconds = 12.5, analysis = 42) => ({ drill_id: 7, review: { analysis_id: analysis }, matches: [], playback: { source_identity: 'a'.repeat(64), url },
  source_moments: [{ coordinate: 'recording', timestamp_seconds: seconds, source_identity: 'a'.repeat(64) }] })
function setup(request = vi.fn(async () => response())) {
  const context = { drillId: '7', momentIndex: '0', analysisId: 42, videoSource: 'https://media.upforge.gg/source.mp4', video: { readyState: 0, duration: NaN, currentSrc: '' } }
  const seek = vi.fn()
  const setSource = vi.fn((value: string) => { context.videoSource = value })
  return { context, request, seek, setSource, runner: createDrillMomentSeek({ context: () => context, request, setSource, seek }) }
}
describe('saved drill moment seeking', () => {
  it('waits for actual media metadata, seeks exact stored time once and never invents a query time', async () => {
    const s = setup()
    await s.runner.load()
    expect(s.seek).not.toHaveBeenCalled()
    s.context.video = { readyState: 1, duration: 30, currentSrc: url }
    s.runner.mediaReady()
    s.runner.mediaReady()
    await s.runner.load()
    expect(s.seek).toHaveBeenCalledExactlyOnceWith(12.5)
    expect(s.request).toHaveBeenCalledExactlyOnceWith(7)
  })
  it.each([0, 29.99])('preserves an explicit valid recording coordinate %s', async seconds => {
    const s = setup(vi.fn(async () => response(seconds)))
    s.context.video = { readyState: 1, duration: 30, currentSrc: url }
    await s.runner.load()
    expect(s.seek).toHaveBeenCalledWith(seconds)
  })
  it.each([-1, 30, Infinity, NaN])('does not clamp invalid or out-of-duration evidence %s into a different moment', async seconds => {
    const s = setup(vi.fn(async () => response(seconds)))
    s.context.video = { readyState: 1, duration: 30, currentSrc: url }
    await s.runner.load()
    expect(s.seek).not.toHaveBeenCalled()
  })
  it.each(['session', 'route', 'media'])('ignores a pending response after %s changes', async action => {
    let resolve!: (value: ReturnType<typeof response>) => void
    const s = setup(vi.fn(() => new Promise(r => { resolve = r })))
    s.context.video = { readyState: 1, duration: 30, currentSrc: url }
    const pending = s.runner.load()
    if (action === 'session') s.runner.cancel()
    if (action === 'route') s.context.drillId = '8'
    if (action === 'media') s.context.videoSource = 'https://media.upforge.gg/replacement.mp4'
    resolve(response())
    await pending
    s.runner.mediaReady()
    expect(s.seek).not.toHaveBeenCalled()
  })
  it('rejects another review and missing/replaced saved evidence', async () => {
    const s = setup(vi.fn(async () => response(12, 99)))
    s.context.video = { readyState: 1, duration: 30, currentSrc: url }
    await s.runner.load()
    expect(s.seek).not.toHaveBeenCalled()
  })
})

describe('recording identity binding', () => {
  it('never seeks the cached old recording when API evidence belongs to a different verified URL', async () => {
    const s = setup()
    s.context.video = { readyState: 1, duration: 30, currentSrc: 'file:///old-recording.mp4' } as any
    s.context.videoSource = 'file:///old-recording.mp4'
    await s.runner.load()
    expect(s.seek).not.toHaveBeenCalled()
  })
})

it('switches to verified media, ignores stale metadata, and never refetches from its own source change', async () => {
  const s = setup()
  s.context.videoSource = 'file:///cached.mp4'
  s.context.video = { readyState: 1, duration: 30, currentSrc: 'file:///cached.mp4' }
  await s.runner.load()
  expect(s.setSource).toHaveBeenCalledExactlyOnceWith(url)
  expect(s.seek).not.toHaveBeenCalled()
  await s.runner.load() // Vue's videoSrc watcher, caused by setSource.
  expect(s.request).toHaveBeenCalledTimes(1)
  s.runner.mediaReady(); expect(s.seek).not.toHaveBeenCalled()
  s.context.video.currentSrc = url; s.context.video.readyState = 0
  s.runner.mediaReady(); expect(s.seek).not.toHaveBeenCalled()
  s.context.video.readyState = 1; s.runner.mediaReady()
  expect(s.seek).toHaveBeenCalledExactlyOnceWith(12.5)
})
it('requires the exact source identity and a safe verified playback URL, never just analysis id', async () => {
  for (const playback of [null, { source_identity: 'b'.repeat(64), url }, { source_identity: 'a'.repeat(64), url: 'file:///private/file' }, { source_identity: 'a'.repeat(64), url: 'https://user:pass@media.upforge.gg/file.mp4' }]) {
    const s = setup(vi.fn(async () => ({ ...response(), playback }) as any))
    s.context.video = { readyState: 1, duration: 30, currentSrc: url }
    await s.runner.load(); expect(s.seek).not.toHaveBeenCalled(); expect(s.setSource).not.toHaveBeenCalled()
  }
})
it.each(['route', 'session', 'media'])('cancels a prepared seek before metadata after %s changes', async action => {
  const s = setup(); await s.runner.load()
  if (action === 'route') s.context.drillId = '8'
  if (action === 'session') s.runner.cancel()
  if (action === 'media') s.context.videoSource = 'https://media.upforge.gg/other.mp4'
  s.context.video = { readyState: 1, duration: 30, currentSrc: url }
  s.runner.mediaReady(); expect(s.seek).not.toHaveBeenCalled()
})
it('can resolve verified playback for a loaded owned timeline with no cached video path', async () => {
  const s = setup(); s.context.videoSource = ''
  await s.runner.load()
  expect(s.request).toHaveBeenCalledExactlyOnceWith(7); expect(s.setSource).toHaveBeenCalledExactlyOnceWith(url)
  expect(s.seek).not.toHaveBeenCalled()
  s.context.video = { currentSrc: url, readyState: 1, duration: 30 }; s.runner.mediaReady()
  expect(s.seek).toHaveBeenCalledExactlyOnceWith(12.5)
})
