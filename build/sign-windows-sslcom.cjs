// electron-builder custom signer for SSL.com eSigner (cloud signing, no USB token).
// Used only by tagged release builds when WIN_SIGNING_PROVIDER=sslcom.
// Setup steps: docs/releases/WINDOWS-SIGNING.md
//
// Needs (set by .github/workflows/release.yml):
//   CODESIGNTOOL_DIR  folder of the unzipped SSL.com CodeSignTool
//   ES_USERNAME, ES_PASSWORD, ES_CREDENTIAL_ID, ES_TOTP_SECRET  (GitHub secrets)

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`SSL.com signing: missing ${name}`)
  return value
}

function findJar(toolDir) {
  const jarDir = path.join(toolDir, 'jar')
  const jar = fs.existsSync(jarDir)
    ? fs.readdirSync(jarDir).find(f => /^code_sign_tool.*\.jar$/i.test(f))
    : undefined
  if (!jar) throw new Error(`SSL.com signing: CodeSignTool jar not found in ${jarDir}`)
  return path.join(jarDir, jar)
}

// CodeSignTool can exit 0 even when signing fails, so ask Windows directly.
function assertValidSignature(file) {
  const status = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      '(Get-AuthenticodeSignature -LiteralPath $env:UPFORGE_SIGNED_FILE).Status.ToString()',
    ],
    { env: { ...process.env, UPFORGE_SIGNED_FILE: file }, encoding: 'utf8' }
  ).trim()
  if (status !== 'Valid') {
    throw new Error(`SSL.com signing: ${path.basename(file)} signature status is "${status}"`)
  }
}

module.exports = async function signWithSslCom(configuration) {
  const file = configuration.path
  const toolDir = required('CODESIGNTOOL_DIR')

  // Arguments are passed as an array (no shell), so passwords with special
  // characters are safe and never echoed.
  execFileSync(
    'java',
    [
      '-jar',
      findJar(toolDir),
      'sign',
      `-username=${required('ES_USERNAME')}`,
      `-password=${required('ES_PASSWORD')}`,
      `-credential_id=${required('ES_CREDENTIAL_ID')}`,
      `-totp_secret=${required('ES_TOTP_SECRET')}`,
      `-input_file_path=${file}`,
      '-override',
    ],
    { cwd: toolDir, stdio: ['ignore', 'ignore', 'inherit'] }
  )

  assertValidSignature(file)
  console.log(`  • signed with SSL.com eSigner: ${path.basename(file)}`)
}
