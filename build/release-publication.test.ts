import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml')
const { publishRelease, releaseManifest } = require('../scripts/publish-release.cjs')
const temp: string[] = []
afterEach(() => { for (const dir of temp.splice(0)) fs.rmSync(dir, { recursive: true, force: true }) })

const version = '3.4.8'
const tag = `v${version}`
const repo = 'LRAFam/upforge-desktop'
const exe = `UpForge-Setup-${version}.exe`
const zip = `UpForge-${version}-arm64-mac.zip`
const dmg = `UpForge-${version}-arm64.dmg`
const digest = (bytes: Buffer) => crypto.createHash('sha512').update(bytes).digest('base64')

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-publication-'))
  temp.push(dir)
  for (const name of [exe, zip, dmg]) {
    fs.writeFileSync(path.join(dir, name), Buffer.from(`fixture ${name}`))
    fs.writeFileSync(path.join(dir, `${name}.blockmap`), Buffer.from(`map ${name}`))
  }
  for (const [name, files] of [['latest.yml', [exe]], ['latest-mac.yml', [zip, dmg]]] as const) {
    const entries = files.map(url => {
      const bytes = fs.readFileSync(path.join(dir, url))
      return { url, sha512: digest(bytes), size: bytes.length }
    })
    fs.writeFileSync(path.join(dir, name), yaml.dump({ version, files: entries,
      path: entries[0].url, sha512: entries[0].sha512 }))
  }
  return dir
}

type RemoteAsset = { name: string; size: number; state: string }
type Release = { tag_name: string; draft: boolean; prerelease: boolean; assets: RemoteAsset[] }

function remote(options: { failUpload?: boolean; corruptDownload?: boolean; latest?: string; missingAsset?: boolean } = {}) {
  const calls: string[][] = []
  const bytes = new Map<string, Buffer>()
  let release: Release | null = null
  let latest = options.latest ?? 'v3.4.7'
  let downloaded = false
  const gh = (args: string[]) => {
    calls.push(args)
    if (args[0] === 'api') {
      if (args[1].endsWith('/latest')) return JSON.stringify({ tag_name: latest, draft: false })
      if (!release) throw Object.assign(new Error('HTTP 404'), { stderr: 'HTTP 404' })
      return JSON.stringify(release)
    }
    if (args[1] === 'create') {
      release = { tag_name: tag, draft: args.includes('--draft'), prerelease: false, assets: [] }
      expect(args).toContain('--verify-tag')
    } else if (args[1] === 'upload') {
      expect(release?.draft).toBe(true)
      for (const file of args.slice(5, -1)) {
        const data = fs.readFileSync(file)
        bytes.set(path.basename(file), data)
        if (options.failUpload) throw new Error('injected partial upload failure')
      }
      release!.assets = [...bytes].map(([name, data]) => ({ name, size: data.length, state: 'uploaded' }))
      if (options.missingAsset) release!.assets.pop()
    } else if (args[1] === 'download') {
      const dir = args[args.indexOf('--dir') + 1]
      for (const [name, data] of bytes) {
        const output = Buffer.from(data)
        if (options.corruptDownload && name === exe) output[0] ^= 1 // same size, wrong hash
        fs.writeFileSync(path.join(dir, name), output)
      }
      downloaded = true
    } else if (args[1] === 'edit') {
      expect(downloaded).toBe(true)
      expect(args).toContain('--draft=false')
      expect(args).toContain('--latest')
      release!.draft = false
      latest = tag
    } else throw new Error(`Unexpected gh call: ${args.join(' ')}`)
    return ''
  }
  return { gh, calls, bytes, get release() { return release }, get latest() { return latest } }
}

