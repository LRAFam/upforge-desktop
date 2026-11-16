import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }))

import { REPLAY_QUOTA_MESSAGE, UpgradeRequiredError, replayApiError } from './errors'
import { SourceReplayUploader } from './source-replay-uploader'
import { CS2DemoUploader } from './cs2-demo-uploader'

let server: http.Server | null = null
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
  server = null
})

/** Local API that answers every POST like the CS2 / Deadlock demo routes at the quota cap. */
async function quotaWallServer(body: string): Promise<string> {
  server = http.createServer((_req, res) => {
    res.writeHead(402, { 'Content-Type': 'application/json' })
    res.end(body)
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()))
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`
}

type PostFn = (url: string, body: string, token: string) => Promise<Record<string, unknown>>

describe('replay quota wall (402)', () => {
  it('maps 402 to the plan message, never "Request failed (402)"', () => {
    const err = replayApiError(402, { success: false, error: 'Monthly CS2 limit reached. Upgrade your CS2 plan.' })
    expect(err).toBeInstanceOf(UpgradeRequiredError)
    expect(err.message).toBe(REPLAY_QUOTA_MESSAGE)
    expect(err.message).not.toMatch(/402/)
  })

  it('keeps only an upforge.gg upgrade link from the API', () => {
    expect((replayApiError(402, { upgrade_url: 'https://upforge.gg/pricing?game=cs2' }) as UpgradeRequiredError).upgradeUrl)
      .toBe('https://upforge.gg/pricing?game=cs2')
    expect((replayApiError(402, { upgrade_url: 'https://evil.example/pay' }) as UpgradeRequiredError).upgradeUrl)
      .toBe('https://upforge.gg/pricing')
  })

  it('uses the API error text when there is no message key on other failures', () => {
    expect(replayApiError(422, { success: false, error: 'Demo too large' }).message).toBe('Demo too large')
    expect(replayApiError(500, {}).message).toBe('Request failed (500)')
  })

  it('Deadlock / CS2 replay uploader surfaces the plan message from a real 402 response', async () => {
    const base = await quotaWallServer(JSON.stringify({ success: false, error: 'Monthly Deadlock limit reached' }))
    const post = (new SourceReplayUploader({ getToken: () => 't' } as never) as unknown as { _apiPost: PostFn })._apiPost
    await expect(post(`${base}/api/deadlock/demo/presign`, '{}', 't')).rejects.toMatchObject({
      name: 'UpgradeRequiredError',
      message: REPLAY_QUOTA_MESSAGE,
    })
  })

  it('CS2 demo uploader surfaces the plan message even when the 402 body is not JSON', async () => {
    const base = await quotaWallServer('Payment Required')
    const up = new CS2DemoUploader({ getToken: () => 't' } as never) as unknown as { _apiPost: PostFn }
    await expect(up._apiPost.call(up, `${base}/api/cs2/demo/presign`, '{}', 't')).rejects.toBeInstanceOf(UpgradeRequiredError)
  })
})
