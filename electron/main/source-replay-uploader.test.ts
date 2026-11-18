import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }))

import { DEADLOCK_REPLAY_MAX_MB, SourceReplayUploader } from './source-replay-uploader'
import { ReplayTooLargeError, replayApiError } from './errors'

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

describe('SourceReplayUploader: automatic Deadlock uploads', () => {
  it('tells the API the upload is automatic and which queue it was', async () => {
    const up = new SourceReplayUploader({ getToken: () => 'token' } as never)
    const bodies: Array<Record<string, unknown>> = []
    const anyUp = up as unknown as { _apiPost: (url: string, body: string) => Promise<Record<string, unknown>>; _putToS3: () => Promise<void> }
    anyUp._apiPost = vi.fn(async (url: string, body: string) => {
      if (url.endsWith('/presign')) bodies.push(JSON.parse(body))
      return url.endsWith('/presign') ? { job_id: 'job-auto', upload_url: 'https://s3.example/put' } : {}
    })
    anyUp._putToS3 = vi.fn(async () => {})
    await up.upload({ game: 'deadlock', demoPath: demo, matchId: 557, trigger: 'auto', queue: 'ranked', onProgress: () => {} })
    await up.upload({ game: 'deadlock', demoPath: demo, matchId: 558, onProgress: () => {} })
    expect(bodies[0]).toMatchObject({ match_id: 557, trigger: 'auto', queue: 'ranked' })
    expect(bodies[1]).not.toHaveProperty('trigger')
    expect(bodies[1]).not.toHaveProperty('queue')
  })
})

describe('SourceReplayUploader: Deadlock replay size limit', () => {
  function recordingUploader() {
    const up = new SourceReplayUploader({ getToken: () => 'token' } as never)
    const bodies: Array<Record<string, unknown>> = []
    const anyUp = up as unknown as { _apiPost: (url: string, body: string) => Promise<Record<string, unknown>>; _putToS3: () => Promise<void> }
    anyUp._apiPost = vi.fn(async (url: string, body: string) => {
      if (url.endsWith('/presign')) bodies.push(JSON.parse(body))
      return url.endsWith('/presign') ? { job_id: 'job-size', upload_url: 'https://s3.example/put' } : {}
    })
    anyUp._putToS3 = vi.fn(async () => {})
    return { up, bodies, anyUp }
  }

  it('refuses a replay over the limit before asking the API (no upload, no credit)', async () => {
    fs.truncateSync(demo, DEADLOCK_REPLAY_MAX_MB * 1024 * 1024 + 1)
    const { up, anyUp } = recordingUploader()
    const err = await up.upload({ game: 'deadlock', demoPath: demo, onProgress: () => {} }).catch(e => e)
    expect(err).toBeInstanceOf(ReplayTooLargeError)
    expect(err.message).toContain(`${DEADLOCK_REPLAY_MAX_MB} MB`)
    expect(anyUp._apiPost).not.toHaveBeenCalled()
    expect(anyUp._putToS3).not.toHaveBeenCalled()
  })

  it('uploads a replay exactly at the limit and tells the presign step its size', async () => {
    fs.truncateSync(demo, DEADLOCK_REPLAY_MAX_MB * 1024 * 1024)
    const { up, bodies } = recordingUploader()
    await up.upload({ game: 'deadlock', demoPath: demo, onProgress: () => {} })
    expect(bodies[0]).toMatchObject({ file_size_bytes: DEADLOCK_REPLAY_MAX_MB * 1024 * 1024 })
  })

  it('turns the API 413 refusal into the same size error with the server message', () => {
    const err = replayApiError(413, { code: 'replay_too_large', max_upload_mb: 300, error: 'This replay is too large to analyse (over 300 MB). No credit was used.' })
    expect(err).toBeInstanceOf(ReplayTooLargeError)
    expect(err.message).toContain('300 MB')
  })
})

describe('SourceReplayUploader.pollStatus: stalled connections', () => {
  let server: import('node:http').Server
  let sockets: import('node:net').Socket[] = []
  const prevApi = process.env.VITE_API_URL

  async function listen(handler: import('node:http').RequestListener): Promise<void> {
    const http = await import('node:http')
    server = http.createServer(handler)
    server.on('connection', (s) => sockets.push(s))
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const { port } = server.address() as import('node:net').AddressInfo
    process.env.VITE_API_URL = `http://127.0.0.1:${port}`
  }

  afterEach(async () => {
    process.env.VITE_API_URL = prevApi
    if (prevApi === undefined) delete process.env.VITE_API_URL
    for (const s of sockets) s.destroy()
    sockets = []
    await new Promise<void>((r) => server?.close(() => r()))
  })

  it('aborts a request that never answers within the request deadline', async () => {
    await listen(() => { /* accept, never respond */ })
    const up = new SourceReplayUploader({ getToken: () => 'token' } as never)
    up.statusTimeoutMs = 200
    const started = Date.now()
    await expect(up.pollStatus('cs2', 'job-1')).rejects.toThrow(/timed out/i)
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  it('rejects (never stays pending) when the response is cut off mid-body', async () => {
    await listen((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.write('{"status":')
      setTimeout(() => res.socket?.destroy(), 20)
    })
    const up = new SourceReplayUploader({ getToken: () => 'token' } as never)
    up.statusTimeoutMs = 2_000
    await expect(up.pollStatus('cs2', 'job-2')).rejects.toThrow()
  })

  it('still reads a normal status reply', async () => {
    await listen((_req, res) => { res.writeHead(200); res.end('{"status":"completed"}') })
    const up = new SourceReplayUploader({ getToken: () => 'token' } as never)
    await expect(up.pollStatus('deadlock', 'job-3')).resolves.toEqual({ status: 'completed', error: null })
  })
})
