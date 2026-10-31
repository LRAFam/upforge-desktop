import { withTimeout } from './promise-timeout'

/** OBS may accept its socket before startup has finished. Only retry that state. */
export async function waitForObsReady<T>(probe: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + 15_000
  while (true) {
    try {
      return await withTimeout(probe(), Math.min(5000, Math.max(0, deadline - Date.now())), 'OBS readiness check timed out')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('OBS is not ready to perform the request')) throw error
      if (Date.now() >= deadline) throw new Error('OBS did not finish starting within 15 seconds')
      await new Promise(resolve => setTimeout(resolve, Math.min(500, deadline - Date.now())))
    }
  }
}
