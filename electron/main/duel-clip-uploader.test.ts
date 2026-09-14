import { expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
vi.mock('electron-log', () => ({ default: { warn: vi.fn(), info: vi.fn() } }))
vi.mock('./recording-path-resolver', () => ({ preferredRecordingPath: (path: string) => path }))
vi.mock('./vod-compressor', () => ({
  needsTranscodeForCloudUpload: () => false,
  recordingPathVariants: () => [],
  remuxVodForUpload: vi.fn(),
}))
vi.mock('./pipeline-errors', () => ({ reportPipelineError: vi.fn() }))
import { reportPipelineError } from './pipeline-errors'
import { extractAndUploadDuelClips } from './duel-clip-uploader'
import type { ClipExtractor } from './clip-extractor'
import type { UploadManager } from './upload-manager'
import type { DuelMomentManifest } from './moment-picker'

it('reports bounded underlying reasons when all 11 extractions fail without attempting uploads', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'duel-report-test-'))
  const videoPath = join(dir, 'source.mp4')
  await writeFile(videoPath, 'source')
  const presignDuelClips = vi.fn()
  const extract = vi.fn().mockRejectedValue(new Error('ffmpeg: cannot initialise encoder for user@example.com'))
  const moments = Array.from({ length: 11 }, (_, i) => ({
    moment_id: `moment-${i}`, window_start_ms: i * 1000, window_end_ms: i * 1000 + 500,
  })) as DuelMomentManifest[]
  try {
    const result = await extractAndUploadDuelClips({
      videoPath, jobId: 'job', moments,
      uploadManager: { presignDuelClips } as unknown as UploadManager,
      clipExtractor: { probe: async () => ({ ok: true }), probeDurationMs: async () => 2250400, extract } as unknown as ClipExtractor,
    })
    expect(result).toEqual(moments)
    expect(extract).toHaveBeenCalledTimes(22)
    expect(presignDuelClips).not.toHaveBeenCalled()
    const details = vi.mocked(reportPipelineError).mock.calls[0]![2]!
    expect(details.extractFailed).toBe(11)
    expect(details.skippedTooSmall).toBe(0)
    expect(details.failure_details).toHaveLength(5)
    expect(JSON.stringify(details.failure_details)).toContain('cannot initialise encoder')
    expect(JSON.stringify(details.failure_details)).not.toContain('user@example.com')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
