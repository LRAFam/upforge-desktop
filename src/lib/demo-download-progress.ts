export type DemoDownloadPhase = 'gc_lookup' | 'downloading' | 'decompressing'

export interface DemoDownloadProgress {
  phase: DemoDownloadPhase
  bytesDone: number
  bytesTotal: number | null
  pct: number | null
}

export type DemoDownloadGame = 'cs2' | 'deadlock' | 'valorant'

function assetLabel(game?: DemoDownloadGame): string {
  if (game === 'deadlock') return 'replay'
  return 'demo'
}

function formatMb(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** User-facing label for demo/replay download progress (CS2 + Deadlock). */
export function demoDownloadProgressLabel(
  progress: DemoDownloadProgress | null | undefined,
  game?: DemoDownloadGame,
): string {
  const asset = assetLabel(game)

  if (!progress) return `Downloading ${asset}…`

  if (progress.phase === 'gc_lookup') return 'Contacting Steam…'
  if (progress.phase === 'decompressing') {
    return progress.pct != null ? `Decompressing ${asset}… ${progress.pct}%` : `Decompressing ${asset}…`
  }

  if (progress.pct != null && progress.bytesTotal != null) {
    return `Downloading ${asset}… ${progress.pct}% (${formatMb(progress.bytesDone)} / ${formatMb(progress.bytesTotal)})`
  }
  if (progress.pct != null) return `Downloading ${asset}… ${progress.pct}%`
  if (progress.bytesDone > 0) return `Downloading ${asset}… ${formatMb(progress.bytesDone)}`
  return `Downloading ${asset}…`
}

/** Short badge for dashboard match cards. */
export function demoDownloadBadgeLabel(
  progress: DemoDownloadProgress | null | undefined,
  game?: DemoDownloadGame,
): string | null {
  if (!progress) return null
  if (progress.phase === 'gc_lookup') return 'Contacting Steam…'
  if (progress.pct != null) return `${progress.pct}%`
  const asset = assetLabel(game)
  return `Syncing ${asset}`
}
