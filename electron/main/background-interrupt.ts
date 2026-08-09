/** Errors thrown when match capture aborts an in-flight upload/compression. */
export function wasBackgroundWorkInterrupted(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /upload aborted|upload_aborted_by_user|upload was cancelled|upload cancelled|compression cancelled — match/i.test(
    msg,
  )
}
