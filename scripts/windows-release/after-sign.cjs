const { nativeFiles, verifyOrSign } = require('./sign-hook.cjs')

// Run before the installer is assembled; include native modules and nested DLLs.
module.exports = async function afterSign(context) {
  for (const file of nativeFiles(context.appOutDir)) verifyOrSign(file)
}
