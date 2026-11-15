import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock('./cs2-demo-finder', () => ({ getCandidateCS2CsgoDirs: vi.fn(async () => []) }))

import { removeLegacyDemoCfgFromDir } from './cs2-steam-setup'

let cfgDir: string

beforeEach(() => {
  cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-cs2-cfg-'))
})

afterEach(() => {
  fs.rmSync(cfgDir, { recursive: true, force: true })
})

describe('removeLegacyDemoCfgFromDir', () => {
  it('removes only our exec line and keeps the player\'s own autoexec lines', () => {
    const autoexec = path.join(cfgDir, 'autoexec.cfg')
    fs.writeFileSync(autoexec, 'fps_max 400\nexec upforge_demo\nbind f5 "say gg"\n')
    fs.writeFileSync(path.join(cfgDir, 'upforge_demo.cfg'), 'cl_demo_auto_recording 1\n')

    expect(removeLegacyDemoCfgFromDir(cfgDir)).toBe(true)
    expect(fs.readFileSync(autoexec, 'utf-8')).toBe('fps_max 400\nbind f5 "say gg"\n')
    expect(fs.existsSync(path.join(cfgDir, 'upforge_demo.cfg'))).toBe(false)
  })

  it('keeps CRLF line endings', () => {
    const autoexec = path.join(cfgDir, 'autoexec.cfg')
    fs.writeFileSync(autoexec, 'fps_max 400\r\nexec upforge_demo\r\n')
    removeLegacyDemoCfgFromDir(cfgDir)
    expect(fs.readFileSync(autoexec, 'utf-8')).toBe('fps_max 400\r\n')
  })

  it('leaves an edited upforge_demo.cfg in place', () => {
    const demoCfg = path.join(cfgDir, 'upforge_demo.cfg')
    fs.writeFileSync(demoCfg, 'cl_demo_auto_recording 1\nsensitivity 1.2\n')
    expect(removeLegacyDemoCfgFromDir(cfgDir)).toBe(false)
    expect(fs.existsSync(demoCfg)).toBe(true)
  })

  it('does not touch an autoexec that never had our line', () => {
    const autoexec = path.join(cfgDir, 'autoexec.cfg')
    fs.writeFileSync(autoexec, 'fps_max 400')
    expect(removeLegacyDemoCfgFromDir(cfgDir)).toBe(false)
    expect(fs.readFileSync(autoexec, 'utf-8')).toBe('fps_max 400')
  })

  it('is a no-op on an empty or missing cfg folder', () => {
    expect(removeLegacyDemoCfgFromDir(cfgDir)).toBe(false)
    expect(removeLegacyDemoCfgFromDir(path.join(cfgDir, 'missing'))).toBe(false)
  })
})
