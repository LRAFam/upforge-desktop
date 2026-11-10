import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const runtime = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { getPath: () => runtime.root } }))

import { SettingsManager } from './settings-manager'

const settingsFile = () => path.join(runtime.root, 'settings.json')

beforeEach(() => {
  runtime.root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-settings-'))
})
afterEach(() => {
  fs.rmSync(runtime.root, { recursive: true, force: true })
})

describe('SettingsManager persistence', () => {
  it('writes settings.json via a temp file + rename (no partial file left behind)', () => {
    const renameSpy = vi.spyOn(fs, 'renameSync')
    new SettingsManager().save({ obsPort: 4466 })
    expect(renameSpy.mock.calls.some(([, to]) => to === settingsFile())).toBe(true)
    renameSpy.mockRestore()
    expect(JSON.parse(fs.readFileSync(settingsFile(), 'utf-8')).obsPort).toBe(4466)
    expect(fs.readdirSync(runtime.root).filter((f) => f.includes('.tmp'))).toEqual([])
  })

  it('keeps a copy of a corrupt settings.json instead of silently discarding it', () => {
    fs.writeFileSync(settingsFile(), '{"obsPort": 4466, "savePath": ')
    const manager = new SettingsManager()
    expect(manager.get().obsPort).toBe(4455)
    const backups = fs.readdirSync(runtime.root).filter((f) => f.startsWith('settings.corrupt-'))
    expect(backups).toHaveLength(1)
    expect(fs.readFileSync(path.join(runtime.root, backups[0]!), 'utf-8')).toBe('{"obsPort": 4466, "savePath": ')
  })

  it('restores the last good settings when settings.json is truncated', () => {
    const first = new SettingsManager()
    first.save({ obsPort: 4466 })
    first.save({ obsPort: 4477 })
    fs.writeFileSync(settingsFile(), '{"obsPort": 44')
    expect(new SettingsManager().get().obsPort).toBe(4477)
    expect(fs.readdirSync(runtime.root).some((f) => f.startsWith('settings.corrupt-'))).toBe(true)
  })
})
