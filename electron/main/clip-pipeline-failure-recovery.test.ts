import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const runtime = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { getPath: () => runtime.root } }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
vi.mock('./app-notifications', () => ({ showAppNotification: vi.fn() }))
vi.mock('./error-reporter', () => ({ reportError: vi.fn() }))
vi.mock('electron-log', () => ({ default: { warn: vi.fn(), info: vi.fn() } }))

import { ClipPipeline } from './clip-pipeline'
import { ClipStore } from './clip-store'
import type { ClipExtractor, ExtractOptions, ThumbnailOptions } from './clip-extractor'

beforeEach(() => { runtime.root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-clip-recovery-')) })
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(runtime.root, { recursive: true, force: true }) })

function setup() {
  const source = path.join(runtime.root, 'source.mp4')
  fs.writeFileSync(source, 'original recording bytes')
  const store = new ClipStore()
  const extractor = {
    probeWithRetry: vi.fn(async () => ({ ok: true, reason: undefined as string | undefined })),
    probeDurationMs: vi.fn(async () => 120_000),
    extract: vi.fn(async ({ outputPath }: ExtractOptions) => {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      fs.writeFileSync(outputPath, 'complete clip')
    }),
    thumbnail: vi.fn(async ({ outputPath }: ThumbnailOptions) => {
      fs.writeFileSync(outputPath, 'thumbnail')
    }),
  }
  const pipeline = new ClipPipeline({
    clipStore: store, clipExtractor: extractor as unknown as ClipExtractor,
    hotkeyBookmarks: [42_000], getRecordingStartTime: () => 10_000,
    getClipCapture: () => ({ singleKills: true, multiKills: true, aces: true, clutches: true, deaths: true, objectives: true }),
    logActivity: vi.fn(), notifySilent: () => true, notifyMainWindow: vi.fn(),
  })
  return { source, store, extractor, pipeline }
}

describe('clip extraction failure recovery', () => {
  it('keeps a completed clip when both thumbnail seeks return no packets', async () => {
    const { source, store, extractor, pipeline } = setup()
    extractor.thumbnail.mockRejectedValue(new Error('Nothing was written into output file: streams received no packets'))

    expect(await pipeline.extractMatchClips(source, null, null)).toBe(true)
    expect(extractor.thumbnail.mock.calls.map(([opts]) => opts.offsetMs)).toEqual([32_000, 7_000])
    const clips = new ClipStore().getAll()
    expect(clips).toHaveLength(1)
    expect(clips[0].thumbPath).toBeNull()
    expect(fs.readFileSync(clips[0].path, 'utf8')).toBe('complete clip')
    expect(store.getAll()).toHaveLength(1)
    expect(fs.readFileSync(source, 'utf8')).toBe('original recording bytes')
  })

  it('stops before extracting an incomplete container and keeps the original for recovery', async () => {
    const { source, store, extractor, pipeline } = setup()
    extractor.probeWithRetry.mockResolvedValue({ ok: false, reason: 'Recording is incomplete — moov atom not found' })

    expect(await pipeline.extractMatchClips(source, null, null)).toBe(false)
    expect(extractor.extract).not.toHaveBeenCalled()
    expect(extractor.thumbnail).not.toHaveBeenCalled()
    expect(store.getAll()).toEqual([])
    expect(fs.readFileSync(source, 'utf8')).toBe('original recording bytes')
  })

  it('removes failed partial clips and draft records while preserving the source', async () => {
    const { source, store, extractor, pipeline } = setup()
    extractor.extract.mockImplementation(async ({ outputPath }) => {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      fs.writeFileSync(outputPath, 'partial clip')
      throw new Error('ffmpeg exited 1: frame=321 time=00:00:10.63')
    })

    expect(await pipeline.extractMatchClips(source, null, null)).toBe(false)
    expect(extractor.extract).toHaveBeenCalledTimes(2)
    expect(extractor.extract.mock.calls.map(([opts]) => opts.accurateSeek)).toEqual([true, false])
    expect(store.getAll()).toEqual([])
    for (const [opts] of extractor.extract.mock.calls) expect(fs.existsSync(opts.outputPath)).toBe(false)
    expect(fs.readFileSync(source, 'utf8')).toBe('original recording bytes')
  })

  it('does not invoke ffmpeg when the requested clip starts after the recording ends', async () => {
    const { source, store, extractor, pipeline } = setup()
    extractor.probeDurationMs.mockResolvedValue(6_000)

    expect(await pipeline.extractMatchClips(source, null, null)).toBe(false)
    expect(extractor.extract).not.toHaveBeenCalled()
    expect(store.getAll()).toEqual([])
    expect(fs.readFileSync(source, 'utf8')).toBe('original recording bytes')
  })
})
