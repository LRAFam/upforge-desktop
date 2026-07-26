/**
 * Sample OBS encode health while a match is recording.
 */

import type OBSWebSocket from 'obs-websocket-js'
import type { ObsHealthSample } from './match-telemetry'

export function startObsStatsSampler(
  obs: OBSWebSocket,
  onSample: (sample: ObsHealthSample) => void,
  intervalMs = 12_000,
): () => void {
  let stopped = false

  const tick = async () => {
    if (stopped) return
    try {
      const stats = await obs.call('GetStats') as {
        cpuUsage?: number
        activeFps?: number
        renderSkippedFrames?: number
        outputSkippedFrames?: number
        encodingLag?: number
      }
      onSample({
        at: Date.now(),
        outputFps: typeof stats.activeFps === 'number' ? stats.activeFps : null,
        targetFps: null,
        skippedFrames: typeof stats.outputSkippedFrames === 'number'
          ? stats.outputSkippedFrames
          : (typeof stats.renderSkippedFrames === 'number' ? stats.renderSkippedFrames : null),
        laggedFrames: typeof stats.encodingLag === 'number' ? stats.encodingLag : null,
        cpuPercent: typeof stats.cpuUsage === 'number' ? stats.cpuUsage : null,
        freeDiskGb: null,
        reconnectCount: null,
        backgroundAborted: null,
      })
    } catch {
      // OBS may be briefly unavailable mid-reconnect
    }
  }

  void tick()
  const timer = setInterval(() => { void tick() }, intervalMs)

  return () => {
    stopped = true
    clearInterval(timer)
  }
}
