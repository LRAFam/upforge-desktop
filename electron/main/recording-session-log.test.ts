import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  RecordingSessionLog,
  UNKNOWN_RECORDING_GAME,
  canScanForOrphanRecordings,
  resolveOrphanRecordingGame,
  type RecordingSessionEntry,
} from './recording-session-log'

describe('resolveOrphanRecordingGame', () => {
  const sessions: RecordingSessionEntry[] = [
    { game: 'valorant', startedAt: 1_000_000, endedAt: 2_000_000, outputPath: 'C:\\rec\\2026-11-07 20-00-00.mp4' },
    { game: 'lol', startedAt: 3_000_000, endedAt: null, outputPath: null },
  ]

  it('labels a stranded file by the recording session that owned it, not the primary game', () => {
    expect(resolveOrphanRecordingGame({ path: 'C:\\rec\\2026-11-07 21-00-00.mp4', modifiedAtMs: 15_000_000 }, sessions)).toBe('lol')
  })

  it('matches an exact stopped output path (compressed sibling too)', () => {
    expect(resolveOrphanRecordingGame({ path: 'C:\\rec\\2026-11-07 20-00-00_upforge.mp4', modifiedAtMs: 99_000_000 }, sessions)).toBe('valorant')
  })

  it('marks the game unknown when no session covers the file — never the selected game tab', () => {
    // 3.4.x labelled these with settings.primaryGame: a CS2 file imported while the Valorant tab
    // was selected became a Valorant match.
    expect(resolveOrphanRecordingGame({ path: 'C:\\rec\\old.mp4', modifiedAtMs: 500 }, sessions)).toBe(UNKNOWN_RECORDING_GAME)
    expect(resolveOrphanRecordingGame({ path: 'C:\\rec\\x.mp4', modifiedAtMs: null }, [])).toBe('unknown')
  })

  it('labels a CS2 file by its CS2 session even when a Valorant session started later', () => {
    const log: RecordingSessionEntry[] = [
      { game: 'cs2', startedAt: 1_000_000, endedAt: 3_000_000, outputPath: null },
      { game: 'valorant', startedAt: 4_000_000, endedAt: null, outputPath: null },
    ]
    expect(resolveOrphanRecordingGame({ path: 'C:\\rec\\cs2.mp4', modifiedAtMs: 3_000_500 }, log)).toBe('cs2')
  })
})

describe('canScanForOrphanRecordings', () => {
  it('never imports while OBS still records', () => {
    expect(canScanForOrphanRecordings({ recording: true, matchEndInFlight: false })).toBe(false)
  })

  it('waits while a match end is saving its own file (the import raced the save and won the tab label)', () => {
    expect(canScanForOrphanRecordings({ recording: false, matchEndInFlight: true })).toBe(false)
  })

  it('lets the match-end flow itself import when it could not find its file', () => {
    expect(canScanForOrphanRecordings({ recording: false, matchEndInFlight: true, fromMatchEnd: true })).toBe(true)
  })

  it('scans when idle', () => {
    expect(canScanForOrphanRecordings({ recording: false, matchEndInFlight: false })).toBe(true)
  })
})

describe('RecordingSessionLog', () => {
  let dir: string
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-session-log-')) })
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  it('persists the owning game across restarts and closes it on stop', () => {
    const file = path.join(dir, 'recording-sessions.json')
    const log = new RecordingSessionLog(file)
    log.begin('lol', 1000)
    expect(new RecordingSessionLog(file).activeGame()).toBe('lol')
    log.end('C:\\rec\\a.mp4', 5000)
    const reloaded = new RecordingSessionLog(file)
    expect(reloaded.activeGame()).toBeNull()
    expect(reloaded.list()).toEqual([{ game: 'lol', startedAt: 1000, endedAt: 5000, outputPath: 'C:\\rec\\a.mp4' }])
  })

  it('survives a corrupt file', () => {
    const file = path.join(dir, 'recording-sessions.json')
    fs.writeFileSync(file, '{nope')
    const log = new RecordingSessionLog(file)
    expect(log.list()).toEqual([])
    log.begin('valorant', 1)
    expect(log.activeGame()).toBe('valorant')
  })
})
