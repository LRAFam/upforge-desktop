// Keep a release private until its complete, checksum-verified update graph is available.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const yaml = require('js-yaml')
const semver = require('semver')

function fail(message) { throw new Error(message) }

function assetName(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(value)) {
    fail('Release metadata contains an unsafe asset filename')
  }
  return value
}

async function fileRecord(dir, name) {
  const file = path.join(dir, assetName(name))
  const stat = fs.lstatSync(file)
  if (!stat.isFile() || stat.size < 1) fail(`Missing or empty release asset: ${name}`)
  const hash = crypto.createHash('sha512')
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
  return { name, size: stat.size, sha512: hash.digest('base64') }
}

async function releaseManifest(dir, version) {
  if (!semver.valid(version)) fail('Invalid release version')
  const records = new Map()
  for (const metadata of ['latest.yml', 'latest-mac.yml']) {
    const info = yaml.load(fs.readFileSync(path.join(dir, metadata), 'utf8'))
    if (info?.version !== version || !Array.isArray(info.files) || !info.files.length) {
      fail(`${metadata} must describe version ${version} and its files`)
    }
    const names = new Set()
    for (const entry of info.files) {
      const name = assetName(entry?.url)
      if (names.has(name)) fail(`${metadata} repeats ${name}`)
      names.add(name)
      if (metadata === 'latest.yml' ? name !== `UpForge-Setup-${version}.exe`
        : !name.startsWith(`UpForge-${version}-`) || !/\.(zip|dmg)$/.test(name)) {
        fail(`${metadata} contains an unexpected installer: ${name}`)
      }
      const record = await fileRecord(dir, name)
      if (!Number.isSafeInteger(entry.size) || entry.size !== record.size || entry.sha512 !== record.sha512) {
        fail(`${metadata} checksum or size mismatch: ${name}`)
      }
      records.set(name, record)
      records.set(`${name}.blockmap`, await fileRecord(dir, `${name}.blockmap`))
    }
    if (metadata === 'latest-mac.yml' &&
      (![...names].some(name => name.endsWith('.zip')) || ![...names].some(name => name.endsWith('.dmg')))) {
      fail('latest-mac.yml must include both the updater zip and the dmg')
    }
    const primary = records.get(assetName(info.path))
    if (!names.has(info.path) || !primary || info.sha512 !== primary.sha512) {
      fail(`${metadata} legacy path/checksum disagrees with its files`)
    }
    records.set(metadata, await fileRecord(dir, metadata))
  }
  const actual = fs.readdirSync(dir).sort()
  if (JSON.stringify(actual) !== JSON.stringify([...records.keys()].sort())) {
    fail('Release directory contains unexpected or missing assets')
  }
  return [...records.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function execGh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function readRelease(gh, endpoint) {
  try { return JSON.parse(gh(['api', endpoint])) } catch (error) {
    const detail = String(error.stderr || error.message || '')
    if (/HTTP 404|release not found/i.test(detail)) return null
    throw error
  }
}

// GitHub's "release by tag" endpoint never returns drafts (404), so look the tag up in the
// release list, which includes drafts. More than one release on a tag is never safe to publish.
function findRelease(gh, repo, tag) {
  const list = JSON.parse(gh(['api', `repos/${repo}/releases?per_page=100`]))
  if (!Array.isArray(list)) fail('Unexpected release list response')
  const matches = list.filter(release => release?.tag_name === tag)
  if (matches.length > 1) fail(`More than one release uses ${tag}; delete the extra drafts first`)
  return matches[0] ?? null
}

// Latest can lag a moment behind publication; retry before calling the run a failure.
async function waitForLatest(gh, repo, tag, wait) {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (readRelease(gh, `repos/${repo}/releases/latest`)?.tag_name === tag) return true
    if (attempt < 5) await wait(5_000)
  }
  return false
}

async function verifyRemoteAssets(gh, repo, tag, release, manifest) {
  const assets = release?.assets
  if (!Array.isArray(assets) || assets.length !== manifest.length) fail('Draft has an incomplete or unexpected asset set')
  for (const expected of manifest) {
    const matches = assets.filter(asset => asset.name === expected.name)
    if (matches.length !== 1 || matches[0].state !== 'uploaded' || matches[0].size !== expected.size) {
      fail(`Remote asset is incomplete: ${expected.name}`)
    }
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-release-verify-'))
  try {
    gh(['release', 'download', tag, '--repo', repo, '--dir', dir,
      ...manifest.flatMap(asset => ['--pattern', asset.name])])
    for (const expected of manifest) {
      const actual = await fileRecord(dir, expected.name)
      if (actual.size !== expected.size || actual.sha512 !== expected.sha512) {
        fail(`Downloaded release asset differs: ${expected.name}`)
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

async function verifyPublicAssets(repo, tag, manifest) {
  let pending = manifest.map(asset => asset.name)
  for (let attempt = 0; attempt < 6; attempt++) {
    const results = await Promise.all(pending.map(async name => {
      try {
        const response = await fetch(`https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`, {
          method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15_000),
        })
        return response.ok ? null : name
      } catch { return name }
    }))
    pending = results.filter(Boolean)
    if (!pending.length) return
    if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 5_000))
  }
  fail(`Published assets are not publicly reachable: ${pending.join(', ')}`)
}

async function publishRelease({ repo, tag, dir, gh = execGh, verifyPublic = verifyPublicAssets,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !tag?.startsWith('v')) fail('Invalid release repository or tag')
  const version = tag.slice(1)
  const manifest = await releaseManifest(dir, version)
  let release = findRelease(gh, repo, tag)
  if (release && (release.tag_name !== tag || release.prerelease)) fail('Unexpected existing release identity')

  // A rerun must never replace bytes that installed clients may already be downloading.
  if (release && !release.draft) {
    await verifyRemoteAssets(gh, repo, tag, release, manifest)
    await verifyPublic(repo, tag, manifest)
    return { tag, assets: manifest.length, alreadyPublished: true }
  }
  if (!release) {
    gh(['release', 'create', tag, '--repo', repo, '--draft', '--verify-tag', '--title', version,
      '--notes', 'See commit history for changes.'])
  }
  gh(['release', 'upload', tag, '--repo', repo, ...manifest.map(asset => path.join(dir, asset.name)), '--clobber'])
  release = findRelease(gh, repo, tag)
  if (!release?.draft || release.tag_name !== tag || release.prerelease) fail('Release is no longer the expected draft')
  await verifyRemoteAssets(gh, repo, tag, release, manifest)

  // The workflow serializes publication across tags. Never move Latest backwards on a stale run.
  const latest = readRelease(gh, `repos/${repo}/releases/latest`)
  if (latest && latest.tag_name !== tag) {
    const latestVersion = semver.valid(latest.tag_name?.replace(/^v/, ''))
    if (!latestVersion || semver.gte(latestVersion, version)) fail('Refusing to replace a newer or unrecognized Latest release')
  }
  gh(['release', 'edit', tag, '--repo', repo, '--draft=false', '--latest'])
  const published = findRelease(gh, repo, tag)
  const isLatest = await waitForLatest(gh, repo, tag, wait)
  if (published?.draft !== false || published?.prerelease || !isLatest) {
    fail('Release publication or Latest verification failed')
  }
  await verifyPublic(repo, tag, manifest)
  return { tag, assets: manifest.length, alreadyPublished: false }
}

module.exports = { publishRelease, releaseManifest }
if (require.main === module) {
  publishRelease({ repo: process.env.GITHUB_REPOSITORY, tag: process.env.GITHUB_REF_NAME,
    dir: path.resolve(process.argv[2] || 'dist') })
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1 })
}
