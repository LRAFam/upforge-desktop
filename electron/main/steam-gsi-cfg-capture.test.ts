import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ csgoDir: '', full: false }))

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('./cs2-demo-finder', () => ({ getCandidateCS2CsgoDirs: vi.fn(async () => [h.csgoDir]) }))
vi.mock('./game-data-capture', () => ({
  getGameDataCapture: () => ({ wantsFullGsi: () => h.full, ingestGsi: vi.fn(), onDisarmed: vi.fn() }),
}))

import { FULL_GSI_COMPONENTS, gsiCfgContents, installSteamGsiConfig } from './steam-gsi-server'

const cfgFile = (): string => path.join(h.csgoDir, 'cfg', 'gamestate_integration_upforge.cfg')

beforeEach(() => {
  h.csgoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-gsi-cfg-'))
  h.full = false
})
afterEach(() => fs.rmSync(h.csgoDir, { recursive: true, force: true }))

describe('CS2 GSI cfg for diagnostics capture', () => {
  it('full cfg requests every component with a low throttle; normal cfg does not', () => {
    const full = gsiCfgContents(true)
    for (const c of FULL_GSI_COMPONENTS) expect(full).toContain(`"${c}" "1"`)
    expect(FULL_GSI_COMPONENTS).toHaveLength(17)
    expect(full).toContain('"throttle" "0.1"')
    const normal = gsiCfgContents(false)
    expect(normal).not.toContain('allplayers')
    expect(normal).toContain('"throttle" "0.5"')
  })

  it('writes the full cfg only while capture is armed, then restores the normal cfg', async () => {
    await installSteamGsiConfig('cs2')
    const normal = fs.readFileSync(cfgFile(), 'utf-8')
    expect(normal).toBe(gsiCfgContents(false))

    h.full = true
    const armed = await installSteamGsiConfig('cs2')
    expect(armed.needsRestart).toBe(true)
    expect(fs.readFileSync(cfgFile(), 'utf-8')).toBe(gsiCfgContents(true))

    h.full = false
    const restored = await installSteamGsiConfig('cs2')
    expect(restored.needsRestart).toBe(true)
    expect(fs.readFileSync(cfgFile(), 'utf-8')).toBe(normal)
  })
})
