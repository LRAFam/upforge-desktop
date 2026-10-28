import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const runtime = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { getPath: () => path.join(runtime.root, 'app-data') } }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('./clip-extractor', () => ({ setClipsMediaDir: vi.fn() }))
vi.mock('./upload-manager', () => ({ setPendingJobUserScope: vi.fn() }))
vi.mock('./legacy-migration', () => ({ normalizeLegacySavePath: () => null, scheduleLegacyUserDataMigration: vi.fn() }))

import { resolveRecordingSavePath, userRecordingsDir } from './user-data-paths'
import { SettingsManager } from './settings-manager'
import { buildRecorderConfig } from './obs-output-settings'
import { RecordingsStore, type NewRecording } from './recordings-store'
import { ClipStore } from './clip-store'
import { activateUserSession, clearUserSession, getActiveUserId, type UserSessionDeps } from './user-session'
import { getFullStorageUsage } from './storage-cleanup'
import { scheduleLegacyUserDataMigration } from './legacy-migration'

let deps: UserSessionDeps
let root: string
beforeEach(() => {
  runtime.root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-profile-storage-'))
  vi.mocked(scheduleLegacyUserDataMigration).mockClear()
  root = path.join(runtime.root, 'Custom Media')
  fs.mkdirSync(root)
  const settingsManager = new SettingsManager()
  settingsManager.save({ savePath: root })
  deps = { settingsManager, recordingsStore: new RecordingsStore(), clipStore: new ClipStore(), getMainWindow: () => null }
})
afterEach(() => {
  clearUserSession(deps)
  vi.restoreAllMocks()
  fs.rmSync(runtime.root, { recursive: true, force: true })
})

function saveRecording(userId: number, filePath: string, contents = 'saved game') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
  return deps.recordingsStore.forUser(userId).add({
    path: filePath, game: 'lol', riotName: 'LeaguePlayer', riotTag: 'EUW',
    map: "Summoner's Rift", agent: 'Wukong', gameMode: 'RANKED_SOLO', timeline: null,
  } satisfies NewRecording)
}

