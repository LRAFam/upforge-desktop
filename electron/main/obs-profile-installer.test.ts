import fs from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureObsProfileInstalled } from './obs-profile-installer'

const paths = vi.hoisted(() => ({ app: '', home: '' }))
vi.mock('electron', () => ({ app: {
  isPackaged: false,
  getAppPath: () => paths.app,
  getPath: () => paths.home,
} }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }))

let root: string
let obsRoot: string
let profileSource: string

beforeEach(() => {
  root = fs.mkdtempSync(join(tmpdir(), 'upforge-obs-profile-'))
  paths.app = join(root, 'app')
  paths.home = root
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  vi.stubEnv('APPDATA', join(root, 'config'))
  obsRoot = join(root, 'config', 'obs-studio')
  profileSource = join(paths.app, 'resources', 'obs', 'upforge-profile', 'basic.ini')
  fs.mkdirSync(join(paths.app, 'resources', 'obs', 'upforge-profile'), { recursive: true })
  fs.writeFileSync(profileSource, '[General]\nName=UpForge\n[Output]\nMode=Simple\n[SimpleOutput]\nRecFormat=mkv\n')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  fs.rmSync(root, { recursive: true, force: true })
})

describe('fresh OBS configuration', () => {
  it('initializes fresh OBS with its bundled recording profile selected and setup completed', () => {
    expect(ensureObsProfileInstalled()).toMatchObject({ ok: true, installed: true })
    expect(fs.existsSync(join(obsRoot, 'basic', 'profiles', 'UpForge', 'basic.ini'))).toBe(true)
    for (const name of ['global.ini', 'user.ini']) {
      expect(fs.existsSync(join(obsRoot, name))).toBe(true)
      expect(fs.readFileSync(join(obsRoot, name), 'utf8')).toBe('[General]\nFirstRun=true\n[Basic]\nProfile=UpForge\nProfileDir=UpForge\n')
    }
    expect(ensureObsProfileInstalled()).toMatchObject({ ok: true, installed: false })
  })

  it.each(['global.ini', 'user.ini', 'global.ini.bak', 'user.ini.bak', 'global.ini.tmp', 'user.ini.tmp'])('preserves an existing %s and leaves OBS migration in control', name => {
    fs.mkdirSync(obsRoot, { recursive: true })
    const existing = '[General]\nFirstRun=false\n[BasicWindow]\nCustomSetting=keep\n'
    fs.writeFileSync(join(obsRoot, name), existing)
    expect(ensureObsProfileInstalled().ok).toBe(true)
    expect(fs.readFileSync(join(obsRoot, name), 'utf8')).toBe(existing)
    for (const config of ['global.ini', 'user.ini']) {
      expect(fs.existsSync(join(obsRoot, config))).toBe(config === name)
    }
  })

  it('does not mark setup complete when the bundled profile is missing', () => {
    fs.unlinkSync(profileSource)
    expect(ensureObsProfileInstalled().ok).toBe(false)
    expect(fs.existsSync(join(obsRoot, 'global.ini'))).toBe(false)
    expect(fs.existsSync(join(obsRoot, 'user.ini'))).toBe(false)
  })
})
