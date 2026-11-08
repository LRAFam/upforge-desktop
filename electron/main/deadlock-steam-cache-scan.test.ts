import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { resetSteamHttpCacheScanState, scanSteamHttpCache } from './deadlock-steam-cache'

let root = ''
const S = 1000
const now = Date.now()

function writeEntry(rel: string, matchId: number, mtimeMs: number): void {
  const file = path.join(root, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, Buffer.from(`\0replay7.valve.net/1422450/${matchId}_55.meta.bz2\0`))
  fs.utimesSync(file, mtimeMs / S, mtimeMs / S)
}
function setDirMtime(rel: string, mtimeMs: number): void {
  fs.utimesSync(path.join(root, rel), mtimeMs / S, mtimeMs / S)
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-dl-cache-scan-'))
  resetSteamHttpCacheScanState()
  const t0 = now - 100 * S
  writeEntry('a/f_1', 101, t0)
  writeEntry('b/f_2', 202, t0)
  setDirMtime('a', t0)
  setDirMtime('b', t0)
  setDirMtime('.', t0)
})
afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(root, { recursive: true, force: true })
})

describe('Deadlock httpcache safety-net scan', () => {
  it('uses async fs only (no readdirSync / statSync / readSync on the main thread)', async () => {
    const syncCalls = [
      vi.spyOn(fs, 'readdirSync'),
      vi.spyOn(fs, 'statSync'),
      vi.spyOn(fs, 'openSync'),
      vi.spyOn(fs, 'readSync'),
      vi.spyOn(fs, 'fstatSync'),
    ]
    const readdir = vi.spyOn(fs.promises, 'readdir')
    const hits = await scanSteamHttpCache(now - 200 * S, { cacheDir: root })
    expect(hits.map((h) => h.matchId).sort()).toEqual([101, 202])
    expect(readdir).toHaveBeenCalled()
    for (const spy of syncCalls) expect(spy).not.toHaveBeenCalled()
  })

  it('skips directories whose mtime is unchanged since the last scan', async () => {
    const notBefore = now - 50 * S
    await scanSteamHttpCache(now - 200 * S, { cacheDir: root, skipUnchangedDirs: true })

    const readdir = vi.spyOn(fs.promises, 'readdir')
    expect(await scanSteamHttpCache(notBefore, { cacheDir: root, skipUnchangedDirs: true })).toEqual([])
    expect(readdir).not.toHaveBeenCalled()

    // New cache file in a/ → only a/ is listed again, and the new match is found.
    writeEntry('a/f_3', 303, now - 10 * S)
    setDirMtime('a', now - 10 * S)
    const hits = await scanSteamHttpCache(notBefore, { cacheDir: root, skipUnchangedDirs: true })
    expect(hits.map((h) => h.matchId)).toEqual([303])
    expect(readdir).toHaveBeenCalledTimes(1)
    expect(String(readdir.mock.calls[0]![0])).toBe(path.join(root, 'a'))
  })

  it('finds the same hits as a full walk when skipping is off (watcher down)', async () => {
    await scanSteamHttpCache(now - 200 * S, { cacheDir: root })
    const readdir = vi.spyOn(fs.promises, 'readdir')
    writeEntry('b/f_2', 202, now - 10 * S) // in-place rewrite: dir mtime may not move
    setDirMtime('b', now - 100 * S)
    const hits = await scanSteamHttpCache(now - 50 * S, { cacheDir: root })
    expect(hits.map((h) => h.matchId)).toEqual([202])
    expect(readdir).toHaveBeenCalledTimes(3)
  })
})
