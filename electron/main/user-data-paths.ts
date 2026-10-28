import { app } from 'electron'
import path from 'path'
import { recordingDirectoryProblem } from './recording-save-safety'

let lastUnsafeSavePath: string | null = null

export function userDataRoot(userId: number): string {
  return path.join(app.getPath('userData'), 'users', String(userId))
}

/** Durable, unclaimed captures are separate from legacy account migration. */
export function localMediaRoot(userId: number | null): string {
  return userId == null ? path.join(app.getPath('userData'), 'pending-local') : userDataRoot(userId)
}

export function legacyGlobalRecordingsDir(): string {
  return path.join(app.getPath('userData'), 'recordings')
}

/** Per-UpForge-account recording folder — isolates VODs when switching logins. */
export function userRecordingsDir(userId: number): string {
  return path.join(userDataRoot(userId), 'recordings')
}

/** Custom savePath is a storage root. Legacy app-data paths retain their existing layout. */
function configuredRecordingSavePath(
  settingsSavePath: string | undefined,
  userId: number | null,
): string {
  const legacyDefault = legacyGlobalRecordingsDir()
  const trimmed = String(settingsSavePath ?? '').trim()
  const perUserDefault = userId != null ? userRecordingsDir(userId) : path.join(localMediaRoot(null), 'recordings')

  const normalized = path.normalize(trimmed)
  const managedUsers = path.join(app.getPath('userData'), 'users') + path.sep
  const isManagedAccountDirectory = normalized.startsWith(managedUsers)
    && path.basename(normalized) === 'recordings'
  const isGuestDirectory = normalized === path.join(localMediaRoot(null), 'recordings')
  if (!trimmed || normalized === path.normalize(legacyDefault) || isManagedAccountDirectory || isGuestDirectory) {
    return perUserDefault
  }
  return userId != null
    ? path.join(trimmed, 'users', String(userId), 'recordings')
    : path.join(trimmed, 'pending-local', 'recordings')
}

export function recordingSavePathProblem(settingsSavePath: string | undefined, userId: number | null): string | null {
  return recordingDirectoryProblem(configuredRecordingSavePath(settingsSavePath, userId))
}

/** Resolve the capture owner's folder on the selected drive, with installation-folder protection. */
export function resolveRecordingSavePath(settingsSavePath: string | undefined, userId: number | null): string {
  const configuredPath = configuredRecordingSavePath(settingsSavePath, userId)
  if (recordingDirectoryProblem(configuredPath)) {
    // Older releases allowed update-deleted folders. Protect future captures;
    // keep the original setting and files intact for explicit recovery.
    const perUserDefault = path.join(localMediaRoot(userId), 'recordings')
    if (lastUnsafeSavePath !== configuredPath) {
      console.warn(`[RecordingStorage] Unsafe save folder ${configuredPath}; new recordings will use ${perUserDefault}. Existing files were not moved.`)
      lastUnsafeSavePath = configuredPath
    }
    return perUserDefault
  }
  return configuredPath
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
