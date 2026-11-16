import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import {
  WINGET_TIMEOUT_MS,
  obsInstallDirsFromRegistry,
  parseRegValue,
  parseRunningObsPaths,
  steamObsExePaths,
} from './obs-installer'

describe('OBS install discovery', () => {
  it('reads a custom install folder from the OBS registry key (any locale)', () => {
    const en = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\OBS Studio\r\n    (Default)    REG_SZ    D:\\Apps\\OBS\r\n'
    const de = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\OBS Studio\r\n    (Standard)    REG_SZ    E:\\Tools\\obs-studio\r\n'
    expect(parseRegValue(en, null)).toBe('D:\\Apps\\OBS')
    expect(obsInstallDirsFromRegistry([
      { key: 'HKLM\\SOFTWARE\\OBS Studio', stdout: en },
      { key: 'HKCU\\SOFTWARE\\OBS Studio', stdout: de },
    ])).toEqual(['D:\\Apps\\OBS', 'E:\\Tools\\obs-studio'])
  })

  it('reads the install folder from the uninstall entry', () => {
    const out = [
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OBS Studio',
      '    DisplayIcon    REG_SZ    D:\\Apps\\OBS\\bin\\64bit\\obs64.exe',
      '    UninstallString    REG_SZ    "D:\\Apps\\OBS\\uninstall.exe"',
      '',
    ].join('\r\n')
    expect(obsInstallDirsFromRegistry([
      { key: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OBS Studio', stdout: out },
    ])).toEqual(['D:\\Apps\\OBS'])
  })

  it('looks for OBS Studio in every Steam library', () => {
    const vdf = '"libraryfolders"\n{\n "0" { "path" "C:\\\\Program Files (x86)\\\\Steam" }\n "1" { "path" "E:\\\\SteamLibrary" }\n}'
    expect(steamObsExePaths('C:\\Program Files (x86)\\Steam', vdf)).toContain(
      'E:\\SteamLibrary\\steamapps\\common\\OBS Studio\\bin\\64bit\\obs64.exe',
    )
  })

  it('takes the path of a running OBS', () => {
    expect(parseRunningObsPaths('F:\\OBS\\bin\\64bit\\obs64.exe\r\n\r\n')).toEqual(['F:\\OBS\\bin\\64bit\\obs64.exe'])
  })

  it('gives winget longer than 3 minutes', () => {
    expect(WINGET_TIMEOUT_MS).toBeGreaterThan(180_000)
  })
})

describe('onboarding OBS error', () => {
  it('shows the official download button next to the error, not inside the collapsed block', () => {
    const vue = readFileSync(join(__dirname, '../../src/views/OnboardingView.vue'), 'utf8').replace(/\r\n/g, '\n')
    const errorRow = vue.slice(vue.indexOf('<div v-if="obsError" class="ob3-inline">'))
    expect(errorRow.slice(0, errorRow.indexOf('</div>'))).toContain('openObsDownload')
    const details = vue.slice(vue.indexOf('<summary class="uf-t4">Already use OBS?</summary>'))
    expect(details.slice(0, details.indexOf('</details>'))).not.toContain('openObsDownload')
  })
})
