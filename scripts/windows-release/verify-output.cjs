const fs = require('node:fs')
const path = require('node:path')
const { nativeFiles, verifyOrSign } = require('./sign-hook.cjs')
const { digest, validateUpdateMetadata, validateSigningReceipts } = require('./release-policy.cjs')

function verifyOutput(directory, version, thumbprint) {
  const source = path.join(directory, '..', 'source')
  const yaml = require(path.join(source, 'node_modules', 'js-yaml'))
  const metadata = yaml.load(fs.readFileSync(path.join(directory, 'latest.yml'), 'utf8'))
  const names = validateUpdateMetadata(metadata, directory, version)
  const log = path.join(directory, '..', 'signing.jsonl')
  const receipts = fs.readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  validateSigningReceipts(receipts, thumbprint)
  const payload = path.join(directory, 'win-unpacked')
  if (!fs.existsSync(path.join(payload, 'UpForge.exe'))) throw new Error('Missing packaged UpForge executable.')
  for (const file of [...nativeFiles(payload), path.join(directory, names[0])]) verifyOrSign(file, true)
  return names.map(name => ({ name, sha256: digest(path.join(directory, name)) }))
}

if (require.main === module) {
  try {
    const [directory, version, thumbprint, commit] = process.argv.slice(2)
    if (!/^[A-F0-9]{40}$/.test(thumbprint) || !/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid release identity.')
    const report = { schemaVersion: 1, tag: `v${version}`, commit, certificateThumbprint: thumbprint,
      verifiedAt: new Date().toISOString(), artifacts: verifyOutput(directory, version, thumbprint) }
    fs.writeFileSync(path.join(directory, 'release-report.json'), JSON.stringify(report, null, 2) + '\n')
    console.log('Verified Windows payload, installer, uninstaller receipt and update metadata.')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
module.exports = { verifyOutput }
