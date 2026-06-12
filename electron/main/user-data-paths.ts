import { app } from 'electron'
import path from 'path'

export function userDataRoot(userId: number): string {
  return path.join(app.getPath('userData'), 'users', String(userId))
}

export function legacyGlobalRecordingsDir(): string {
  return path.join(app.getPath('userData'), 'recordings')
}

/** Per-UpForge-account recording folder — isolates VODs when switching logins. */
export function userRecordingsDir(userId: number): string {
  return path.join(userDataRoot(userId), 'recordings')
}

/**
 * Resolve where match recordings are written.
 * Default: per-user folder. Legacy global `userData/recordings` is not shared across accounts.
 * Custom savePath from Settings is honoured as-is (shared — power-user choice).
 */
export function resolveRecordingSavePath(
  settingsSavePath: string | undefined,
  userId: number | null,
): string {
  const legacyDefault = legacyGlobalRecordingsDir()
  const trimmed = String(settingsSavePath ?? '').trim()
  const perUserDefault = userId != null ? userRecordingsDir(userId) : legacyDefault

  if (!trimmed || path.normalize(trimmed) === path.normalize(legacyDefault)) {
    return perUserDefault
  }
  return trimmed
}

export interface LinkedRiotId {
  name: string | null
  tag: string | null
}

/** True when a recording belongs to the linked Riot account (or ownership is unknown). */
export function recordingMatchesLinkedRiot(
  riotName: string | undefined,
  riotTag: string | undefined,
  linked: LinkedRiotId | null | undefined,
): boolean {
  if (!linked?.name || !linked?.tag) return true
  const name = String(riotName ?? '').trim()
  const tag = String(riotTag ?? '').trim()
  if (!name || !tag) return true
  return (
    name.toLowerCase() === linked.name.toLowerCase()
    && tag.toLowerCase() === linked.tag.toLowerCase()
  )
}

export function userOverlayPath(userId: number): string {
  return path.join(userDataRoot(userId), 'overlay.json')
}

export function userPendingJobPath(userId: number): string {
  return path.join(userDataRoot(userId), 'pending-job.json')
}
