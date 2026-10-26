import type OBSWebSocket from 'obs-websocket-js'

const pendingOperations = new WeakMap<OBSWebSocket, Promise<void>>()

/** Keep a recording check and match startup from issuing conflicting output commands. */
export function withObsRecordingOperation<T>(obs: OBSWebSocket, run: () => Promise<T>): Promise<T> {
  const previous = pendingOperations.get(obs) ?? Promise.resolve()
  const operation = previous.then(run)
  // A failed operation releases the queue; it must not reject unrelated future work.
  const settled = operation.then(() => {}, () => {})
  pendingOperations.set(obs, settled)
  return operation.finally(() => {
    if (pendingOperations.get(obs) === settled) pendingOperations.delete(obs)
  })
}
