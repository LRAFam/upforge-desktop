import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => os.tmpdir() } }))
vi.mock('electron-log', () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))

import { swapMediaFileInPlace, trimmedOutputPath } from './vod-trimmer'

let dir = ''
let vod = ''
let trimmed = ''
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-vodswap-'))
  vod = path.join(dir, 'match.mp4')
  trimmed = trimmedOutputPath(vod)
  fs.writeFileSync(vod, 'full match')
  fs.writeFileSync(trimmed, 'trimmed')
})
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }) })

/** Throw EPERM for renames that match `pred`, pass everything else through. */
function failRenames(pred: (from: string, to: string) => boolean): void {
  const real = fs.renameSync.bind(fs)
  vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (pred(String(from), String(to))) throw Object.assign(new Error('EPERM: locked'), { code: 'EPERM' })
    return real(from, to)
  })
}

describe('full-match VOD trim replacement never deletes the original', () => {
  it('success replaces the original and removes only the backup', () => {
    swapMediaFileInPlace(vod, trimmed)
    expect(fs.readFileSync(vod, 'utf8')).toBe('trimmed')
    expect(fs.existsSync(`${vod}.bak`)).toBe(false)
  })

  it('first rename failing leaves the original untouched', () => {
    failRenames((from) => from === vod)
    expect(() => swapMediaFileInPlace(vod, trimmed)).toThrow('EPERM')
    expect(fs.readFileSync(vod, 'utf8')).toBe('full match')
  })

  it('output rename failing restores the original byte-for-byte and does not retry destructively', () => {
    failRenames((from, to) => from === trimmed && to === vod)
    expect(() => swapMediaFileInPlace(vod, trimmed)).toThrow('EPERM')
    expect(fs.readFileSync(vod, 'utf8')).toBe('full match')
    expect(fs.existsSync(`${vod}.bak`)).toBe(false)
  })

  it('output and restore both failing keeps the original at .bak and names it', () => {
    failRenames((from) => from === trimmed || from === `${vod}.bak`)
    expect(() => swapMediaFileInPlace(vod, trimmed)).toThrow(`${vod}.bak`)
    expect(fs.readFileSync(`${vod}.bak`, 'utf8')).toBe('full match')
  })

  it('temporary output never aliases the original path', () => {
    expect(trimmedOutputPath(path.join(dir, 'match.mkv'))).toBe(path.join(dir, 'match_trimmed.mp4'))
    const odd = path.join(dir, 'match.ts')
    expect(trimmedOutputPath(odd)).not.toBe(odd)
  })
})
