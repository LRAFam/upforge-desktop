import fs from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { userData } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs') as typeof import('fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os') as typeof import('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path') as typeof import('path')
  return { userData: nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'upforge-hb-')) }
})
vi.mock('electron', () => ({
  app: { getPath: () => userData, getAppPath: () => userData, isPackaged: false },
}))

import { UploadManager, type UploadOptions } from './upload-manager'
import type { AuthManager } from './auth-manager'

const MIN = 60_000
const API = 'https://api.test'

type Internals = {
  _apiPostOnce: (url: string, body: string, token: string) => Promise<Record<string, unknown>>
  _putToS3: (url: string, file: string, bytes: number, onProgress: (pct: number) => void) => Promise<void>
}

function setup(opts: { heartbeatFails?: boolean; uploadMinutes?: number } = {}) {
  const video = path.join(userData, 'match.mp4')
  fs.writeFileSync(video, 'x'.repeat(1024))
  const mgr = new UploadManager({ getToken: () => 'tok' } as unknown as AuthManager)
  const internals = mgr as unknown as Internals
  const heartbeats: Array<{ url: string; body: Record<string, unknown> }> = []

  internals._apiPostOnce = vi.fn(async (url: string, body: string) => {
    if (url.endsWith('/presign')) return { job_id: 'job-1', upload_url: 'https://s3.test/put' }
    if (url.endsWith('/complete')) return { ok: true }
    if (url.endsWith('/heartbeat')) {
      heartbeats.push({ url, body: JSON.parse(body) })
      if (opts.heartbeatFails) throw new Error('heartbeat 500')
      return { ok: true }
    }
    throw new Error(`unexpected ${url}`)
  })
  internals._putToS3 = vi.fn((_url, _file, _bytes, onProgress) => new Promise<void>((resolve) => {
    const total = (opts.uploadMinutes ?? 35) * MIN
    let elapsed = 0
    const tick = setInterval(() => {
      elapsed += MIN
      onProgress(Math.min(8 + Math.round((elapsed / total) * 91), 99))
      if (elapsed >= total) { clearInterval(tick); resolve() }
    }, MIN)
  }))

  const uploadOpts: UploadOptions = {
    videoPath: video, riotName: 'P', riotTag: 'EUW', game: 'valorant',
    map: null, agent: null, timeline: null, onProgress: () => {},
  }
  return { mgr, heartbeats, uploadOpts }
}

describe('upload heartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_API_URL', API)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('pings the API every 10 minutes during a long S3 upload, then stops', async () => {
    const { mgr, heartbeats, uploadOpts } = setup({ uploadMinutes: 35 })
    const done = mgr.upload(uploadOpts)

    await vi.advanceTimersByTimeAsync(35 * MIN + 1_000)
    await expect(done).resolves.toMatchObject({ job_id: 'job-1' })

    expect(heartbeats).toHaveLength(3)
    expect(heartbeats[0].url).toBe(`${API}/api/desktop-submissions/job-1/heartbeat`)
    expect(typeof heartbeats[0].body.progress).toBe('number')
    expect(heartbeats[2].body.progress as number).toBeGreaterThan(heartbeats[0].body.progress as number)

    await vi.advanceTimersByTimeAsync(60 * MIN)
    expect(heartbeats).toHaveLength(3)
  })

  it('ignores heartbeat failures and finishes the upload', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { mgr, heartbeats, uploadOpts } = setup({ heartbeatFails: true, uploadMinutes: 25 })
    const done = mgr.upload(uploadOpts)

    await vi.advanceTimersByTimeAsync(25 * MIN + 1_000)
    await expect(done).resolves.toMatchObject({ job_id: 'job-1' })
    expect(heartbeats).toHaveLength(2)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('heartbeat'), expect.anything())
    warn.mockRestore()
  })

  it('stops heartbeating when the upload is cancelled', async () => {
    const { mgr, heartbeats, uploadOpts } = setup({ uploadMinutes: 60 })
    const done = mgr.upload(uploadOpts)
    done.catch(() => {})

    await vi.advanceTimersByTimeAsync(15 * MIN)
    expect(heartbeats).toHaveLength(1)
    mgr.abort()
    await vi.advanceTimersByTimeAsync(30 * MIN)
    expect(heartbeats).toHaveLength(1)
  })
})
