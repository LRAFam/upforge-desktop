import zlib from 'zlib'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearViewerReplayCache, fetchViewerReplay } from './valorant-replay-viewer'
import type { HttpGet } from './valorant-replay-download'

const ID = '85c69f8f-8388-48f2-a76c-c7c433e971a3'

beforeEach(() => clearViewerReplayCache())

describe('fetchViewerReplay', () => {
  it('gets the link from the API, downloads and unzips the parsed replay, then caches it', async () => {
    const urls: string[] = []
    const get: HttpGet = async (url, headers) => {
      urls.push(url)
      if (url.includes('/api/valorant/replays/')) {
        expect(headers.Authorization).toBe('Bearer t')
        return { status: 200, body: Buffer.from(JSON.stringify({ status: 'parsed', compact_url: 'https://cdn.test/c.gz' })) }
      }
      expect(headers.Authorization).toBeUndefined()
      return { status: 200, body: zlib.gzipSync(Buffer.from('{"schema":1}')) }
    }
    expect(await fetchViewerReplay(ID, 't', get, 'https://api.test')).toEqual({ ok: true, status: 'parsed', compact: { schema: 1 } })
    await fetchViewerReplay(ID.toUpperCase(), 't', get, 'https://api.test')
    expect(urls).toEqual([`https://api.test/api/valorant/replays/${ID}`, 'https://cdn.test/c.gz'])
  })

  it('reports a replay that is not parsed yet', async () => {
    const get: HttpGet = async () => ({ status: 200, body: Buffer.from('{"status":"uploaded","compact_url":null}') })
    expect(await fetchViewerReplay(ID, 't', get, 'https://api.test')).toEqual({ ok: false, status: 'uploaded' })
  })

  it('refuses bad ids and missing sign-in without calling anything', async () => {
    const get: HttpGet = async () => { throw new Error('should not be called') }
    expect(await fetchViewerReplay('nope', 't', get)).toMatchObject({ ok: false, error: 'invalid_match_id' })
    expect(await fetchViewerReplay(ID, null, get)).toMatchObject({ ok: false, error: 'not_signed_in' })
  })
})
