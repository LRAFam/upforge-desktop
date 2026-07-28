import { describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { candidateRecordingDirs, healRecordingPath } from './heal-recording-paths'

describe('healRecordingPath', () => {
  it('returns the stored path when the file still exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-heal-'))
    const file = path.join(dir, 'match.mkv')
    fs.writeFileSync(file, 'x')
    expect(healRecordingPath(file, [])).toBe(file)
  })

  it('finds the file by basename in a migrated save folder', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-heal-'))
    const legacy = path.join(root, 'legacy')
    const migrated = path.join(root, 'users', '1', 'recordings')
    fs.mkdirSync(legacy, { recursive: true })
    fs.mkdirSync(migrated, { recursive: true })
    const moved = path.join(migrated, 'valorant-match.mkv')
    fs.writeFileSync(moved, 'vod')

    const stale = path.join(legacy, 'valorant-match.mkv')
    expect(healRecordingPath(stale, [migrated])).toBe(moved)
  })

  it('returns null when the basename cannot be found', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-heal-'))
    expect(healRecordingPath(path.join(root, 'gone.mkv'), [root])).toBeNull()
  })
})

describe('candidateRecordingDirs', () => {
  it('includes the current dirname and search dirs', () => {
    const dirs = candidateRecordingDirs('/a/b/c.mkv', ['/x/y', '', null])
    expect(dirs).toContain(path.normalize('/a/b'))
    expect(dirs).toContain(path.normalize('/x/y'))
  })
})
