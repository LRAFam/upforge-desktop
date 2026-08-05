/** Dashboard retry button labels from activation failure codes. */

export function recordingRetryActionLabel(
  lastError?: string | null,
  lastFailureCode?: string | null,
): string {
  const code = (lastFailureCode ?? '').trim()
  if (code.startsWith('preparation_')) return 'Resume Preparation'
  if (code.startsWith('upload_')) return 'Resume Upload'

  const err = (lastError ?? '').toLowerCase()
  if (/preparation_|preparing (did not|is taking)/i.test(err)) return 'Resume Preparation'
  if (/upload_|upload stalled|upload aborted|socket hang up|econnreset/i.test(err)) {
    return 'Resume Upload'
  }
  return 'Retry'
}
