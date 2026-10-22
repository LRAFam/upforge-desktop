// electron-builder config for tagged releases: package.json "build" + Windows signing.
// Branch/dev builds keep using package.json directly, so they never use paid signing.
// Setup steps: docs/releases/WINDOWS-SIGNING.md

const base = require('../package.json').build

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Windows signing (${process.env.WIN_SIGNING_PROVIDER}): missing ${name}`)
  return value
}

function windowsConfig() {
  const provider = process.env.WIN_SIGNING_PROVIDER || ''
  const win = { ...base.win }

  if (provider === 'azure') {
    // Azure Artifact Signing. Credentials come from AZURE_TENANT_ID,
    // AZURE_CLIENT_ID and AZURE_CLIENT_SECRET, read by Microsoft's signing module.
    delete win.signtoolOptions
    win.azureSignOptions = {
      publisherName: required('WIN_SIGNING_PUBLISHER'),
      endpoint: required('AZURE_SIGNING_ENDPOINT'),
      codeSigningAccountName: required('AZURE_SIGNING_ACCOUNT'),
      certificateProfileName: required('AZURE_SIGNING_PROFILE'),
    }
  } else if (provider === 'sslcom') {
    win.signtoolOptions = {
      ...(win.signtoolOptions || {}),
      signingHashAlgorithms: ['sha256'],
      sign: './build/sign-windows-sslcom.cjs',
    }
  } else if (provider !== '') {
    throw new Error(`Unknown WIN_SIGNING_PROVIDER "${provider}" (use "azure" or "sslcom")`)
  }

  return win
}

module.exports = { ...base, win: windowsConfig() }
