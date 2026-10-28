import type OBSWebSocket from 'obs-websocket-js'
import type { OBSRequestTypes, OBSResponseTypes } from 'obs-websocket-js'
import { withTimeout } from './promise-timeout'

/** The OBS client leaves requests pending on disconnect; no helper may hold a queue forever. */
export function boundObsRequests(obs: OBSWebSocket, timeoutMs = 10_000): OBSWebSocket {
  const call = obs.call.bind(obs)
  // Keep this above the 5s StartRecord/StopRecord deadlines: those callers own
  // ambiguous-request cleanup and must observe their own timeout first.
  obs.call = <T extends keyof OBSRequestTypes>(request: T, ...args: [data?: OBSRequestTypes[T]]): Promise<OBSResponseTypes[T]> =>
    withTimeout(call(request, ...args), timeoutMs, `OBS ${request} timed out`)
  return obs
}
