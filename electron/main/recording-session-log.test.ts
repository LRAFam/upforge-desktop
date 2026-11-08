import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RecordingSessionLog, resolveOrphanRecordingGame, type RecordingSessionEntry } from './recording-session-log'

describe('resolveOrphanRecordingGame', () => {
  const sessions: RecordingSessionEntry[] = [
    { game: 'valorant', startedAt: 1_000_000, endedAt: 2_000_000, outputPath: 'C:\\rec\\2026-11-07 20-00-00.mp4' },
    { game: 'lol', startedAt: 3_000_000, endedAt: null, outputPath: null },
  ]

  it('labels a stranded file by the recording session that owned it, not the primary game', () => {
    expect(resolveOrphanRecordingGame({ path: 'C:\\rec\\2026-11-07 21-00-00.mp4', modifiedAtMs: 15_000_000 }, sessions, 'valorant')).toBe('lol')
  })

  it('matches an exact stopped output path (compressed sibling too)', () => {
    expect(resolveOrphanRecordingGame({ path: 'C:\\rec\\2026-11-07 20-00-00_upforge.mp4', modifiedAtMs: 99_000_000 }, sessions, 'cs2')).toBe('valorant')
  })

  it('falls back to the primary game when no session covers the file', () => {
    expect(resolveOrphanRecordingGame({ path: 'C:\\rec\\old.mp4', modifiedAtMs: 500 }, sessions, 'deadlock')).toBe('deadlock')
    expect(resolveOrphanRecordingGame({ path: 'C:\\rec\\x.mp4', modifiedAtMs: null }, [], 'cs2')).toBe('cs2')
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
