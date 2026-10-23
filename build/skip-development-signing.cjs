// Only branch artifacts may use this unsigned build hook. Public release tags
// must use the real signer; reject accidental reuse instead of skipping it.
module.exports = async function skipDevelopmentSigning() {
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    !process.env.GITHUB_REF?.startsWith('refs/heads/')
  ) {
    throw new Error('Unsigned development signing is only allowed for GitHub branch artifacts.')
  }
}
