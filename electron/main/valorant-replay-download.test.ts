import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearReplayBaseCache,
  configRegion,
  decodeBody,
  downloadReplay,
  saveReplay,
  sharedConfigUrl,
  type HttpGet,
  type ReplayAuth,
} from './valorant-replay-download'

const MATCH = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const auth: ReplayAuth = { region: 'eu', accessToken: 'at', entitlementsToken: 'ent', clientVersion: 'release-13.09' }
const BASE = 'https://valorant.secure.dyn.riotcdn.net/x/'
const bytes = Buffer.from('fake vrf bytes')
const sha = crypto.createHash('sha256').update(bytes).digest('hex')

function fakeGet(over: Partial<Record<'config' | 'summary' | 'replay', { status: number; body: string | Buffer }>> = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = []
  const get: HttpGet = async (url, headers) => {
    calls.push({ url, headers })
    const kind = url.includes('/v1/config/') ? 'config' : url.endsWith('/summary') ? 'summary' : 'replay'
    const d = {
      config: { status: 200, body: JSON.stringify({ Collapsed: { SERVICEURL_GAME_AGNOSTIC_MATCH_HISTORY: BASE } }) },
      summary: { status: 200, body: JSON.stringify({ GameVersion: 'release-13.09', Checksum: sha.toUpperCase() }) },
      replay: { status: 200, body: bytes },
    }[kind]
    const r = over[kind] ?? d
    return { status: r.status, body: Buffer.isBuffer(r.body) ? r.body : Buffer.from(r.body) }
  }
  return { get, calls }
}

beforeEach(() => clearReplayBaseCache())

describe('replay config url', () => {
  it('uses the PD shard and the Valorant region', () => {
    expect(sharedConfigUrl('eu')).toBe('https://shared.eu.a.pvp.net/v1/config/eu')
    expect(sharedConfigUrl('br')).toBe('https://shared.na.a.pvp.net/v1/config/br')
    expect(sharedConfigUrl('latam')).toBe('https://shared.na.a.pvp.net/v1/config/latam')
    expect(sharedConfigUrl('euw1')).toBe('https://shared.eu.a.pvp.net/v1/config/eu')
    expect(configRegion('ko')).toBe('kr')
    expect(sharedConfigUrl(null)).toBeNull()
  })
})

describe('downloadReplay', () => {
  it('downloads, checks the checksum and sends the client auth headers', async () => {
    const { get, calls } = fakeGet()
    const res = await downloadReplay(MATCH, auth, get)
    expect(res).toEqual({ ok: true, bytes, gameVersion: 'release-13.09', checksum: sha })
    expect(calls.map((c) => c.url)).toEqual([
      'https://shared.eu.a.pvp.net/v1/config/eu',
      `${BASE}match-history-query/v3/product/valorant/matchId/${MATCH}/infoType/summary`,
      `${BASE}match-history-query/v3/product/valorant/matchId/${MATCH}/infoType/replay`,
    ])
    expect(calls[2].headers).toMatchObject({
      Authorization: 'Bearer at',
      'X-Riot-Entitlements-JWT': 'ent',
      'X-Riot-ClientVersion': 'release-13.09',
    })
  })

  it('reuses the service url for the next match', async () => {
    const { get, calls } = fakeGet()
    await downloadReplay(MATCH, auth, get)
    await downloadReplay(MATCH, auth, get)
    expect(calls.filter((c) => c.url.includes('/v1/config/'))).toHaveLength(1)
  })

  it('rejects a corrupted download', async () => {
    const { get } = fakeGet({ replay: { status: 200, body: Buffer.from('other bytes') } })
    expect(await downloadReplay(MATCH, auth, get)).toEqual({ ok: false, error: 'checksum_mismatch' })
  })

  it('reports a match with no replay', async () => {
    const { get } = fakeGet({ summary: { status: 404, body: '' } })
    expect(await downloadReplay(MATCH, auth, get)).toEqual({ ok: false, error: 'no_replay' })
  })

  it('refuses bad input without calling Riot', async () => {
    const { get, calls } = fakeGet()
    expect(await downloadReplay('../etc/passwd', auth, get)).toEqual({ ok: false, error: 'invalid_match_id' })
    expect(await downloadReplay(MATCH, { ...auth, accessToken: '' }, get)).toEqual({ ok: false, error: 'missing_auth' })
    expect(calls).toHaveLength(0)
  })

  it('needs the replay service in the config', async () => {
    const { get } = fakeGet({ config: { status: 200, body: JSON.stringify({ Collapsed: {} }) } })
    expect(await downloadReplay(MATCH, auth, get)).toEqual({ ok: false, error: 'config_missing_replay_service' })
  })
})

describe('reply decoding', () => {
  it('unzips gzip, deflate and brotli bodies', () => {
    const json = Buffer.from('{"GameVersion":"x","Checksum":"y"}')
    expect(decodeBody(zlib.gzipSync(json), 'gzip')).toEqual(json)
    expect(decodeBody(zlib.deflateSync(json), 'deflate')).toEqual(json)
    expect(decodeBody(zlib.brotliCompressSync(json), 'br')).toEqual(json)
    expect(decodeBody(json, undefined)).toEqual(json)
  })

  it('reads a summary that starts with a byte order mark', async () => {
    const { get } = fakeGet({ summary: { status: 200, body: `\uFEFF${JSON.stringify({ GameVersion: 'v', Checksum: sha })}` } })
    expect(await downloadReplay(MATCH, auth, get)).toMatchObject({ ok: true })
  })

  it('says what Riot sent when the summary is not JSON', async () => {
    const { get } = fakeGet({ summary: { status: 200, body: '<html>nope</html>' } })
    const res = await downloadReplay(MATCH, auth, get)
    expect(res.ok).toBe(false)
    expect(!res.ok && res.error).toMatch(/^summary_invalid_json \(.*17 bytes: <html>nope<\/html>\)$/)
  })
})

describe('saveReplay', () => {
  it('writes <matchId>.vrf', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrf-'))
    const file = saveReplay(dir, MATCH.toUpperCase(), bytes)
    expect(path.basename(file)).toBe(`${MATCH}.vrf`)
    expect(fs.readFileSync(file)).toEqual(bytes)
    expect(fs.existsSync(`${file}.part`)).toBe(false)
  })
})
