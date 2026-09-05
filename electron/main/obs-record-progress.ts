import { withTimeout } from './promise-timeout'

export interface RecordProgress {
  outputActive: boolean
  outputPaused?: boolean
  outputBytes: number
}

/** An active flag (or a running timer) does not prove that OBS is writing video. */
export async function waitForRecordingProgress(
  getStatus: () => Promise<RecordProgress>,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let baseline: number | undefined
  while (Date.now() < deadline) {
    const status = await withTimeout(getStatus(), Math.min(3000, deadline - Date.now()), 'OBS recording status timed out')
    if (!status.outputActive) throw new Error('OBS recording is not active')
    if (Number.isFinite(status.outputBytes)) {
      if (!status.outputPaused && baseline !== undefined && status.outputBytes > baseline) return
      baseline ??= status.outputBytes
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('OBS is not producing recording data. Restart OBS before recording another match.')
}

/** StopRecord acknowledges a request; only a subsequent inactive status confirms completion. */
export async function waitForRecordingStopped(
  getStatus: () => Promise<{ outputActive: boolean }>,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const status = await withTimeout(getStatus(), Math.min(3000, deadline - Date.now()), 'OBS recording status timed out')
    if (status.outputActive === false) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('OBS did not stop recording. Restart OBS before recording another match.')
}
