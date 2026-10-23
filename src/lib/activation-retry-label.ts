/** Dashboard retry button labels from activation failure codes. */

export function recordingRetryAction(
  lastError?: string | null,
  lastFailureCode?: string | null,
): 'preparation' | 'upload' | 'analysis' {
  const code = (lastFailureCode ?? '').trim()
  if (code.startsWith('preparation_')) return 'preparation'
  if (code.startsWith('upload_')) return 'upload'

  const err = (lastError ?? '').toLowerCase()
  if (/preparation_|preparing (did not|is taking)/i.test(err)) return 'preparation'
  if (/upload_|upload stalled|upload aborted|socket hang up|econnreset/i.test(err)) {
    return 'upload'
  }
  return 'analysis'
}

export function recordingRetryActionLabel(
  lastError?: string | null,
  lastFailureCode?: string | null,
): string {
  const action = recordingRetryAction(lastError, lastFailureCode)
  if (action === 'preparation') return 'Resume Preparation'
  if (action === 'upload') return 'Resume Upload'
  return 'Retry'
}
