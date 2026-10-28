import type OBSWebSocket from 'obs-websocket-js'

const pendingOperations = new WeakMap<OBSWebSocket, Promise<void>>()
const testOutputs = new WeakSet<OBSWebSocket>()

/** A setup test is never a match, including while its stop is still unconfirmed. */
export function isObsTestRecording(obs: OBSWebSocket): boolean {
  return testOutputs.has(obs)
}

export function markObsTestRecording(obs: OBSWebSocket): void {
  testOutputs.add(obs)
}

/** Call only after confirming idle output or a rejected test start. */
export function clearObsTestRecording(obs: OBSWebSocket): void {
  testOutputs.delete(obs)
}

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
