import { ActivationError } from './activation-error-codes'
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
  throw new ActivationError('obs_recording_no_data', 'OBS recording bytes did not advance before the progress deadline.')
}

export interface WaitForStoppedOptions {
  /**
   * Repeat the stop request once if OBS is still active after `resendAfterMs`. OBS can
   * acknowledge StopRecord and keep the output running; a repeat usually stops it.
   */
  resendStop?: () => Promise<unknown>
  resendAfterMs?: number
  onSample?: (status: { outputActive: boolean; outputBytes?: number }) => void
}

/** StopRecord acknowledges a request; only a subsequent inactive status confirms completion. */
export async function waitForRecordingStopped(
  getStatus: () => Promise<{ outputActive: boolean; outputBytes?: number }>,
  timeoutMs = 15_000,
  options: WaitForStoppedOptions = {},
): Promise<void> {
  const startedAt = Date.now()
  const deadline = startedAt + timeoutMs
  let resent = false
  while (Date.now() < deadline) {
    const status = await withTimeout(getStatus(), Math.min(3000, deadline - Date.now()), 'OBS recording status timed out')
    options.onSample?.(status)
    if (status.outputActive === false) return
    if (!resent && options.resendStop && Date.now() - startedAt >= (options.resendAfterMs ?? 5_000)) {
      resent = true
      // The status poll decides the outcome; a failed or hung repeat must not end the wait.
      void options.resendStop().catch(() => undefined)
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('OBS did not stop recording. Restart OBS before recording another match.')
}
