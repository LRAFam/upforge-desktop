// Guards the rule "every Windows release is signed once a signing provider is connected".
// If this fails, read docs/releases/WINDOWS-SIGNING.md before changing the test.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..')
const workflow = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8')
const require = createRequire(import.meta.url)
const configPath = resolve(root, 'build/electron-builder.release.cjs')

function stepBlock(name: string): string {
  const start = workflow.indexOf(`- name: ${name}`)
  expect(start, `workflow step "${name}" is missing`).toBeGreaterThan(-1)
  const next = workflow.indexOf('\n      - name:', start + 1)
  return workflow.slice(start, next === -1 ? undefined : next)
}

// Runs the bash `run:` script of the Prepare step with the given step env.
function runPrepare(env: Record<string, string>) {
  const block = stepBlock('Prepare Windows code signing (tag)')
  const lines = block.split('\n')
  const start = lines.findIndex(l => /^\s+run: \|\s*$/.test(l))
  expect(start, 'Prepare step has no run block').toBeGreaterThan(-1)
  const body = lines.slice(start + 1)
  const indent = body.find(l => l.trim())!.match(/^\s*/)![0].length
  const script = body.map(l => l.slice(indent)).join('\n')
  const dir = mkdtempSync(join(tmpdir(), 'signing-'))
  const output = join(dir, 'out')
  try {
    const res = spawnSync('bash', ['-e', '-c', script], {
      env: {
        PATH: process.env.PATH,
        GITHUB_OUTPUT: output,
        PROVIDER: '',
        PUBLISHER: '',
        HAS_AZURE: 'false',
        HAS_SSLCOM: 'false',
        HAS_ANY_SIGNING_SETTING: 'false',
        ...env,
      },
      encoding: 'utf8',
    })
    let out = ''
    try {
      out = readFileSync(output, 'utf8')
    } catch {}
    return { status: res.status, stdout: res.stdout + res.stderr, output: out }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function loadReleaseConfig(env: Record<string, string>) {
  Object.assign(process.env, env)
  delete require.cache[configPath]
  return require(configPath)
}

const SIGNING_ENV = [
  'WIN_SIGNING_PROVIDER',
  'WIN_SIGNING_PUBLISHER',
  'AZURE_SIGNING_ENDPOINT',
  'AZURE_SIGNING_ACCOUNT',
  'AZURE_SIGNING_PROFILE',
]

afterEach(() => {
  for (const key of SIGNING_ENV) delete process.env[key]
})

describe('release workflow signing rule', () => {
  it('builds tagged Windows releases with the signing-aware config', () => {
    expect(stepBlock('Build Windows installer (tag')).toContain(
      '--config build/electron-builder.release.cjs'
    )
  })

  it('keeps branch/dev builds off paid signing', () => {
    expect(stepBlock('Build Windows installer (dev artifact)')).not.toContain(
      'electron-builder.release.cjs'
    )
  })

  it('verifies the signature and blocks the release when signing is required', () => {
    const verify = stepBlock('Verify Windows signature (tag)')
    expect(verify).toContain("startsWith(github.ref, 'refs/tags/v')")
    expect(verify).toContain('Get-AuthenticodeSignature')
    expect(verify).toContain('steps.signing.outputs.required')
    expect(verify).toMatch(/throw "Release blocked/)
  })

  it('only publishes after the Windows build job (and its signature check) succeeds', () => {
    expect(workflow).toMatch(/publish-release:\s*\n\s*needs: \[build-win, build-mac\]/)
  })

  it('passes the Prepare step a flag for any signing setting being present', () => {
    const prepare = stepBlock('Prepare Windows code signing (tag)')
    const line = prepare.split('\n').find(l => l.includes('HAS_ANY_SIGNING_SETTING:')) ?? ''
    for (const name of [
      'vars.WIN_SIGNING_PUBLISHER',
      'vars.AZURE_SIGNING_ENDPOINT',
      'secrets.AZURE_CLIENT_SECRET',
      'vars.SSLCOM_CODESIGNTOOL_URL',
      'secrets.ES_USERNAME',
      'secrets.ES_TOTP_SECRET',
    ]) {
      expect(line, `HAS_ANY_SIGNING_SETTING must include ${name}`).toContain(name)
    }
  })

  it('warns (but builds) when no signing is set up at all', () => {
    const res = runPrepare({})
    expect(res.status).toBe(0)
    expect(res.output).toContain('required=false')
    expect(res.stdout).toContain('Unsigned Windows release')
  })

  it('fails when signing settings exist but WIN_SIGNING_PROVIDER is empty', () => {
    const res = runPrepare({ HAS_ANY_SIGNING_SETTING: 'true' })
    expect(res.status).not.toBe(0)
    expect(res.stdout).toContain('WIN_SIGNING_PROVIDER')
    expect(res.output).not.toContain('required=false')
  })

  it('fails when a provider is chosen but its secrets are missing', () => {
    const res = runPrepare({ PROVIDER: 'azure', PUBLISHER: 'UpForge Ltd', HAS_ANY_SIGNING_SETTING: 'true' })
    expect(res.status).not.toBe(0)
  })

  it('requires signing when a provider is fully configured', () => {
    const res = runPrepare({
      PROVIDER: 'sslcom',
      PUBLISHER: 'UpForge Ltd',
      HAS_SSLCOM: 'true',
      HAS_ANY_SIGNING_SETTING: 'true',
    })
    expect(res.status).toBe(0)
    expect(res.output).toContain('required=true')
  })

  it('marks signing as required whenever a provider is configured', () => {
    const prepare = stepBlock('Prepare Windows code signing (tag)')
    expect(prepare).toMatch(/azure\|sslcom\)[\s\S]*required=true/)
  })
})

describe('electron-builder release config', () => {
  it('matches package.json and adds no signing when no provider is set', () => {
    const config = loadReleaseConfig({})
    const pkg = require(resolve(root, 'package.json')).build
    expect(config.appId).toBe(pkg.appId)
    expect(config.win.azureSignOptions).toBeUndefined()
    expect(config.win.signtoolOptions?.sign).toBeUndefined()
  })

  it('configures Azure Artifact Signing', () => {
    const config = loadReleaseConfig({
      WIN_SIGNING_PROVIDER: 'azure',
      WIN_SIGNING_PUBLISHER: 'UpForge Ltd',
      AZURE_SIGNING_ENDPOINT: 'https://weu.codesigning.azure.net/',
      AZURE_SIGNING_ACCOUNT: 'upforge',
      AZURE_SIGNING_PROFILE: 'upforge-public',
    })
    expect(config.win.azureSignOptions).toEqual({
      publisherName: 'UpForge Ltd',
      endpoint: 'https://weu.codesigning.azure.net/',
      codeSigningAccountName: 'upforge',
      certificateProfileName: 'upforge-public',
    })
    expect(config.win.signtoolOptions).toBeUndefined()
  })

  it('fails fast when Azure settings are incomplete', () => {
    expect(() =>
      loadReleaseConfig({ WIN_SIGNING_PROVIDER: 'azure', WIN_SIGNING_PUBLISHER: 'UpForge Ltd' })
    ).toThrow(/AZURE_SIGNING_ENDPOINT/)
  })

  it('uses the SSL.com signer hook', () => {
    const config = loadReleaseConfig({ WIN_SIGNING_PROVIDER: 'sslcom' })
    expect(config.win.signtoolOptions).toMatchObject({
      sign: './build/sign-windows-sslcom.cjs',
      signingHashAlgorithms: ['sha256'],
    })
  })

  it('rejects unknown providers', () => {
    expect(() => loadReleaseConfig({ WIN_SIGNING_PROVIDER: 'other' })).toThrow(/Unknown/)
  })
})
