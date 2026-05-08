export interface RetryOptions {
  attempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  shouldRetry?: (err: unknown) => boolean
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { attempts = 3, baseDelayMs = 500, maxDelayMs = 10_000, shouldRetry } = options
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (shouldRetry && !shouldRetry(err)) throw err
      if (i < attempts - 1) {
        const delay = Math.min(baseDelayMs * 2 ** i, maxDelayMs)
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }
  throw lastErr
}
