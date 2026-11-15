/** Benign OBS WebSocket errors when a scene item/source was removed between list + update. */
export function isBenignObsWebSocketError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '')
  return (
    /Object Not Found Matching Id/i.test(message)
    || /No scene items were found/i.test(message)
    || /resource not found/i.test(message)
  )
}

/** OBS can reject requests with a protocol code but an empty comment. */
export function describeObsError(err: unknown): string {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  if (message.trim()) return message.trim()
  const code = err && typeof err === 'object' && 'code' in err ? err.code : undefined
  const reason = typeof code === 'number' && Number.isFinite(code)
    ? `OBS request failed (code ${code}).`
    : 'OBS did not provide an error reason.'
  return `${reason} Check OBS Output settings, then try Test Recording.`
}
