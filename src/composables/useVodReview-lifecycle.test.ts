import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const lifecycle = vi.hoisted(() => ({ mounts: [] as Array<() => Promise<void>>, unmounts: [] as Array<() => void> }))
vi.mock('vue', async importOriginal => ({
  ...await importOriginal<typeof import('vue')>(),
  onMounted: (fn: () => Promise<void>) => lifecycle.mounts.push(fn),
  onUnmounted: (fn: () => void) => lifecycle.unmounts.push(fn),
  provide: vi.fn(), watch: vi.fn(),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({}), useRoute: () => ({ query: { id: 'recording', seekMs: '30000' } }) }))
import { provideVodReview } from './useVodReview'

let getTimeline: () => Promise<unknown>
const timeline = () => ({ id: 'recording', game: 'valorant', videoPath: '/tmp/match.mp4', kills: [], deaths: [], teamSnapshot: [], roundSummaries: [] })
beforeEach(() => {
  vi.useFakeTimers()
  lifecycle.mounts.length = lifecycle.unmounts.length = 0
  getTimeline = async () => null
  const api = new Proxy({}, { get: (_target, key) => {
    if (key === 'on') return () => vi.fn()
    return new Proxy({}, { get: (_target, method) => key === 'recordings' && method === 'getTimeline'
      ? () => getTimeline()
      : async () => ({}) })
  } })
  vi.stubGlobal('window', { api, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn(), fullscreenElement: null, exitFullscreen: async () => {} })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('does not attach review controls after a slow load completes following navigation away', async () => {
  let resolve!: (value: unknown) => void
  getTimeline = () => new Promise(done => { resolve = done })
  provideVodReview()
  const mounting = lifecycle.mounts[0]!()
  lifecycle.unmounts[0]!()
  resolve(null)
  await mounting
  expect(window.addEventListener).not.toHaveBeenCalled()
  expect(document.addEventListener).not.toHaveBeenCalled()
})

it('cancels the pending initial seek when the review closes before video metadata arrives', async () => {
  getTimeline = async () => timeline()
  provideVodReview()
  await lifecycle.mounts[0]!()
  expect(vi.getTimerCount()).toBe(1)
  lifecycle.unmounts[0]!()
  await vi.advanceTimersByTimeAsync(1000)
  expect(vi.getTimerCount()).toBe(0)
})

it('does not restart seek polling when a valid timeline arrives after closing', async () => {
  let resolve!: (value: unknown) => void
  getTimeline = () => new Promise(done => { resolve = done })
  provideVodReview()
  const mounting = lifecycle.mounts[0]!()
  lifecycle.unmounts[0]!()
  resolve(timeline())
  await mounting
  expect(vi.getTimerCount()).toBe(0)
})

it('seeks once to the latest target when metadata becomes available and removes normal controls on close', async () => {
  getTimeline = async () => timeline()
  const review = provideVodReview()
  await lifecycle.mounts[0]!()
  review.applyInitialSeek(40000)
  expect(vi.getTimerCount()).toBe(1)
  const video = { currentTime: 0, seeking: false, pause: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }
  review.videoEl.value = video as unknown as HTMLVideoElement
  review.duration.value = 60
  await vi.advanceTimersByTimeAsync(200)
  expect(video.currentTime).toBe(35) // Coach notes keep their five-second pre-roll.
  expect(video.pause).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
  expect(window.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function))
  lifecycle.unmounts[0]!()
  expect(window.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function))
})
