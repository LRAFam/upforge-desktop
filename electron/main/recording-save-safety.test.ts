import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const runtime = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: {
  isPackaged: true,
  getPath: (key: string) => key === 'exe'
    ? path.join(runtime.root, 'UpForge', 'UpForge.exe')
    : path.join(runtime.root, 'profile'),
} }))

import { isInsideDirectory, recordingDirectoryProblem } from './recording-save-safety'
import { resolveRecordingSavePath, recordingSavePathProblem } from './user-data-paths'
import { SettingsManager } from './settings-manager'

beforeEach(() => {
  runtime.root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-save-safety-'))
  fs.mkdirSync(path.join(runtime.root, 'UpForge'))
})
afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(runtime.root, { recursive: true, force: true })
})

describe('recordings outside the installation directory', () => {
  it('recognises Windows roots, nested paths, casing and separators without rejecting siblings', () => {
    for (const candidate of ['D:\\UpForge', 'd:/upforge/recordings', 'D:\\UpForge\\data\\..\\recordings']) {
      expect(isInsideDirectory(candidate, 'D:\\UpForge', path.win32)).toBe(true)
    }
    for (const candidate of ['D:\\UpForge Recordings', 'D:\\UpForge-backup', 'E:\\UpForge\\recordings']) {
      expect(isInsideDirectory(candidate, 'D:\\UpForge', path.win32)).toBe(false)
    }
  })

  it('rejects saving an unsafe choice before changing the existing settings', () => {
    const settings = new SettingsManager()
    const safe = path.join(runtime.root, 'My Recordings')
    settings.save({ savePath: safe })
    expect(() => settings.save({ savePath: path.join(runtime.root, 'UpForge', 'recordings') })).toThrow('outside')
    expect(settings.get().savePath).toBe(safe)
    expect(new SettingsManager().get().savePath).toBe(safe)
  })

  it('redirects an existing unsafe configuration to the account default without moving or deleting old files', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unsafe = path.join(runtime.root, 'UpForge', 'recordings')
    fs.mkdirSync(unsafe)
    const video = path.join(unsafe, 'ranked.mp4')
    fs.writeFileSync(video, 'recorded game')
    expect(resolveRecordingSavePath(unsafe, 3)).toBe(path.join(runtime.root, 'profile', 'users', '3', 'recordings'))
    expect(resolveRecordingSavePath(unsafe, null)).toBe(path.join(runtime.root, 'profile', 'pending-local', 'recordings'))
    expect(fs.readFileSync(video, 'utf8')).toBe('recorded game')
    expect(console.warn).toHaveBeenCalled()
  })

  it('keeps a safe custom destination on the chosen drive', () => {
    const safe = path.join(runtime.root, 'UpForge Recordings')
    expect(recordingDirectoryProblem(safe)).toBeNull()
    expect(resolveRecordingSavePath(safe, 3)).toBe(path.join(safe, 'users', '3', 'recordings'))
  })

  it('rejects an alias into the installation folder, including a new child directory', () => {
    const alias = path.join(runtime.root, 'videos-alias')
    fs.symlinkSync(path.join(runtime.root, 'UpForge'), alias, 'junction')
    expect(recordingDirectoryProblem(path.join(alias, 'new-recordings'))).toContain('outside')
  })

  it('checks the profile destination too when its parent is a safe custom storage root', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const root = path.join(runtime.root, 'Media')
    fs.mkdirSync(path.join(root, 'users'), { recursive: true })
    fs.symlinkSync(path.join(runtime.root, 'UpForge'), path.join(root, 'users', '3'), 'junction')
    expect(recordingDirectoryProblem(root)).toBeNull()
    expect(recordingSavePathProblem(root, 3)).toContain('outside')
    expect(resolveRecordingSavePath(root, 3)).toBe(path.join(runtime.root, 'profile', 'users', '3', 'recordings'))
    expect(fs.existsSync(path.join(runtime.root, 'UpForge', 'recordings'))).toBe(false)
  })
})
