export const cloudGames = [{ value: 'all', label: 'All games' }, { value: 'valorant', label: 'Valorant' }, { value: 'cs2', label: 'CS2' }, { value: 'deadlock', label: 'Deadlock' }, { value: 'lol', label: 'League of Legends' }, { value: 'unknown', label: 'Game not recorded' }] as const
export type CloudGame = typeof cloudGames[number]['value']
export type CloudKind = 'all' | 'clip' | 'recording'
export type CloudSort = 'newest' | 'largest' | 'expiry'
export interface CloudQuery { game?: CloudGame; kind: CloudKind; sort: CloudSort; page: number }
export interface CloudFile {
  game?: string | null
  /** `analysis_video` (API cloud retention): the full video kept by an analysis upload. */
  id: string; kind: 'clip' | 'recording' | 'analysis_video'; title: string | null; map: string | null
  /** Absent on API releases before agent artwork support. */
  agent?: string | null
  paid_storage?: boolean
  status: 'stored' | 'archived' | 'uploading' | 'failed'
  bytes: number | null; expires_at: string | null; created_at: string
  /** Analysed archives only (API round 7): the analysis id and its scoreboard summary when known. */
  analysis_id?: number
  /** Cloud retention (absent on older APIs; null on clips). Parse with `parseRetention`. */
  retention?: unknown
  analysis?: { won: boolean | null; rounds_won: number | null; rounds_lost: number | null; kills: number | null; deaths: number | null; assists: number | null } | null
}
export interface CloudPage { version: 1; game_filter?: CloudGame; items: CloudFile[]; page: number; last_page: number; total: number }
/** Clip ids are numeric, recording archives are UUIDs, analysis videos use the job id (numeric or UUID). */
export function validCloudFileId(kind: unknown, id: unknown): boolean {
  if (typeof id !== 'string') return false
  if (kind === 'clip') return /^[1-9]\d*$/.test(id)
  if (kind === 'recording') return /^[0-9a-f-]{36}$/i.test(id)
  return kind === 'analysis_video' && (/^[1-9]\d{0,18}$/.test(id) || /^[0-9a-f-]{36}$/i.test(id))
}
export function validCloudPage(input: unknown): input is CloudPage {
  if (!input || typeof input !== 'object') return false
  const p = input as CloudPage
  const count = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0
  const date = (d: unknown) => typeof d === 'string' && Number.isFinite(Date.parse(d))
  return p.version === 1 && count(p.total) && count(p.page) && p.page > 0 && count(p.last_page) && p.last_page > 0
    && Array.isArray(p.items) && p.items.every(f => f && typeof f.id === 'string'
      && validCloudFileId(f.kind, f.id)
      && (f.game === undefined || f.game === null || ['valorant','cs2','deadlock','lol'].includes(f.game))
      && (f.title === null || typeof f.title === 'string') && (f.map === null || typeof f.map === 'string')
      && (f.agent === undefined || f.agent === null || typeof f.agent === 'string')
      && (f.paid_storage === undefined || typeof f.paid_storage === 'boolean')
      && ['stored', 'archived', 'uploading', 'failed'].includes(f.status)
      && (f.bytes === null || count(f.bytes)) && (f.expires_at === null || date(f.expires_at)) && date(f.created_at))
}
export function cloudBytes(bytes: number | null): string {
  if (bytes === null) return 'Size unavailable'
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(1)} MB`
}
export function cloudFileTitle(file: CloudFile): string {
  return file.title?.trim() || `${file.map ? `${file.map} · ` : ''}${cloudKindLabel(file.kind)}`
}

export function cloudKindLabel(kind: CloudFile['kind']): string {
  return kind === 'clip' ? 'Clip' : kind === 'analysis_video' ? 'Analysis video' : 'Recording'
}

/** Retention is separate from upload status; elapsed retention does not prove deletion. */
export function cloudRetention(value: string | null, now: number) {
  if (value === null) return { state: 'kept', label: 'No scheduled expiry' } as const
  const remaining = Date.parse(value) - now
  if (remaining <= 0) return { state: 'expired', label: 'Retention ended' } as const
  const days = Math.ceil(remaining / 86400000)
  if (days <= 7) return { state: 'soon', label: days === 1 ? 'Expires within 24 hours' : `Expires in ${days} days` } as const
  return { state: 'scheduled', label: `Expires ${new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` } as const
}
