// Guards the rule "every Windows release is signed once a signing provider is connected".
// If this fails, read docs/releases/WINDOWS-SIGNING.md before changing the test.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
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
