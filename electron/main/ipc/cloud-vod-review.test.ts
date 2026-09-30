import { expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ BrowserWindow: {}, dialog: {}, app: { getPath: () => '/tmp', getVersion: () => 'test' } }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../recording-playback', () => ({ resolveLocalRecordingFile: () => null, isLikelyBrowserPlayableLocal: () => false, fetchArchivePlaybackUrl: async () => 'https://media.example/vod.mp4', fetchRecordingPlaybackUrl: async () => 'https://media.example/vod.mp4', fetchJobPlaybackUrl: async () => null }))
vi.mock('../riot-local-api', () => ({ recomputeTimelineVideoOffsets: vi.fn(), effectiveVideoSyncOffsetMs: () => -4000, defaultVideoSyncOffsetMs: () => 0 }))
vi.mock('../analysis-readiness', () => ({ getAnalysisReadiness: () => ({ ready: true, message: 'Ready' }) }))
import { setupRecordingsHandlers, type RecordingsIpcDeps } from './recordings-ipc'
function setup() {
  let owner = 1
  const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  const archive = { archive_id: id, analysis_state: 'not_analysed', analysis_id: null, analysis_job_id: null, game: 'valorant', map: 'Ascent', agent: 'Fade', game_mode: 'competitive', match_id: 'match', file_size_bytes: 500, archived_at: '2026-09-29T10:00:00Z', retention_expires_at: null, has_match_data: true, match_data: { game: 'valorant', playerKills: [{ round: 3, videoOffsetMs: 12000 }], roundSummaries: [{ round: 3 }], spatialSummary: { events: [] } } }
  const get = vi.fn().mockResolvedValue({ data: { archive } }), post = vi.fn().mockResolvedValue({ data: {} })
  const handlers: Record<string, (...args: any[]) => Promise<any>> = {}
  const updateTimeline = vi.fn()
  setupRecordingsHandlers({ handle: (name: string, fn: any) => { handlers[name] = fn } } as any, {
    authManager: { getToken: () => owner ? `token-${owner}` : null, getUser: () => ({ id: owner }), getApi: () => ({ get, post }) },
    recordingsStore: { getById: () => undefined, updateTimeline }, productionVodFixtures: { getById: () => undefined }, enrichTimelineSpatial: vi.fn(),
  } as unknown as RecordingsIpcDeps)
  return { id, handlers, archive, get, post, updateTimeline, change: (id: number) => { owner = id } }
}
it('loads saved events and spatial data without creating a local recording', async () => {
  const s = setup()
  const result = await s.handlers['archives:review']({}, s.id)
  expect(result).toMatchObject({ ok: true, timeline: { archiveId: s.id, hasLocalFile: false, videoPath: 'https://media.example/vod.mp4', videoSyncOffsetMs: -4000, kills: [{ round: 3 }], spatialSummary: { events: [] } } })
  expect(s.updateTimeline).not.toHaveBeenCalled()
  expect(await s.handlers['recordings:get-timeline']({}, { id: s.id })).toMatchObject({ archiveId: s.id })
})
it('rejects invalid ids, signed-out users and account changes', async () => {
  const s = setup()
  expect(await s.handlers['archives:review']({}, '../bad', true)).toMatchObject({ ok: false })
  expect(s.post).not.toHaveBeenCalled()
  s.change(0)
  expect(await s.handlers['archives:review']({}, s.id)).toMatchObject({ ok: false })
  s.change(1)
  s.get.mockImplementation(async () => { s.change(2); return { data: { archive: s.archive } } })
  expect(await s.handlers['archives:review']({}, s.id)).toMatchObject({ ok: false })
})
it('uses the existing quota-controlled archive analysis endpoint and reports rejection', async () => {
  const s = setup()
  s.post.mockRejectedValue({ response: { status: 402, data: { message: 'No analyses remaining' } } })
  expect(await s.handlers['archives:review']({}, s.id, true)).toMatchObject({ ok: false, error: 'No analyses remaining' })
  expect(s.post).toHaveBeenCalledWith(`/api/recordings/archive/${s.id}/analyse`, {})
})
