import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }))
vi.mock('./analysis-trace', () => ({ noteAnalysisJob: vi.fn(), clientVersionHeaders: () => ({}) }))

import { noteAnalysisJob } from './analysis-trace'
import { SourceReplayUploader } from './source-replay-uploader'
import type { SourceGame } from './source-replay-finder'

let dir: string
let demo: string
beforeEach(() => {
  vi.clearAllMocks()
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-replay-presign-'))
  demo = path.join(dir, 'match.dem')
  fs.writeFileSync(demo, 'original replay')
})
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

function setup(presign: Record<string, unknown>) {
  const uploader = new SourceReplayUploader({ getToken: () => 'test-token' } as never)
  const internal = uploader as unknown as {
    _apiPost: (url: string, body: string, token: string) => Promise<Record<string, unknown>>
    _putToS3: () => Promise<void>
  }
  const post = vi.spyOn(internal, '_apiPost').mockResolvedValue(presign)
  const put = vi.spyOn(internal, '_putToS3').mockResolvedValue(undefined)
  return { uploader, post, put }
}

describe.each(['cs2', 'deadlock'] as SourceGame[])('%s replay presign boundary', game => {
  it.each([
    ['missing', undefined], ['null', null], ['number', 123], ['object', {}],
    ['empty', ''], ['blank', '   '], ['undefined literal', 'undefined'],
    ['NaN literal', 'NaN'], ['path segment', '../invalid-job'], ['oversized', 'a'.repeat(65)],
  ])('rejects a %s job id before upload, confirm or cached-success navigation', async (_label, jobId) => {
    for (const alreadyAnalysed of [false, true]) {
      const { uploader, post, put } = setup({ job_id: jobId, upload_url: 'https://upload.example.test/demo', already_analysed: alreadyAnalysed })
      const progress = vi.fn()
      await expect(uploader.upload({ game, demoPath: demo, onProgress: progress })).rejects.toThrow('Invalid replay job ID')
      expect(post).toHaveBeenCalledOnce()
      expect(post.mock.calls[0][0]).toMatch(/\/presign$/)
      expect(put).not.toHaveBeenCalled()
      expect(noteAnalysisJob).not.toHaveBeenCalled()
      expect(progress).not.toHaveBeenCalledWith(100)
      expect(fs.readFileSync(demo, 'utf8')).toBe('original replay')
    }
  })

  it('passes the server UUID unchanged to confirmation and the caller', async () => {
    const jobId = 'd87cdb98-4239-4b93-8718-70d1f20339e7'
    const { uploader, post, put } = setup({ job_id: jobId, upload_url: 'https://upload.example.test/demo' })
    await expect(uploader.upload({ game, demoPath: demo, onProgress: vi.fn() })).resolves.toEqual({ jobId })
    expect(put).toHaveBeenCalledOnce()
    expect(post).toHaveBeenCalledTimes(2)
    expect(JSON.parse(post.mock.calls[1][1])).toMatchObject({ job_id: jobId })
    expect(noteAnalysisJob).toHaveBeenCalledWith({ jobId, game })
  })

  it('keeps the existing no-upload result for a valid previously analysed job', async () => {
    const jobId = 'job-first-123'
    const { uploader, post, put } = setup({ job_id: jobId, already_analysed: true, upload_url: null })
    await expect(uploader.upload({ game, demoPath: demo, onProgress: vi.fn() })).resolves.toEqual({ jobId, alreadyAnalysed: true })
    expect(post).toHaveBeenCalledOnce()
    expect(put).not.toHaveBeenCalled()
  })
})
