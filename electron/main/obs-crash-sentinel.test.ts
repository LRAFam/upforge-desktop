import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { clearObsCrashSentinel, obsCrashSentinelPath } from './obs-crash-sentinel'

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-sentinel-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true })
  }
})

describe('obsCrashSentinelPath', () => {
  it('resolves under APPDATA on Windows', () => {
    expect(obsCrashSentinelPath({ APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, 'win32'))
      .toBe(path.join('C:\\Users\\a\\AppData\\Roaming', 'obs-studio', '.sentinel'))
  })

  it('resolves under Application Support on macOS', () => {
    expect(obsCrashSentinelPath({ HOME: '/Users/a' }, 'darwin'))
      .toBe('/Users/a/Library/Application Support/obs-studio/.sentinel')
  })

  it('returns null when the home directory is unknown', () => {
    expect(obsCrashSentinelPath({}, 'win32')).toBeNull()
    expect(obsCrashSentinelPath({}, 'darwin')).toBeNull()
  })
})

describe('clearObsCrashSentinel', () => {
  it('removes a sentinel file', () => {
    const sentinel = path.join(makeTempDir(), '.sentinel')
    fs.writeFileSync(sentinel, '')
    expect(clearObsCrashSentinel(sentinel)).toBe(true)
    expect(fs.existsSync(sentinel)).toBe(false)
  })

  it('removes a sentinel directory written by OBS 32.0.4+', () => {
    const sentinel = path.join(makeTempDir(), '.sentinel')
    fs.mkdirSync(sentinel)
    fs.writeFileSync(path.join(sentinel, 'lock'), '')
    expect(clearObsCrashSentinel(sentinel)).toBe(true)
    expect(fs.existsSync(sentinel)).toBe(false)
  })

  it('reports false when there is nothing to clear', () => {
    expect(clearObsCrashSentinel(path.join(makeTempDir(), '.sentinel'))).toBe(false)
    expect(clearObsCrashSentinel(null)).toBe(false)
  })
})
