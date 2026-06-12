/** Refuse to start recording below this threshold. */
export const CRITICAL_FREE_DISK_BYTES = 500 * 1024 * 1024

/** Warn user — recordings may fail or truncate. */
export const LOW_FREE_DISK_BYTES = 2 * 1024 * 1024 * 1024

/** Softer warning before match start. */
export const WARN_FREE_DISK_BYTES = 5 * 1024 * 1024 * 1024

export async function getFreeDiskSpace(dir: string): Promise<number> {
  const { statfs } = await import('fs/promises')
  try {
    const { bavail, bsize } = await statfs(dir)
    return bavail * bsize
  } catch {
    return 0
  }
}

export function formatFreeDiskLabel(freeBytes: number): string {
  if (freeBytes < 1024 * 1024) return `${Math.max(0, Math.round(freeBytes / 1024))} KB free`
  if (freeBytes < 1024 * 1024 * 1024) return `${(freeBytes / (1024 * 1024)).toFixed(0)} MB free`
  return `${(freeBytes / (1024 ** 3)).toFixed(1)} GB free`
}
