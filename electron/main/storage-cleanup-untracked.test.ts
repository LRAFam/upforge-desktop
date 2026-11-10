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
vi.mock('electron-log', () => ({ default: { warn: vi.fn(), info: vi.fn() } }))

import { runRecordingStorageMaintenance, getStorageBreakdown, untrackedStatePath, purgeUntrackedRecordingFiles, prunePendingRecordingsByAge } from './storage-cleanup'
import { markOwnedRecordingFile } from './owned-recording-files'
import { RecordingsStore } from './recordings-store'
import { UNTRACKED_GRACE_MS, untrackedNotificationBody } from './untracked-recording-grace'

const DAY = 24 * 60 * 60 * 1000
const MB = 1024 * 1024
let saveDir = ''

beforeEach(() => {
  runtime.root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-untracked-'))
  saveDir = path.join(runtime.root, 'save')
  fs.mkdirSync(saveDir, { recursive: true })
})
afterEach(() => { fs.rmSync(runtime.root, { recursive: true, force: true }) })

/** Sparse .mp4 of `sizeMb` last modified `ageDays` before `now`. */
function videoFile(name: string, sizeMb: number, ageDays: number, now: number): string {
  const file = path.join(saveDir, name)
  fs.writeFileSync(file, '')
  fs.truncateSync(file, sizeMb * MB)
  const t = new Date(now - ageDays * DAY)
  fs.utimesSync(file, t, t)
  return file
}

/** An uncatalogued file UpForge's own match capture wrote. */
function untracked(name: string, sizeMb: number, ageDays: number, now: number): string {
  const file = videoFile(name, sizeMb, ageDays, now)
  markOwnedRecordingFile(file)
  return file
}

function maintain(now: number, retentionDays = 14, untrackedCapBytes?: number) {
  return runRecordingStorageMaintenance({
    store: new RecordingsStore(),
    savePath: saveDir,
    recordingRetentionDays: retentionDays,
    linkedRiot: null,
    now,
    untrackedCapBytes,
  })
}

describe('untracked recording files are never deleted silently', () => {
  it('warns first (count + size) and keeps the file', () => {
    const now = Date.UTC(2026, 10, 8)
    const file = untracked('old.mp4', 2, 30, now)

    const result = maintain(now)

    expect(fs.existsSync(file)).toBe(true)
    expect(result.orphansRemoved).toBe(0)
    expect(result.untrackedWarnings).toHaveLength(1)
    expect(result.untrackedWarnings[0]).toMatchObject({ path: file, size: 2 * MB, stage: 'first', reason: 'age', deleteAt: now + UNTRACKED_GRACE_MS })
    expect(untrackedNotificationBody(result.untrackedWarnings, now)).toMatch(/^1 untracked recording file \(2 MB\) will be deleted in 7 days/)
  })

  it('deletes only after the grace period, persisted across runs (restarts)', () => {
    const now = Date.UTC(2026, 10, 8)
    const file = untracked('old.mp4', 2, 30, now)
    maintain(now)

    const sixDays = maintain(now + 6 * DAY + DAY / 2)
    expect(fs.existsSync(file)).toBe(true)
    expect(sixDays.untrackedWarnings.map(w => w.stage)).toEqual(['final'])

    const later = maintain(now + UNTRACKED_GRACE_MS)
    expect(fs.existsSync(file)).toBe(false)
    expect(later.orphansRemoved).toBe(1)
    expect(later.untrackedWarnings).toEqual([])
  })

  it('a recent untracked file is left alone (no warning)', () => {
    const now = Date.UTC(2026, 10, 8)
    const file = untracked('fresh.mp4', 2, 1, now)
    const result = maintain(now)
    expect(result.untrackedWarnings).toEqual([])
    expect(fs.existsSync(file)).toBe(true)
  })

  it('"Never" auto-delete keeps every untracked file, whatever its age', () => {
    const now = Date.UTC(2026, 10, 8)
    const file = untracked('old.mp4', 2, 300, now)
    expect(maintain(now, 0).untrackedWarnings).toEqual([])
    maintain(now + 30 * DAY, 0)
    expect(fs.existsSync(file)).toBe(true)
  })

  it('size cap: oldest files over the cap are warned and removed after the grace period, newest kept', () => {
    const now = Date.UTC(2026, 10, 8)
    const oldest = untracked('a.mp4', 4, 3, now)
    const middle = untracked('b.mp4', 4, 2, now)
    const newest = untracked('c.mp4', 4, 1, now)

    const first = maintain(now, 14, 5 * MB)
    expect(first.untrackedWarnings.map(w => [path.basename(w.path), w.reason])).toEqual([['a.mp4', 'size_cap'], ['b.mp4', 'size_cap']])
    expect([oldest, middle, newest].every(f => fs.existsSync(f))).toBe(true)

    maintain(now + UNTRACKED_GRACE_MS, 14, 5 * MB)
    expect(fs.existsSync(oldest)).toBe(false)
    expect(fs.existsSync(middle)).toBe(false)
    expect(fs.existsSync(newest)).toBe(true)
  })

  it('a file that stops being due (retention raised) restarts its warning later', () => {
    const now = Date.UTC(2026, 10, 8)
    const file = untracked('old.mp4', 2, 20, now)
    maintain(now, 14)
    maintain(now + DAY, 60) // no longer due → warning forgotten
    const back = maintain(now + UNTRACKED_GRACE_MS, 14)
    expect(fs.existsSync(file)).toBe(true)
    expect(back.untrackedWarnings.map(w => w.stage)).toEqual(['first'])
  })

  it('Settings breakdown shows the countdown for warned files', () => {
    const now = Date.UTC(2026, 10, 8)
    untracked('old.mp4', 2, 30, now)
    untracked('fresh.mp4', 2, 1, now)
    maintain(now)
    const breakdown = getStorageBreakdown(new RecordingsStore(), null, saveDir)
    expect(breakdown.orphanCount).toBe(2)
    expect(breakdown.orphanScheduledCount).toBe(1)
    expect(breakdown.orphanScheduledBytes).toBe(2 * MB)
    expect(breakdown.orphanDeleteAt).toBe(now + UNTRACKED_GRACE_MS)
  })

  it('catalogued recordings are never treated as untracked', () => {
    const now = Date.UTC(2026, 10, 8)
    const file = untracked('match.mp4', 2, 30, now)
    new RecordingsStore().add({
      path: file, riotName: 'P', riotTag: 'EU', game: 'valorant', map: 'Ascent', agent: 'Sage',
      gameMode: 'competitive', savedOffline: true,
    } as Parameters<RecordingsStore['add']>[0])
    const result = maintain(now)
    expect(result.untrackedWarnings).toEqual([])
    expect(fs.existsSync(file)).toBe(true)
  })

  it('a lost or corrupt warning record means warn again and wait again — never an early delete', () => {
    const now = Date.UTC(2026, 10, 8)
    const file = untracked('old.mp4', 2, 30, now)
    maintain(now)
    fs.writeFileSync(untrackedStatePath(), '{not json')
    const result = maintain(now + UNTRACKED_GRACE_MS)
    expect(fs.existsSync(file)).toBe(true)
    expect(result.untrackedWarnings.map(w => w.stage)).toEqual(['first'])
  })
})