describe('draft release publication', () => {
  it('publishes only after all eight update assets are uploaded and downloaded with matching checksums', async () => {
    const dir = fixture(); const api = remote()
    let publiclyChecked = false
    const result = await publishRelease({ repo, tag, dir, gh: api.gh, verifyPublic: async () => {
      expect(api.release?.draft).toBe(false)
      expect(api.latest).toBe(tag)
      publiclyChecked = true
    } })
    expect(result).toEqual({ tag, assets: 8, alreadyPublished: false })
    expect(publiclyChecked).toBe(true)
    expect(api.calls.filter(call => call[1] === 'edit')).toHaveLength(1)
  })

  it.each([
    ['upload failure', { failUpload: true }],
    ['missing remote asset', { missingAsset: true }],
    ['same-size remote corruption', { corruptDownload: true }],
    ['newer Latest release', { latest: 'v3.4.9' }],
  ] as const)('leaves the release private on %s', async (_name, options) => {
    const api = remote(options)
    await expect(publishRelease({ repo, tag, dir: fixture(), gh: api.gh,
      verifyPublic: async () => { throw new Error('must not reach public verification') } })).rejects.toThrow()
    expect(api.release?.draft).toBe(true)
    expect(api.calls.some(call => call[1] === 'edit')).toBe(false)
    expect(api.latest).toBe('latest' in options ? options.latest : 'v3.4.7')
  })

  it('resumes an existing partial draft without making a second release', async () => {
    const dir = fixture(); const options = { failUpload: true }; const api = remote(options)
    const input = { repo, tag, dir, gh: api.gh, verifyPublic: async () => {} }
    await expect(publishRelease(input)).rejects.toThrow(/partial upload/)
    expect(api.bytes.size).toBe(1)
    expect(api.release?.draft).toBe(true)
    options.failUpload = false
    await publishRelease(input)
    expect(api.release?.draft).toBe(false)
    expect(api.calls.filter(call => call[1] === 'create')).toHaveLength(1)
  })

  it('never modifies an already-published release on a verified rerun', async () => {
    const dir = fixture(); const api = remote()
    const input = { repo, tag, dir, gh: api.gh, verifyPublic: async () => {} }
    await publishRelease(input)
    api.calls.length = 0
    expect((await publishRelease(input)).alreadyPublished).toBe(true)
    expect(api.calls.some(call => ['create', 'edit', 'upload'].includes(call[1]))).toBe(false)
  })

  it('fails a published rerun with changed bytes instead of replacing a downloaded installer', async () => {
    const dir = fixture(); const api = remote()
    const input = { repo, tag, dir, gh: api.gh, verifyPublic: async () => {} }
    await publishRelease(input)
    api.calls.length = 0
    api.bytes.set(exe, Buffer.from('x'.repeat(api.bytes.get(exe)!.length)))
    await expect(publishRelease(input)).rejects.toThrow(/differs/)
    expect(api.calls.some(call => ['create', 'edit', 'upload'].includes(call[1]))).toBe(false)
  })

  it('fails the run if publication cannot be confirmed publicly', async () => {
    const api = remote()
    await expect(publishRelease({ repo, tag, dir: fixture(), gh: api.gh,
      verifyPublic: async () => { throw new Error('public metadata unavailable') } })).rejects.toThrow(/public metadata/)
  })
})

describe('update manifest validation before creating a release', () => {
  it.each(['version', 'hash', 'size', 'path', 'traversal', 'missing blockmap', 'unexpected file'])('rejects %s defects locally', async defect => {
    const dir = fixture(); const api = remote()
    const file = path.join(dir, 'latest.yml')
    const info = yaml.load(fs.readFileSync(file, 'utf8'))
    if (defect === 'version') info.version = '3.4.7'
    if (defect === 'hash') info.files[0].sha512 = 'incorrect'
    if (defect === 'size') info.files[0].size++
    if (defect === 'path') info.path = 'missing.exe'
    if (defect === 'traversal') info.files[0].url = '../outside.exe'
    if (defect === 'missing blockmap') fs.unlinkSync(path.join(dir, `${exe}.blockmap`))
    if (defect === 'unexpected file') fs.writeFileSync(path.join(dir, 'stale.exe'), 'stale')
    fs.writeFileSync(file, yaml.dump(info))
    await expect(publishRelease({ repo, tag, dir, gh: api.gh })).rejects.toThrow()
    expect(api.calls).toHaveLength(0)
  })

  it('requires the Mac zip even when the dmg is present', async () => {
    const dir = fixture(); const file = path.join(dir, 'latest-mac.yml')
    const info = yaml.load(fs.readFileSync(file, 'utf8'))
    info.files = info.files.filter((entry: { url: string }) => entry.url === dmg)
    info.path = dmg; info.sha512 = info.files[0].sha512
    fs.writeFileSync(file, yaml.dump(info))
    await expect(releaseManifest(dir, version)).rejects.toThrow(/updater zip/)
  })
})

describe('single release trigger and serialization', () => {
  const workflow = yaml.load(fs.readFileSync(path.resolve(__dirname, '../.github/workflows/release.yml'), 'utf8'))
  const autoTag = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/auto-tag.yml'), 'utf8')
  it('dispatches tag builds once and keeps branch builds unpublished', () => {
    expect(workflow.on).toHaveProperty('workflow_dispatch')
    expect(workflow.on.push).toEqual({ branches: ['main'] })
    expect(autoTag).toContain('gh workflow run "release.yml" --ref "${{ steps.pkg.outputs.version }}"')
    expect(workflow.jobs['publish-release'].if).toContain("startsWith(github.ref, 'refs/tags/v')")
  })
  it('serializes publication across tag versions without cancelling an upload', () => {
    expect(workflow.jobs['publish-release'].concurrency).toEqual({
      group: 'desktop-release-publication', 'cancel-in-progress': false,
    })
    expect(workflow.jobs['publish-release'].needs).toEqual(['build-win', 'build-mac'])
    expect(workflow.jobs['build-win'].needs).toBe('packaged-selftest')
  })
})
