import { expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
const storage = vi.hoisted(() => ({ path: '' }))
vi.mock('electron', () => ({ app: { getPath: () => storage.path, getAppPath: () => storage.path, isPackaged: false } }))
vi.mock('electron-log', () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))
import { UploadManager, type UploadOptions } from './upload-manager'
import { emptyMatchData } from './recording-sync'
import type { AuthManager } from './auth-manager'

it('sends the measured duration and preserves an explicitly empty recorded-moment selection', async () => {
  storage.path = await mkdtemp(join(tmpdir(), 'upforge-coverage-test-'))
  const videoPath = join(storage.path, 'recording.mp4')
  await writeFile(videoPath, 'test recording')
  const timeline = emptyMatchData('cs2', 1_000_000)
  timeline.playerDeaths = [{ round: 1, videoOffsetMs: 600_000 }] as typeof timeline.playerDeaths
  const manager = new UploadManager({ getToken: () => 'test' } as AuthManager)
  const internal = manager as unknown as {
    _apiPost: (url: string, body: string) => Promise<Record<string, unknown>>
    _putToS3: () => Promise<void>
    _doUploadOnce: (opts: UploadOptions, attempt: number) => Promise<unknown>
  }
  const bodies: Array<Record<string, unknown>> = []
  internal._apiPost = vi.fn(async (url, body) => {
    bodies.push(JSON.parse(body))
    return url.endsWith('/presign') ? { job_id: 'test-job', upload_url: 'https://upload.test' } : { success: true }
  })
  internal._putToS3 = vi.fn().mockResolvedValue(undefined)
  const prepareDuelClips = vi.fn(async () => {
    timeline.recordingDurationMs = 498_530
    return []
  })
  try {
    await internal._doUploadOnce({
      videoPath, timeline, game: 'cs2', riotName: 'Test', riotTag: 'EUW', map: null, agent: null,
      onProgress() {}, prepareDuelClips,
    }, 1)
    expect(prepareDuelClips).toHaveBeenCalledOnce()
    expect(bodies[1]).toMatchObject({ duel_moments: [], match_data: { recordingDurationMs: 498_530 } })
    expect((bodies[1].match_data as { playerDeaths: unknown[] }).playerDeaths).toHaveLength(1)
  } finally {
    await rm(storage.path, { recursive: true, force: true })
  }
})
