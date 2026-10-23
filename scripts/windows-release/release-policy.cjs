const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

function digest(file, algorithm = 'sha256', encoding = 'hex') {
  return crypto.createHash(algorithm).update(fs.readFileSync(file)).digest(encoding)
}

function validateUpdateMetadata(metadata, directory, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('A stable release version is required.')
  const installer = `UpForge-Setup-${version}.exe`
  if (metadata.version !== version || metadata.path !== installer) throw new Error('Update version/installer mismatch.')
  if (!Array.isArray(metadata.files) || metadata.files.length !== 1 || metadata.files[0].url !== installer) {
    throw new Error('Expected exactly one Windows x64 installer in latest.yml.')
  }
  const file = path.join(directory, installer)
  const actualHash = digest(file, 'sha512', 'base64')
  if (metadata.sha512 !== actualHash || metadata.files[0].sha512 !== actualHash || metadata.files[0].size !== fs.statSync(file).size) {
    throw new Error('Update metadata does not match the signed installer.')
  }
  if (fs.statSync(file + '.blockmap').size === 0) throw new Error('Empty installer blockmap.')
  return [installer, installer + '.blockmap', 'latest.yml']
}

function validateSigningReceipts(records, thumbprint) {
  if (!Array.isArray(records) || records.length === 0) throw new Error('No signing verification receipts.')
  if (records.some(r => r.verified !== true || !/^[a-f0-9]{64}$/.test(r.sha256))) throw new Error('Invalid signing receipt.')
  // NSIS removes the temporary uninstaller after embedding it. Require evidence
  // from the signing hook before that deletion, as well as final installer checks.
  if (!records.some(r => /uninstall/i.test(r.file) && r.signer === thumbprint && r.timestamped === true)) {
    throw new Error('No verified, timestamped uninstaller from the expected publisher.')
  }
}

module.exports = { digest, validateUpdateMetadata, validateSigningReceipts }