describe('profile storage on a custom drive', () => {
  it('keeps the chosen root and sends each capture owner to their own folder', () => {
    const settings = deps.settingsManager.get()
    expect(buildRecorderConfig(settings, true, 3).savePath).toBe(path.join(root, 'users', '3', 'recordings'))
    expect(buildRecorderConfig(settings, true, 7).savePath).toBe(path.join(root, 'users', '7', 'recordings'))
    expect(buildRecorderConfig(settings, true, null).savePath).toBe(path.join(root, 'pending-local', 'recordings'))
    expect(deps.settingsManager.get().savePath).toBe(root)
    expect(new SettingsManager().get().savePath).toBe(root)
  })

  it('keeps the existing default layout when the stored default belongs to another profile', () => {
    expect(resolveRecordingSavePath(undefined, 3)).toBe(userRecordingsDir(3))
    expect(resolveRecordingSavePath(userRecordingsDir(7), 3)).toBe(userRecordingsDir(3))
    expect(resolveRecordingSavePath(userRecordingsDir(7), null)).toBe(path.join(runtime.root, 'app-data', 'pending-local', 'recordings'))
  })

  it('switches recording destinations on login and logout without changing the selected drive', () => {
    const destinations: string[] = []
    deps.onScopeChanged = () => destinations.push(buildRecorderConfig(deps.settingsManager.get(), true, getActiveUserId()).savePath)
    activateUserSession(3, deps)
    activateUserSession(7, deps)
    expect(fs.statSync(path.join(root, 'users', '3', 'recordings')).isDirectory()).toBe(true)
    expect(fs.statSync(path.join(root, 'users', '7', 'recordings')).isDirectory()).toBe(true)
    clearUserSession(deps)
    expect(destinations).toEqual([
      path.join(root, 'users', '3', 'recordings'),
      path.join(root, 'users', '7', 'recordings'),
      path.join(root, 'pending-local', 'recordings'),
    ])
    expect(deps.settingsManager.get().savePath).toBe(root)
  })

  it('reports an unavailable profile destination without preventing login or losing existing footage', () => {
    const old = saveRecording(3, path.join(root, 'old.mp4'))
    fs.writeFileSync(path.join(root, 'users'), 'folder creation blocked')
    const send = vi.fn()
    deps.getMainWindow = () => ({ webContents: { send } }) as never
    expect(() => activateUserSession(3, deps)).not.toThrow()
    expect(getActiveUserId()).toBe(3)
    expect(deps.recordingsStore.getAll()).toEqual([old])
    expect(send).toHaveBeenCalledWith('app:warning', { message: expect.stringContaining('recording folder') })
    expect(deps.settingsManager.get().savePath).toBe(root)
  })

  it('keeps old custom-folder footage and new profile footage accessible after restart', () => {
    const old = saveRecording(3, path.join(root, 'before-update.mp4'), 'original footage')
    const current = saveRecording(3, path.join(root, 'users', '3', 'recordings', 'after-update.mp4'))
    const other = saveRecording(7, path.join(root, 'users', '7', 'recordings', 'other.mp4'))
    deps.recordingsStore = new RecordingsStore()
    activateUserSession(3, deps)
    expect(deps.recordingsStore.getAll().map(row => row.id).sort()).toEqual([old.id, current.id].sort())
    expect(deps.recordingsStore.getById(old.id)?.path).toBe(old.path)
    expect(fs.readFileSync(old.path, 'utf8')).toBe('original footage')
    activateUserSession(7, deps)
    expect(deps.recordingsStore.getAll()).toEqual([other])
  })

  it('finds an existing catalogued file moved into its own new profile folder before loading the library', () => {
    const old = saveRecording(3, path.join(root, 'moved.mp4'))
    const moved = path.join(root, 'users', '3', 'recordings', 'moved.mp4')
    fs.mkdirSync(path.dirname(moved), { recursive: true })
    fs.renameSync(old.path, moved)
    saveRecording(7, path.join(root, 'users', '7', 'recordings', 'moved.mp4'), 'other profile')
    deps.recordingsStore = new RecordingsStore()
    activateUserSession(3, deps)
    expect(deps.recordingsStore.getById(old.id)?.path).toBe(moved)
    expect(fs.readFileSync(moved, 'utf8')).toBe('saved game')
  })

  it('keeps delayed path repairs with their original profile after an account switch', () => {
    const first = saveRecording(3, path.join(root, 'match.mp4'))
    activateUserSession(3, deps)
    const completedMigration = vi.mocked(scheduleLegacyUserDataMigration).mock.calls[0][1]!
    const moved = path.join(root, 'users', '3', 'recordings', 'match.mp4')
    fs.renameSync(first.path, moved)
    const second = saveRecording(7, path.join(root, 'users', '7', 'recordings', 'match.mp4'))
    activateUserSession(7, deps)
    fs.unlinkSync(second.path)
    completedMigration()
    expect(deps.recordingsStore.forUser(3).getById(first.id)?.path).toBe(moved)
    expect(deps.recordingsStore.getById(second.id)?.path).toBe(second.path)
  })

  it('counts existing footage at old locations without counting another profile or double-counting new footage', () => {
    const old = saveRecording(3, path.join(root, 'old.mp4'), 'old footage')
    const activeDirectory = path.join(root, 'users', '3', 'recordings')
    const current = saveRecording(3, path.join(activeDirectory, 'new.mp4'), 'new footage')
    // Large enough to be included in the directory scan as well as the catalogue.
    fs.truncateSync(current.path, 2 * 1024 * 1024)
    saveRecording(7, path.join(root, 'users', '7', 'recordings', 'other.mp4'), 'another profile')
    const usage = getFullStorageUsage(activeDirectory, 3, deps.recordingsStore.forUser(3))
    expect(usage.recordingsCount).toBe(2)
    expect(usage.recordingsBytes).toBe(fs.statSync(old.path).size + fs.statSync(current.path).size)
  })

  it('counts a catalogued legacy-default video once after choosing a custom drive', () => {
    const old = saveRecording(3, path.join(runtime.root, 'app-data', 'recordings', 'legacy.mp4'))
    fs.truncateSync(old.path, 2 * 1024 * 1024)
    const usage = getFullStorageUsage(resolveRecordingSavePath(root, 3), 3, deps.recordingsStore.forUser(3))
    expect(usage.recordingsCount).toBe(1)
    expect(usage.bytes).toBe(fs.statSync(old.path).size)
    expect(usage.legacyRecordingsBytes).toBe(0)
  })
})
