export function formatLolMatchEndActivity(opts: {
  source: string
  gameId: string | null
  queueId: string | number | null
}): string {
  const gameId = opts.gameId && opts.gameId.trim() !== '' ? opts.gameId.trim() : 'none'
  const queue = opts.queueId != null && String(opts.queueId) !== '' ? String(opts.queueId) : 'none'
  return `Match ended (${opts.source}) - gameId=${gameId} queue=${queue}`
}

export function formatLolLinkActivity(opts: {
  status: 'fetched' | 'fetch_failed' | 'no_match_id' | 'no_auth'
  hasGameId: boolean
  queueId?: string | number | null
}): string {
  if (opts.status === 'fetched') return 'LoL link: fetched'
  if (opts.status === 'no_auth') return 'LoL link: no_auth (link Riot ID in Settings)'
  if (opts.status === 'fetch_failed') {
    return 'LoL link: fetch_failed (Riot Match-V5 not ready or rejected id)'
  }
  const queue = opts.queueId != null && String(opts.queueId) !== '' ? String(opts.queueId) : 'none'
  if (!opts.hasGameId) {
    return `LoL link: no_match_id (no gameId; history miss queue=${queue})`
  }
  return `LoL link: no_match_id (gameId present but unresolved; queue=${queue})`
}

export function formatLolClipsSkippedActivity(killCount: number): string {
  return `LoL clips skipped - ${killCount} kills missing video timestamps`
}
