// Guards the macOS release: bundled (not Homebrew) ffmpeg, a zip for auto-update,
// and signing/notarisation that is either fully configured or clearly skipped.
// Setup steps: docs/releases/MACOS-SIGNING.md
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..')
const workflow = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

function stepBlock(name: string): string {
  const start = workflow.indexOf(`- name: ${name}`)
  expect(start, `workflow step "${name}" is missing`).toBeGreaterThan(-1)
  const next = workflow.indexOf('\n      - name:', start + 1)
  const nextJob = workflow.indexOf('\n  # ', start + 1)
  const ends = [next, nextJob].filter(i => i !== -1)
  return workflow.slice(start, ends.length ? Math.min(...ends) : undefined)
}

function macJob(): string {
  const start = workflow.indexOf('\n  build-mac:')
  const end = workflow.indexOf('\n  publish-release:')
  expect(start).toBeGreaterThan(-1)
  return workflow.slice(start, end)
}

function runScript(stepName: string, env: Record<string, string>) {
  const lines = stepBlock(stepName).split('\n')
  const start = lines.findIndex(l => /^\s+run: \|\s*$/.test(l))
  expect(start, `${stepName} has no run block`).toBeGreaterThan(-1)
  const body = lines.slice(start + 1)
  const indent = body.find(l => l.trim())!.match(/^\s*/)![0].length
  const script = body.map(l => l.slice(indent)).join('\n')
  const dir = mkdtempSync(join(tmpdir(), 'mac-signing-'))
  const output = join(dir, 'out')
  const genv = join(dir, 'env')
  const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
  try {
    const res = spawnSync('bash', ['-e', '-c', script], {
      env: { PATH: process.env.PATH, GITHUB_OUTPUT: output, GITHUB_ENV: genv, ...env },
      encoding: 'utf8',
    })
    return { status: res.status, log: res.stdout + res.stderr, output: read(output), env: read(genv) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const NONE = { HAS_CERT: 'false', HAS_NOTARY: 'false', HAS_ANY_MAC_SIGNING: 'false' }

describe('macOS ffmpeg', () => {
  it('bundles a pinned static ffmpeg instead of copying Homebrew ffmpeg', () => {
    const job = macJob()
    expect(job).not.toMatch(/brew install ffmpeg/)
    const step = stepBlock('Download ffmpeg for macOS')
    expect(step).toMatch(/https:\/\/\S+ffmpeg\S*\.zip/)
    expect(step).toMatch(/shasum -a 256/)
    expect(step).toMatch(/\b[0-9a-f]{64}\b/)
  })

  it('fails the build if ffmpeg links anything outside macOS itself', () => {
    const step = stepBlock('Download ffmpeg for macOS')
    expect(step).toContain('otool -L')
    expect(step).toMatch(/exit 1|::error/)
    expect(step).toContain('h264_videotoolbox')
  })
})

describe('macOS targets and bundle', () => {
  it('builds a zip next to the dmg so electron-updater can update Macs', () => {
    expect(pkg.build.mac.target).toEqual(expect.arrayContaining(['dmg', 'zip']))
  })

  it('uploads and publishes the zip and its blockmap', () => {
    const upload = stepBlock('Upload Mac release artifacts')
    expect(upload).toContain('dist/*.zip')
    expect(upload).toContain('dist/*.zip.blockmap')
    const publish = stepBlock('Publish GitHub release (metadata first)')
    expect(publish).toMatch(/dist\/\*\.zip dist\/\*\.zip\.blockmap/)
  })

  it('declares microphone use and hardened-runtime entitlements', () => {
    expect(pkg.build.mac.extendInfo?.NSMicrophoneUsageDescription).toBeTruthy()
    expect(pkg.build.mac.hardenedRuntime).toBe(true)
    const plist = readFileSync(resolve(root, pkg.build.mac.entitlements), 'utf8')
    expect(plist).toContain('com.apple.security.device.audio-input')
    expect(plist).toContain('com.apple.security.cs.allow-jit')
    expect(pkg.build.mac.entitlementsInherit).toBe(pkg.build.mac.entitlements)
  })

  it('keeps Windows targets unchanged', () => {
    expect(pkg.build.win.target).toEqual(['nsis'])
  })
})

describe('macOS signing and notarisation', () => {
  const prepare = 'Prepare macOS signing (tag)'

  it('warns and builds unsigned when no Mac signing is set up', () => {
    const res = runScript(prepare, NONE)
    expect(res.status).toBe(0)
    expect(res.output).toContain('required=false')
    expect(res.log).toContain('Unsigned macOS release')
    expect(res.env).toContain('CSC_IDENTITY_AUTO_DISCOVERY=false')
  })

  it('fails when signing is only half set up', () => {
    for (const env of [
      { ...NONE, HAS_CERT: 'true', HAS_ANY_MAC_SIGNING: 'true' },
      { ...NONE, HAS_NOTARY: 'true', HAS_ANY_MAC_SIGNING: 'true' },
      { ...NONE, HAS_ANY_MAC_SIGNING: 'true' },
    ]) {
      const res = runScript(prepare, env)
      expect(res.status, JSON.stringify(env)).not.toBe(0)
      expect(res.output).not.toContain('required=false')
    }
  })

  it('requires signing + notarisation when everything is set', () => {
    const res = runScript(prepare, { HAS_CERT: 'true', HAS_NOTARY: 'true', HAS_ANY_MAC_SIGNING: 'true' })
    expect(res.status).toBe(0)
    expect(res.output).toContain('required=true')
    expect(res.env).not.toContain('CSC_IDENTITY_AUTO_DISCOVERY=false')
  })

  it('feeds the certificate and notary credentials to the tag build only', () => {
    const tag = stepBlock('Build Mac installer (tag')
    for (const name of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) {
      expect(tag).toContain(`${name}:`)
    }
    const dev = stepBlock('Build Mac installer (dev artifact)')
    expect(dev).not.toContain('CSC_LINK')
    expect(dev).toContain('CSC_IDENTITY_AUTO_DISCOVERY: false')
  })

  it('verifies the signature + notarisation and blocks the release when required', () => {
    const verify = stepBlock('Verify macOS signature (tag)')
    expect(verify).toContain("startsWith(github.ref, 'refs/tags/v')")
    expect(verify).toContain('steps.mac_signing.outputs.required')
    expect(verify).toContain('codesign --verify --deep --strict')
    expect(verify).toContain('xcrun stapler validate')
    expect(verify).toContain('spctl')
    expect(verify).toMatch(/Release blocked/)
  })

  it('checks the packaged app really contains a runnable ffmpeg', () => {
    const verify = stepBlock('Verify macOS signature (tag)')
    expect(verify).toContain('Contents/Resources/ffmpeg/ffmpeg')
  })
})
