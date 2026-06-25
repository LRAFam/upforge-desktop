/** Benign OBS WebSocket errors when a scene item/source was removed between list + update. */
export function isBenignObsWebSocketError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '')
  return (
    /Object Not Found Matching Id/i.test(message)
    || /No scene items were found/i.test(message)
    || /resource not found/i.test(message)
  )
}
