import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('electron-log', () => ({ default: { warn: vi.fn(), info: vi.fn() } }))
vi.mock('./vod-compressor', () => ({ recordingPathVariants: (p: string) => [p] }))
const files = new Map<string, number>()
vi.mock('fs', () => ({ default: { existsSync: (p: string) => files.has(p), statSync: (p: string) => ({ size: files.get(p) ?? 0 }) } }))
import { resolveCloudFirstPlaybackUrl } from './recording-playback'
import type { AuthManager } from './auth-manager'

const get = vi.fn()
const auth = { getApi: () => ({ get }) } as unknown as AuthManager
beforeEach(() => { files.clear(); get.mockReset() })

it('prefers a playable file on this PC over the cloud copy (no download)', async () => {
  files.set('/rec/match.mp4', 50 * 1024 * 1024)
  const r = await resolveCloudFirstPlaybackUrl({ auth, analysisId: 7, inlineRecordingUrl: 'https://cdn.example/v.mp4', localPath: '/rec/match.mp4' })
  expect(r.url).toBe('/rec/match.mp4')
  expect(get).not.toHaveBeenCalled()
})

it('keeps playing from this PC when the cloud full video was removed', async () => {
  files.set('/rec/match.mp4', 50 * 1024 * 1024)
  get.mockRejectedValue({ response: { status: 410 } })
  const r = await resolveCloudFirstPlaybackUrl({ auth, analysisId: 7, inlineRecordingUrl: null, localPath: '/rec/match.mp4' })
  expect(r.url).toBe('/rec/match.mp4')
})

it('uses cloud before a raw .mkv on this PC, and the .mkv only as a last resort', async () => {
  files.set('/rec/match.mkv', 50 * 1024 * 1024)
  expect((await resolveCloudFirstPlaybackUrl({ auth, inlineRecordingUrl: 'https://cdn.example/v.mp4', localPath: '/rec/match.mkv' })).url).toBe('https://cdn.example/v.mp4')
  get.mockResolvedValue({ data: { analysis: { recording_url: null } } })
  expect((await resolveCloudFirstPlaybackUrl({ auth, analysisId: 7, inlineRecordingUrl: null, localPath: '/rec/match.mkv' })).url).toBe('/rec/match.mkv')
})
