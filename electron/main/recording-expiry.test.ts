import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const runtime = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { getPath: () => runtime.root } }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
vi.mock('electron-log', () => ({ default: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('./vod-compressor', () => ({
  recordingPathVariants: (value: string) => [value],
  sourcePathForCompressed: () => null,
  deleteLocalRecordingFiles: (p: string) => { const size = fs.statSync(p).size; fs.rmSync(p); return size },
}))

import { prunePendingRecordingsByAge } from './storage-cleanup'
import { RecordingsStore, type NewRecording } from './recordings-store'
import { expiryNotificationBody, localExpiryDeleteAt, planRecordingExpiry } from './recording-expiry'
import { localExpiryLine } from '../../src/components/v3/matches/match-row'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 10, 8, 12)

beforeEach(() => { runtime.root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-expiry-')) })
afterEach(() => { fs.rmSync(runtime.root, { recursive: true, force: true }) })

let n = 0
function rec(overrides: Partial<NewRecording> = {}): NewRecording {
  const file = path.join(runtime.root, `match-${n++}.mp4`)
  fs.writeFileSync(file, 'video')
  return {
    path: file, riotName: 'Player', riotTag: 'EU', game: 'valorant', map: 'Ascent', agent: 'Sage',
    gameMode: 'competitive',
    timeline: { matchId: 'm1', playerKills: [{ videoOffsetMs: 1000, round: 1 }] } as NewRecording['timeline'],
    ...overrides,
  }
}

describe('prunePendingRecordingsByAge — nothing deleted silently', () => {
  it('warns about a 13-day-old local recording (14-day retention) and keeps it', () => {
    const store = new RecordingsStore()
    const match = store.add(rec(), NOW - 13 * DAY)
    const result = prunePendingRecordingsByAge(store, 14, null, NOW)
    expect(result.removed).toBe(0)
    expect(result.warnings).toEqual([{ id: match.id, stage: 'first', deleteAt: NOW + DAY }])
    expect(fs.existsSync(match.path)).toBe(true)
    expect(store.getById(match.id)?.expiryWarnedAt).toBe(NOW)
  })

  it('never deletes an expired recording that was not warned — warns first, deletes only after notice', () => {
    const store = new RecordingsStore()
    const match = store.add(rec(), NOW - 30 * DAY)
    const first = prunePendingRecordingsByAge(store, 14, null, NOW)
    expect(first.removed).toBe(0)
    expect(first.warnings[0]?.stage).toBe('first')
    expect(fs.existsSync(match.path)).toBe(true)

    // Later the same day: still within the notice period.
    const again = prunePendingRecordingsByAge(store, 14, null, NOW + 2 * 60 * 60 * 1000)
    expect(again.removed).toBe(0)
    expect(fs.existsSync(match.path)).toBe(true)

    const later = prunePendingRecordingsByAge(store, 14, null, NOW + DAY + 1)
    expect(later.removed).toBe(1)
    expect(fs.existsSync(match.path)).toBe(false)
    expect(store.getById(match.id)).toBeUndefined()
  })

  it('sends a final warning about a day before deletion', () => {
    const store = new RecordingsStore()
    const match = store.add(rec(), NOW - 11 * DAY)
    expect(prunePendingRecordingsByAge(store, 14, null, NOW).warnings[0]?.stage).toBe('first')
    expect(prunePendingRecordingsByAge(store, 14, null, NOW + DAY).warnings).toEqual([])
    const final = prunePendingRecordingsByAge(store, 14, null, NOW + 2 * DAY + 1)
    expect(final.warnings).toEqual([{ id: match.id, stage: 'final', deleteAt: NOW + 3 * DAY }])
    expect(final.removed).toBe(0)
    expect(prunePendingRecordingsByAge(store, 14, null, NOW + 3 * DAY).removed).toBe(1)
  })

  it('never deletes a CS2 / Deadlock recording still waiting for its demo', () => {
    const store = new RecordingsStore()
    const cs2 = store.add(rec({ game: 'cs2', timeline: null }), NOW - 60 * DAY)
    const deadlock = store.add(rec({ game: 'deadlock', timeline: null }), NOW - 60 * DAY)
    for (const t of [NOW, NOW + 5 * DAY, NOW + 30 * DAY]) {
      const result = prunePendingRecordingsByAge(store, 14, null, t)
      expect(result.removed).toBe(0)
      expect(result.warnings).toEqual([])
    }
    expect(fs.existsSync(cs2.path)).toBe(true)
    expect(fs.existsSync(deadlock.path)).toBe(true)
  })

  it('never deletes a recording whose upload / analysis failed, even if it was warned before', () => {
    const store = new RecordingsStore()
    const failed = store.add(rec(), NOW - 60 * DAY)
    store.markExpiryWarned(failed.id, 'first', NOW - 2 * DAY)
    store.setAnalysisFailure(failed.id, 'Upload failed: network error')
    const result = prunePendingRecordingsByAge(store, 14, null, NOW + 30 * DAY)
    expect(result.removed).toBe(0)
    expect(result.warnings).toEqual([])
    expect(fs.existsSync(failed.path)).toBe(true)
  })

  it('keeps everything when auto-delete is off', () => {
    const store = new RecordingsStore()
    const match = store.add(rec(), NOW - 365 * DAY)
    expect(prunePendingRecordingsByAge(store, 0, null, NOW)).toEqual({ removed: 0, freedBytes: 0, warnings: [] })
    expect(fs.existsSync(match.path)).toBe(true)
  })
})

describe('planRecordingExpiry', () => {
  const base = { game: 'valorant', timeline: { matchId: 'm', playerKills: [{ videoOffsetMs: 1, round: 1 }] } as NewRecording['timeline'] }

  it('does nothing while a recording is far from expiry', () => {
    expect(planRecordingExpiry({ ...base, recordedAt: NOW - 2 * DAY }, 14, NOW).action).toBe('none')
    expect(localExpiryDeleteAt({ ...base, recordedAt: NOW - 2 * DAY }, 14, NOW)).toBeNull()
  })

  it('ignores a warning from an earlier, shorter retention window', () => {
    // Warned under 7-day retention, then retention raised to 30 days.
    const plan = planRecordingExpiry({ ...base, recordedAt: NOW - 8 * DAY, expiryWarnedAt: NOW - 4 * DAY }, 30, NOW)
    expect(plan.action).toBe('none')
  })

  it('exposes the delete time for the row UI once inside the warning window', () => {
    expect(localExpiryDeleteAt({ ...base, recordedAt: NOW - 12 * DAY }, 14, NOW)).toBe(NOW + 2 * DAY)
    expect(localExpiryDeleteAt({ ...base, game: 'cs2', timeline: null, recordedAt: NOW - 20 * DAY }, 14, NOW)).toBeNull()
  })
})

describe('expiry copy', () => {
  it('row line and notification say when', () => {
    expect(localExpiryLine(NOW + 3 * DAY, NOW)).toBe('Deletes from this PC in 3 days')
    expect(localExpiryLine(NOW + 5 * 60 * 60 * 1000, NOW)).toBe('Deletes from this PC within a day')
    expect(localExpiryLine(null, NOW)).toBeNull()
    expect(expiryNotificationBody(2, NOW + 3 * DAY, NOW)).toContain('2 local recordings will be deleted in 3 days')
  })
})
