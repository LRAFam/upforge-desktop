import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const runtime = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => runtime.root, getVersion: () => '0.0.0', isPackaged: false },
  BrowserWindow: class {},
  shell: { openExternal: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => false },
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
vi.mock('electron-log', () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))

import { cleanupLegacyRecordingDuplicates, runRecordingStorageMaintenance } from './storage-cleanup'
import { migrateFile } from './legacy-migration'
import { RecordingsStore } from './recordings-store'
import { filesHaveIdenticalBytes } from './file-identity'

let legacyDir = ''
let activeDir = ''

beforeEach(() => {
  runtime.root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-legacy-'))
  legacyDir = path.join(runtime.root, 'recordings')
  activeDir = path.join(runtime.root, 'users', '2', 'recordings')
  fs.mkdirSync(legacyDir, { recursive: true })
  fs.mkdirSync(activeDir, { recursive: true })
})
afterEach(() => { fs.rmSync(runtime.root, { recursive: true, force: true }) })

const original = Buffer.from('original match bytes '.repeat(1000))

describe('legacy duplicate cleanup only removes proven copies', () => {
  it('keeps the original when the same-named active file is truncated', async () => {
    fs.writeFileSync(path.join(legacyDir, 'match.mp4'), original)
    fs.writeFileSync(path.join(activeDir, 'match.mp4'), original.subarray(0, 100))
    const result = await cleanupLegacyRecordingDuplicates(activeDir)
    expect(result.removed).toBe(0)
    expect(fs.readFileSync(path.join(legacyDir, 'match.mp4')).equals(original)).toBe(true)
  })

  it('keeps the original when the active file has the same size but different bytes', async () => {
    const other = Buffer.from(original)
    other[other.length - 1] ^= 0xff
    fs.writeFileSync(path.join(legacyDir, 'match.mp4'), original)
    fs.writeFileSync(path.join(activeDir, 'match.mp4'), other)
    const result = await cleanupLegacyRecordingDuplicates(activeDir)
    expect(result.removed).toBe(0)
    expect(fs.existsSync(path.join(legacyDir, 'match.mp4'))).toBe(true)
  })

  it('removes a byte-identical copy but never its compressed variant', async () => {
    fs.writeFileSync(path.join(legacyDir, 'match.mp4'), original)
    fs.writeFileSync(path.join(legacyDir, 'match_upforge.mp4'), 'compressed')
    fs.writeFileSync(path.join(activeDir, 'match.mp4'), original)
    const result = await cleanupLegacyRecordingDuplicates(activeDir)
    expect(result.removed).toBe(1)
    expect(fs.existsSync(path.join(legacyDir, 'match.mp4'))).toBe(false)
    expect(fs.existsSync(path.join(legacyDir, 'match_upforge.mp4'))).toBe(true)
    expect(fs.readFileSync(path.join(activeDir, 'match.mp4')).equals(original)).toBe(true)
  })

  it('keeps an identical legacy file that a catalogue still references', async () => {
    const legacyPath = path.join(legacyDir, 'match.mp4')
    fs.writeFileSync(legacyPath, original)
    fs.writeFileSync(path.join(activeDir, 'match.mp4'), original)
    fs.writeFileSync(path.join(runtime.root, 'users', '2', 'recordings.json'), JSON.stringify([{ id: 'r1', path: legacyPath }]))
    const result = await cleanupLegacyRecordingDuplicates(activeDir)
    expect(result.removed).toBe(0)
    expect(fs.existsSync(legacyPath)).toBe(true)
  })

  it('synchronous maintenance (retention Never) never deletes legacy files', () => {
    fs.writeFileSync(path.join(legacyDir, 'match.mp4'), original)
    fs.writeFileSync(path.join(activeDir, 'match.mp4'), original.subarray(0, 10))
    runRecordingStorageMaintenance({
      store: new RecordingsStore(),
      savePath: activeDir,
      recordingRetentionDays: 0,
      linkedRiot: null,
    })
    expect(fs.existsSync(path.join(legacyDir, 'match.mp4'))).toBe(true)
  })
})

describe('legacy migration never trusts size alone', () => {
  it('keeps the source when an equal-size destination has different bytes', async () => {
    const src = path.join(legacyDir, 'a.mp4')
    const dest = path.join(activeDir, 'a.mp4')
    const other = Buffer.from(original)
    other[0] ^= 0xff
    fs.writeFileSync(src, original)
    fs.writeFileSync(dest, other)
    expect(await migrateFile(src, dest)).toBe('skipped')
    expect(fs.readFileSync(src).equals(original)).toBe(true)
  })

  it('removes the source when the destination is a verified copy', async () => {
    const src = path.join(legacyDir, 'a.mp4')
    const dest = path.join(activeDir, 'a.mp4')
    fs.writeFileSync(src, original)
    fs.writeFileSync(dest, original)
    expect(await migrateFile(src, dest)).toBe('moved')
    expect(fs.existsSync(src)).toBe(false)
  })

  it('cross-volume copy failure leaves the original and no destination', async () => {
    const src = path.join(legacyDir, 'b.mp4')
    const dest = path.join(activeDir, 'b.mp4')
    fs.writeFileSync(src, original)
    const rename = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('cross-device'), { code: 'EXDEV' })
    })
    const copy = vi.spyOn(fs.promises, 'copyFile').mockImplementationOnce(async (_s, d) => {
      fs.writeFileSync(d as string, original.subarray(0, 50)) // interrupted copy
      throw new Error('ENOSPC')
    })
    expect(await migrateFile(src, dest)).toBe('failed')
    rename.mockRestore()
    copy.mockRestore()
    expect(fs.readFileSync(src).equals(original)).toBe(true)
    expect(fs.existsSync(dest)).toBe(false)
    expect(fs.existsSync(`${dest}.partial`)).toBe(false)
  })

  it('filesHaveIdenticalBytes compares across chunk boundaries', async () => {
    const big = Buffer.alloc(3 * 1024 * 1024 + 7, 1)
    const bigOther = Buffer.from(big)
    bigOther[2 * 1024 * 1024 + 3] = 2
    fs.writeFileSync(path.join(legacyDir, 'x'), big)
    fs.writeFileSync(path.join(activeDir, 'x'), big)
    fs.writeFileSync(path.join(activeDir, 'y'), bigOther)
    expect(await filesHaveIdenticalBytes(path.join(legacyDir, 'x'), path.join(activeDir, 'x'))).toBe(true)
    expect(await filesHaveIdenticalBytes(path.join(legacyDir, 'x'), path.join(activeDir, 'y'))).toBe(false)
  })
})
