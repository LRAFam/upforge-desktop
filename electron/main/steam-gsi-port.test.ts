import fs from 'fs'
import os from 'os'
import path from 'path'
import net from 'net'
import type { AddressInfo } from 'net'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ csgoDir: '' }))

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('./cs2-demo-finder', () => ({ getCandidateCS2CsgoDirs: vi.fn(async () => [h.csgoDir]) }))
vi.mock('./game-data-capture', () => ({
  getGameDataCapture: () => ({ wantsFullGsi: () => false, ingestGsi: vi.fn(), onDisarmed: vi.fn() }),
}))

import { gsiPortCandidates, listenOnFirstFreePort } from './steam-gsi-port'
import {
  getActiveGsiPort,
  gsiCfgContents,
  isGsiPortBlocked,
  startSteamGsiServer,
  stopSteamGsiServer,
} from './steam-gsi-server'

/** Grab a free port then hold it, so we know it is busy. */
function occupy(port = 0): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.once('error', reject)
    s.listen(port, '127.0.0.1', () => resolve(s))
  })
}
const portOf = (s: net.Server): number => (s.address() as AddressInfo).port
const close = (s: net.Server): Promise<void> => new Promise((r) => s.close(() => r()))

describe('gsiPortCandidates', () => {
  it('tries the configured port first, then the rest of the small range', () => {
    expect(gsiPortCandidates(3001, 3001, 4)).toEqual([3001, 3002, 3003, 3004])
    expect(gsiPortCandidates(3003, 3001, 4)).toEqual([3003, 3001, 3002, 3004])
  })

  it('ignores a configured port that is not a valid port', () => {
    expect(gsiPortCandidates(undefined, 3001, 2)).toEqual([3001, 3002])
    expect(gsiPortCandidates(70_000, 3001, 2)).toEqual([3001, 3002])
    expect(gsiPortCandidates(Number.NaN, 3001, 2)).toEqual([3001, 3002])
  })
})

describe('listenOnFirstFreePort', () => {
  const held: net.Server[] = []
  afterEach(async () => { await Promise.all(held.splice(0).map(close)) })

  it('falls back to the next port when the first is in use', async () => {
    const busy = await occupy()
    held.push(busy)
    const busyPort = portOf(busy)
    const free = await occupy()
    const freePort = portOf(free)
    await close(free)

    const srv = net.createServer()
    const bound = await listenOnFirstFreePort(srv, [busyPort, freePort], '127.0.0.1')
    held.push(srv)
    expect(bound).toBe(freePort)
    expect(srv.listening).toBe(true)
  })

  it('returns null when every candidate is in use', async () => {
    const a = await occupy()
    const b = await occupy()
    held.push(a, b)
    const srv = net.createServer()
    expect(await listenOnFirstFreePort(srv, [portOf(a), portOf(b)], '127.0.0.1')).toBeNull()
    expect(srv.listening).toBe(false)
  })
})

describe('GSI server port fallback', () => {
  let tmp = ''
  let busy: net.Server
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsi-port-'))
    h.csgoDir = tmp
    busy = await occupy()
  })
  afterAll(async () => {
    await stopSteamGsiServer()
    await close(busy)
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('binds the next free port, rewrites the cfg with it and tells the caller to restart CS2', async () => {
    const busyPort = portOf(busy)
    const cfg = path.join(tmp, 'cfg', 'gamestate_integration_upforge.cfg')
    fs.mkdirSync(path.dirname(cfg), { recursive: true })
    fs.writeFileSync(cfg, gsiCfgContents(false).replace(/127\.0\.0\.1:\d+/, `127.0.0.1:${busyPort}`))

    const changed = await new Promise<{ port: number; cfgUpdated: boolean }>((resolve) => {
      startSteamGsiServer({
        token: 'b'.repeat(64),
        preferredPort: busyPort,
        portRange: { base: busyPort, size: 5 },
        onPortChanged: (info) => resolve(info),
      })
    })

    expect(changed.port).not.toBe(busyPort)
    expect(changed.port).toBeGreaterThan(busyPort)
    expect(changed.port).toBeLessThan(busyPort + 5)
    expect(changed.cfgUpdated).toBe(true)
    expect(getActiveGsiPort()).toBe(changed.port)
    expect(isGsiPortBlocked()).toBe(false)
    expect(fs.readFileSync(cfg, 'utf-8')).toContain(`"uri" "http://127.0.0.1:${changed.port}"`)
    expect(gsiCfgContents(true)).toContain(`127.0.0.1:${changed.port}`)
  })
})
