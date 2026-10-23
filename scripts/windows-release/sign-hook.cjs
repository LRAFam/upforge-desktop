const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function requiresPublisher(file) {
  const name = path.basename(file)
  return /^(upforge\.exe|upforge-trainer\.exe|UpForge-Setup-\d+\.\d+\.\d+\.exe)$/i.test(name) || /uninstall/i.test(name)
}

function verifyOrSign(file, verifyOnly = false) {
  if (process.platform !== 'win32') throw new Error('Use the Windows signing PC.')
  for (const key of ['UPFORGE_SIGNTOOL', 'UPFORGE_SIGN_CERT', 'UPFORGE_SIGN_LOG']) {
    if (!process.env[key]) throw new Error(`Missing ${key}; use Build-Release.ps1.`)
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-sign-'))
  const receipt = path.join(temp, 'receipt.json')
  try {
    const args = ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(__dirname, 'Sign-File.ps1'), '-Path', file,
      '-SignTool', process.env.UPFORGE_SIGNTOOL,
      '-CertificateThumbprint', process.env.UPFORGE_SIGN_CERT, '-ReportPath', receipt]
    if (requiresPublisher(file)) args.push('-RequirePublisher')
    if (verifyOnly) args.push('-VerifyOnly')
    const result = spawnSync('powershell.exe', args, { stdio: 'inherit', windowsHide: false })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`Signing/verification failed for ${path.basename(file)}`)
    const record = JSON.parse(fs.readFileSync(receipt, 'utf8').replace(/^\uFEFF/, ''))
    if (record.verified !== true) throw new Error('Missing successful signature verification.')
    fs.appendFileSync(process.env.UPFORGE_SIGN_LOG, JSON.stringify(record) + '\n')
    return record
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

function nativeFiles(root) {
  const files = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Unexpected link in Windows payload: ${file}`)
    if (entry.isDirectory()) files.push(...nativeFiles(file))
    else if (/\.(exe|dll|node)$/i.test(entry.name)) files.push(file)
  }
  return files
}

module.exports = async function sign(configuration) {
  if (configuration.hash !== 'sha256' || configuration.isNest) throw new Error('Only one SHA-256 signature is allowed.')
  verifyOrSign(configuration.path)
}
module.exports.verifyOrSign = verifyOrSign
module.exports.nativeFiles = nativeFiles
module.exports.requiresPublisher = requiresPublisher
