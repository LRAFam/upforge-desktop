import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'
const available = spawnSync(shell, ['-NoProfile', '-Command', 'exit 0'], { timeout: 10_000 }).status === 0
const script = fileURLToPath(new URL('./protect-install-media.ps1', import.meta.url))

// Runs against real PowerShell on Windows CI; not a mock of the deletion guard.
describe.skipIf(!available)('installer protects existing recordings before uninstall', () => {
  let root: string
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-installer-media-')) })
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })

  function check(directory: string) {
    return spawnSync(shell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-InstallDirectory', directory], {
      encoding: 'utf8', timeout: 20_000,
    })
  }

  it('allows a fresh install and an empty recordings folder', () => {
    expect(check(path.join(root, 'not-installed')).status).toBe(0)
    fs.mkdirSync(path.join(root, 'recordings'))
    fs.writeFileSync(path.join(root, 'UpForge.exe'), 'app')
    expect(check(root).status).toBe(0)
  }, 30_000)

  it.each(['.mp4', '.MKV', '.mov', '.webm'])('blocks setup with a saved %s video, without touching it', extension => {
    const directory = path.join(root, 'custom recordings', 'ranked')
    fs.mkdirSync(directory, { recursive: true })
    const video = path.join(directory, `match${extension}`)
    fs.writeFileSync(video, 'saved game')
    const result = check(root)
    expect(result.status).toBe(2)
    expect(result.stdout).toContain('Move your videos')
    expect(fs.readFileSync(video, 'utf8')).toBe('saved game')
  }, 30_000)

  it('does not block videos outside the installation tree', () => {
    const install = path.join(root, 'UpForge')
    fs.mkdirSync(install)
    fs.writeFileSync(path.join(root, 'saved.mp4'), 'saved game')
    expect(check(install).status).toBe(0)
  }, 30_000)

  it('fails closed on a junction rather than following it or silently skipping files', () => {
    const install = path.join(root, 'UpForge')
    fs.mkdirSync(install)
    fs.symlinkSync(root, path.join(install, 'linked-directory'), 'junction')
    const result = check(install)
    expect(result.status).toBe(3)
    expect(result.stdout).toContain('Cannot safely check linked folder')
  }, 30_000)
})
