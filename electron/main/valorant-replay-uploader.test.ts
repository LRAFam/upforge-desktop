import { describe, expect, it } from 'vitest'
import { ValorantReplayUploader, type Send } from './valorant-replay-uploader'

function fakeSend(replies: Record<string, { status: number; body?: string }>) {
  const calls: { method: string; url: string; body: Buffer | string }[] = []
  const send: Send = async (method, url, _headers, body) => {
    calls.push({ method, url, body })
    const key = Object.keys(replies).find((k) => url.includes(k)) ?? ''
    const r = replies[key] ?? { status: 200 }
    return { status: r.status, body: r.body ?? '{}' }
  }
  return { send, calls }
}

const meta = { gameVersion: 'release-13.09', checksum: 'abc', queueId: 'competitive' }
const make = (send: Send, token: string | null = 't') => new ValorantReplayUploader(() => token, '3.1.2', send, () => 'https://api.test')

describe('ValorantReplayUploader', () => {
  it('presigns, puts the bytes to storage and confirms', async () => {
    const { send, calls } = fakeSend({ presign: { status: 200, body: JSON.stringify({ upload_id: 'u1', upload_url: 'https://store.test/put' }) } })
    expect(await make(send).upload('m1', Buffer.from('vrf'), meta)).toEqual({ ok: true })
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST https://api.test/api/valorant/replays/presign', 'PUT https://store.test/put', 'POST https://api.test/api/valorant/replays/confirm'])
    expect(JSON.parse(String(calls[0].body))).toEqual({ match_id: 'm1', game_version: 'release-13.09', checksum: 'abc', size_bytes: 3, queue_id: 'competitive' })
  })

  it('stops when the server already has the replay', async () => {
    const { send, calls } = fakeSend({ presign: { status: 200, body: '{"already_uploaded":true}' } })
    expect(await make(send).upload('m1', Buffer.from('vrf'), meta)).toEqual({ ok: true })
    expect(calls).toHaveLength(1)
  })

  it('names the step that failed', async () => {
    expect(await make(fakeSend({ presign: { status: 404 } }).send).upload('m1', Buffer.from('x'), meta)).toEqual({ ok: false, error: 'presign_http_404' })
    const ok = JSON.stringify({ upload_id: 'u', upload_url: 'https://store.test/put' })
    expect(await make(fakeSend({ presign: { status: 200, body: ok }, 'store.test': { status: 403 } }).send).upload('m1', Buffer.from('x'), meta))
      .toEqual({ ok: false, error: 'storage_http_403' })
    expect(await make(fakeSend({}).send, null).upload('m1', Buffer.from('x'), meta)).toEqual({ ok: false, error: 'not_signed_in' })
  })

  it('reports failures with the app version and never throws', async () => {
    const { send, calls } = fakeSend({})
    await make(send).report('m1', 'no_replay', { attempts: 6, queueId: 'swiftplay' })
    expect(JSON.parse(String(calls[0].body))).toEqual({ match_id: 'm1', error: 'no_replay', game_version: null, attempts: 6, queue_id: 'swiftplay', app_version: '3.1.2' })
    await expect(make(async () => { throw new Error('offline') }).report('m1', 'x', { attempts: 1 })).resolves.toBeUndefined()
  })
})
