import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { AuthManager } from './auth-manager'

const fixture = vi.hoisted(() => ({ dir: '/tmp' }))
vi.mock('electron', () => ({ app: { getPath: () => fixture.dir, getAppPath: () => '/tmp', isPackaged: false } }))
vi.mock('electron-log', () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))
import { UploadManager } from './upload-manager'
import { backgroundWork } from './background-work'
import { multipartStatePath, readMultipartState } from './multipart-upload-state'

type Scope = { signal: AbortSignal; onProgress?: () => void }
type Part = { part_number: number; upload_url: string }
type Internals = {
  _putPartToS3: (url: string, body: Buffer, scope?: Scope) => Promise<string>
  _putToS3Multipart: (file: string, bytes: number, parts: Part[], size: number, progress: (n: number) => void, concurrency: number,
    resume?: { recordingId: string; jobId: string; uploadId: string; ownerUserId: number; uploadedParts?: unknown }) => Promise<unknown>
  _withUploadRetry: (label: string, fn: () => Promise<void>) => Promise<void>
}

beforeEach(() => {
  fixture.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-stall-test-'))
  backgroundWork.configure(() => false)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  backgroundWork.cancel()
  backgroundWork.configure(() => false)
  fs.rmSync(fixture.dir, { recursive: true, force: true })
})

function setup() {
  const file = path.join(fixture.dir, 'recording.mp4')
  const original = Buffer.alloc(100, 7)
  fs.writeFileSync(file, original)
  const manager = new UploadManager({ getToken: () => 'test' } as AuthManager)
  return { file, original, internal: manager as unknown as Internals }
}

describe('S3 stall recovery without a live server', () => {
  it('retains original bytes and completed parts after a 120-second stall, then resumes the remaining part', async () => {
    const { file, original, internal } = setup()
    vi.useFakeTimers()
    const put = vi.spyOn(internal, '_putPartToS3')
      .mockResolvedValueOnce('etag-first')
      .mockImplementationOnce((_url, _body, scope) => new Promise((_resolve, reject) => {
        scope!.signal.addEventListener('abort', () => reject(scope!.signal.reason))
      }))
    const parts = [1, 2].map(n => ({ part_number: n, upload_url: `https://s3.invalid/${n}` }))
    const resume = { recordingId: 'recording', jobId: 'job', uploadId: 'upload', ownerUserId: 7 }
    const upload = internal._putToS3Multipart(file, 100, parts, 50, vi.fn(), 1, resume)
    const rejected = expect(upload).rejects.toMatchObject({ failureCode: 'upload_stalled' })
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(2))
    await vi.advanceTimersByTimeAsync(130_000)
    await rejected

    expect(fs.readFileSync(file)).toEqual(original)
    expect(readMultipartState(multipartStatePath(fixture.dir, 'recording', 7))?.completedParts)
      .toEqual([{ part_number: 1, etag: 'etag-first' }])

    put.mockResolvedValueOnce('etag-second')
    await expect(internal._putToS3Multipart(file, 100, parts, 50, vi.fn(), 1, {
      ...resume, uploadedParts: [{ part_number: 1, etag: 'etag-first' }],
    })).resolves.toEqual([{ part_number: 1, etag: 'etag-first' }, { part_number: 2, etag: 'etag-second' }])
    expect(put).toHaveBeenCalledTimes(3)
    expect(put.mock.calls[2][0]).toBe('https://s3.invalid/2')
    expect(fs.readFileSync(file)).toEqual(original)
  })

  it('does not mistake a slow transfer with byte progress for a stall', async () => {
    const { file, internal } = setup()
    vi.useFakeTimers()
    const put = vi.spyOn(internal, '_putPartToS3').mockImplementation((_url, _body, scope) => new Promise((resolve, reject) => {
      const heartbeat = setInterval(() => scope?.onProgress?.(), 20_000)
      scope!.signal.addEventListener('abort', () => { clearInterval(heartbeat); reject(scope!.signal.reason) })
      setTimeout(() => { clearInterval(heartbeat); resolve('etag') }, 180_000)
    }))
    const upload = internal._putToS3Multipart(file, 100, [{ part_number: 1, upload_url: 'https://s3.invalid/1' }], 100, vi.fn(), 1)
    await vi.waitFor(() => expect(put).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(181_000)
    await expect(upload).resolves.toEqual([{ part_number: 1, etag: 'etag' }])
  })

  it('bounds stalled part retries and preserves the original after exhaustion', async () => {
    const { file, original, internal } = setup()
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const send = vi.fn(async () => { throw new Error('upload_stalled: no progress') })
    const upload = internal._withUploadRetry('S3 part', send)
    const rejected = expect(upload).rejects.toThrow('upload_stalled')
    await vi.runAllTimersAsync()
    await rejected
    expect(send).toHaveBeenCalledTimes(5)
    expect(fs.readFileSync(file)).toEqual(original)
  })
})