describe('files UpForge did not record are never deleted', () => {
  it('automatic cleanup never warns about or deletes the user\'s own OBS videos in the shared folder', () => {
    const now = Date.UTC(2026, 10, 8)
    const own = videoFile('2026-01-01 20-00-00.mp4', 4, 300, now)
    const ours = untracked('match.mp4', 4, 300, now)

    const first = maintain(now, 14, 1 * MB)
    expect(first.untrackedWarnings.map(w => w.path)).toEqual([ours])
    maintain(now + UNTRACKED_GRACE_MS, 14, 1 * MB)
    maintain(now + 10 * UNTRACKED_GRACE_MS, 14, 1 * MB)

    expect(fs.existsSync(own)).toBe(true)
    expect(fs.existsSync(ours)).toBe(false)
    expect(getStorageBreakdown(new RecordingsStore(), null, saveDir).orphanCount).toBe(0)
  })

  it('"Remove untracked files" only removes files UpForge recorded', () => {
    const now = Date.UTC(2026, 10, 8)
    const own = videoFile('user-clip.mp4', 2, 1, now)
    const ours = untracked('match.mp4', 2, 1, now)
    expect(purgeUntrackedRecordingFiles(new RecordingsStore(), saveDir).removed).toBe(1)
    expect(fs.existsSync(own)).toBe(true)
    expect(fs.existsSync(ours)).toBe(false)
  })

  it('an UpForge compressed export counts as owned through its source recording', () => {
    const now = Date.UTC(2026, 10, 8)
    markOwnedRecordingFile(path.join(saveDir, 'match.mkv'))
    const exported = videoFile('match_upforge.mp4', 2, 1, now)
    expect(purgeUntrackedRecordingFiles(new RecordingsStore(), saveDir).removed).toBe(1)
    expect(fs.existsSync(exported)).toBe(false)
  })

  it('a user video imported into the library as an orphan never expires', () => {
    const now = Date.UTC(2026, 10, 8)
    const own = videoFile('user.mp4', 2, 60, now)
    const store = new RecordingsStore()
    store.add({
      path: own, riotName: '', riotTag: '', game: 'unknown', map: null, agent: null,
      gameMode: 'UNKNOWN', orphanedImport: true,
    } as Parameters<RecordingsStore['add']>[0], now - 60 * DAY)
    for (let i = 0; i < 5; i++) prunePendingRecordingsByAge(store, 1, null, now + i * UNTRACKED_GRACE_MS)
    expect(fs.existsSync(own)).toBe(true)
  })
})
