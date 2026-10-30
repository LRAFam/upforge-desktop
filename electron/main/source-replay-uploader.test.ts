import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }))

import { SourceReplayUploader } from './source-replay-uploader'

let dir = ''
let demo = ''
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-replay-'))
  demo = path.join(dir, 'match.dem')
  fs.writeFileSync(demo, 'demo')
})
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

function uploader(presign: Record<string, unknown>) {
  const up = new SourceReplayUploader({ getToken: () => 'token' } as never)
  const calls: string[] = []
  const anyUp = up as unknown as { _apiPost: (url: string) => Promise<Record<string, unknown>>; _putToS3: () => Promise<void> }
  anyUp._apiPost = vi.fn(async (url: string) => { calls.push(url.endsWith('/presign') ? 'presign' : 'confirm'); return url.endsWith('/presign') ? presign : {} })
  anyUp._putToS3 = vi.fn(async () => { calls.push('put') })
  return { up, calls }
}

describe('SourceReplayUploader: already analysed match', () => {
  it('skips the upload and confirm and returns the first analysis job', async () => {
    const { up, calls } = uploader({ already_analysed: true, upload_url: null, job_id: 'job-first-123' })
    const progress: number[] = []
    const res = await up.upload({ game: 'deadlock', demoPath: demo, matchId: 555, onProgress: p => progress.push(p) })
    expect(res).toEqual({ jobId: 'job-first-123', alreadyAnalysed: true })
    expect(calls).toEqual(['presign'])
    expect(progress.at(-1)).toBe(100)
  })

  it('uploads and confirms a new match as before', async () => {
    const { up, calls } = uploader({ job_id: 'job-new-456', upload_url: 'https://s3.example/put' })
    const res = await up.upload({ game: 'deadlock', demoPath: demo, matchId: 556, onProgress: () => {} })
    expect(res).toEqual({ jobId: 'job-new-456' })
    expect(calls).toEqual(['presign', 'put', 'confirm'])
  })
})
