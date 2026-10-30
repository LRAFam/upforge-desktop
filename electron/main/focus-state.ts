import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Focus, FocusUpdate } from '../../src/lib/focus'
import { sanitizeRoundFacts } from '../../src/lib/focus'
import type { SyncState } from './match-report-sync'

function statePath(root: string, userId: number): string {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error('Invalid focus account')
  return join(root, `focus-sync-${userId}.json`)
}

function isFocus(value: any): value is Focus {
  return value && Number.isSafeInteger(value.id) && typeof value.label === 'string'
    && (value.better === 'lower' || value.better === 'higher')
    && Number.isFinite(value.baseline) && Number.isFinite(value.target)
    && Array.isArray(value.checks) && value.checks.every((check: any) => check
      && typeof check.match_id === 'string' && Number.isFinite(check.value) && typeof check.hit === 'boolean')
    && value.progress && typeof value.progress.status === 'string'
    && ['games_played', 'hits', 'games_required', 'hits_required'].every(key => Number.isFinite(value.progress[key]))
}

export async function readFocusSyncState(root: string, userId: number): Promise<SyncState> {
  const file = statePath(root, userId)
  try {
    const data = JSON.parse(await readFile(file, 'utf8'))
    const latest = data.latest
    const validLatest = latest && typeof latest.match_id === 'string'
      && (latest.focus === null || isFocus(latest.focus))
      && (latest.previous_focus == null || isFocus(latest.previous_focus))
    return {
      synced: Array.isArray(data.synced) ? data.synced.filter((id: unknown) => typeof id === 'string') : [],
      newestSyncedStartMs: Number.isFinite(data.newestSyncedStartMs) ? data.newestSyncedStartMs : null,
      latest: validLatest
        ? { ...latest, rounds: sanitizeRoundFacts(latest.rounds), account: typeof latest.account?.is_main === 'boolean' ? { is_main: latest.account.is_main } : null }
        : null,
    }
  } catch {
    return { synced: [], newestSyncedStartMs: null, latest: null }
  }
}

/** Replace atomically so an interrupted write cannot erase synced IDs and coach notes. */
export async function writeFocusSyncState(root: string, userId: number, state: SyncState): Promise<void> {
  const file = statePath(root, userId)
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(state), { mode: 0o600 })
    await rename(temporary, file)
  } finally {
    await rm(temporary, { force: true }).catch(() => {})
  }
}

/** Log only bounded identifiers and known outcomes, never notes or arbitrary response data. */
export function focusReportDiagnostic(update: FocusUpdate): string {
  const id = (value: unknown) => Number.isSafeInteger(value) ? String(value) : 'none'
  const outcome = (value: unknown) => ['active', 'created', 'checked', 'achieved', 'missed'].includes(String(value)) ? String(value) : 'unknown'
  const focus = update.focus
  return `focus_id=${id(focus?.id)} event=${outcome(update.focus_event)} status=${outcome(focus?.progress?.status)}`
    + ` checks=${id(focus?.progress?.games_played)} hits=${id(focus?.progress?.hits)}`
    + ` previous_focus_id=${id(update.previous_focus?.id)} previous_status=${outcome(update.previous_focus?.progress?.status)}`
    + ` notes=${update.report?.notes?.headline || update.report?.notes?.next_action ? 'present' : 'absent'}`
}
