import fs from 'fs'
import os from 'os'
import path from 'path'
import http from 'http'
import type { AddressInfo } from 'net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ csgoDir: '' }))

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('./cs2-demo-finder', () => ({ getCandidateCS2CsgoDirs: vi.fn(async () => [h.csgoDir]) }))
vi.mock('./game-data-capture', () => ({
  getGameDataCapture: () => ({ wantsFullGsi: () => false, ingestGsi: vi.fn(), onDisarmed: vi.fn() }),
}))

import {
  ensureGsiAuthToken,
  getLatestGsiPayload,
  gsiCfgContents,
  installSteamGsiConfig,
  startSteamGsiServer,
  stopSteamGsiServer,
} from './steam-gsi-server'

const TOKEN = 'a'.repeat(64)
let port = 0
const onStaleConfig = vi.fn()

function post(body: string | Buffer, headers: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/', headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
      res.resume()
      res.on('end', () => resolve(res.statusCode ?? 0))
    })
    req.on('error', (err: NodeJS.ErrnoException) => (err.code === 'ECONNRESET' || err.code === 'EPIPE' ? resolve(-1) : reject(err)))
    req.end(body)
  })
}

const payload = (map: string, token?: string): string =>
  JSON.stringify({ map: { name: map, phase: 'live' }, ...(token !== undefined ? { auth: { token } } : {}) })

beforeAll(async () => {
  const srv = startSteamGsiServer({ port: 0, token: TOKEN, onStaleConfig })
  if (!srv.listening) await new Promise<void>((r) => srv.once('listening', () => r()))
  port = (srv.address() as AddressInfo).port
})
afterAll(() => stopSteamGsiServer())

describe('CS2 GSI server auth + size cap', () => {
  it('accepts a POST carrying the right token', async () => {
    expect(await post(payload('de_mirage', TOKEN))).toBe(200)
    expect(getLatestGsiPayload()?.map?.name).toBe('de_mirage')
  })

  it('ignores a POST without a token (and flags a stale cfg once)', async () => {
    expect(await post(payload('de_nuke'))).toBe(401)
    expect(getLatestGsiPayload()?.map?.name).toBe('de_mirage')
    expect(onStaleConfig).toHaveBeenCalledTimes(1)
  })

  it('ignores a POST with the wrong token', async () => {
    expect(await post(payload('de_dust2', 'b'.repeat(64)))).toBe(401)
    expect(await post(payload('de_dust2', 'short'))).toBe(401)
    expect(getLatestGsiPayload()?.map?.name).toBe('de_mirage')
    expect(onStaleConfig).toHaveBeenCalledTimes(1)
  })

  it('rejects a 5 MB body with 413', async () => {
    const big = Buffer.from(JSON.stringify({ auth: { token: TOKEN }, pad: 'x'.repeat(5_000_000) }))
    const status = await post(big)
    expect([413, -1]).toContain(status)
    expect(status).not.toBe(200)
    expect(getLatestGsiPayload()?.map?.name).toBe('de_mirage')
  })

  it('rejects a chunked (no content-length) 5 MB body', async () => {
    const big = Buffer.from(JSON.stringify({ auth: { token: TOKEN }, pad: 'x'.repeat(5_000_000) }))
    const status = await post(big, { 'Transfer-Encoding': 'chunked' })
    expect(status).not.toBe(200)
  })

  it('rejects any request with an Origin header (browser)', async () => {
    expect(await post(payload('de_inferno', TOKEN), { Origin: 'https://evil.example' })).toBe(403)
    expect(getLatestGsiPayload()?.map?.name).toBe('de_mirage')
  })
})

describe('GSI auth token persistence + cfg', () => {
  beforeEach(() => {
    h.csgoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-gsi-auth-'))
  })

  it('creates and persists a random token once, then reuses it', () => {
    let saved: { cs2GsiAuthToken?: string } = {}
    const store = { get: () => saved, save: vi.fn((p: { cs2GsiAuthToken: string }) => { saved = { ...saved, ...p } }) }
    const t1 = ensureGsiAuthToken(store)
    expect(t1).toMatch(/^[a-f0-9]{64}$/)
    expect(ensureGsiAuthToken(store)).toBe(t1)
    expect(store.save).toHaveBeenCalledTimes(1)
  })

  it('writes the token into the cfg auth block (rewriting an old tokenless cfg)', async () => {
    const store = { get: () => ({ cs2GsiAuthToken: TOKEN }), save: vi.fn() }
    ensureGsiAuthToken(store)
    const cfg = path.join(h.csgoDir, 'cfg', 'gamestate_integration_upforge.cfg')
    fs.mkdirSync(path.dirname(cfg), { recursive: true })
    fs.writeFileSync(cfg, gsiCfgContents(false, null))
    const res = await installSteamGsiConfig('cs2')
    expect(res.needsRestart).toBe(true)
    const text = fs.readFileSync(cfg, 'utf-8')
    expect(text).toContain(`"auth"\n    {\n        "token" "${TOKEN}"\n    }`)
    expect(gsiCfgContents(true)).toContain(`"token" "${TOKEN}"`)
    expect((await installSteamGsiConfig('cs2')).needsRestart).toBe(false)
  })
})
