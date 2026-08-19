/**
 * Reject if `promise` does not settle within `ms`.
 * The underlying promise is not cancelled; callers should treat timeout as abandon.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new Error('withTimeout: ms must be a non-negative finite number')
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try {
        onTimeout?.()
      } finally {
        reject(new Error(message))
      }
    }, ms)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}
