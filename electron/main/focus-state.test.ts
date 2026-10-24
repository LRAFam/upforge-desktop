import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { focusReportDiagnostic, readFocusSyncState, writeFocusSyncState } from './focus-state'
import type { FocusUpdate } from '../../src/lib/focus'

const roots: string[] = []
async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), 'upforge-focus-'))
  roots.push(root)
  return root
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('upforge-focus-')) throw new Error('Unexpected test directory')
    await rm(root, { recursive: true, force: true })
  }
})

const latest: FocusUpdate = {
  match_id: 'match-a', focus_event: 'checked',
  focus: {
    id: 3, label: 'Deaths traded', metric: 'traded_death_rate', better: 'higher', baseline: 0, target: 0.15,
    checks: [{ match_id: 'match-a', value: 0.2, hit: true, played_at: null }],
    progress: { games_played: 1, hits: 1, games_required: 3, hits_required: 2, status: 'active' },
    started_at: null, completed_at: null,
  },
  report: { notes: { headline: { finding_id: 'trade', text: 'Private coach headline' }, next_action: { finding_id: 'trade', text: 'Private next action' } } },
}

describe('account focus persistence', () => {
  it('retains legacy match IDs without requiring a resync or state reset', async () => {
    const root = await temporaryRoot()
    await writeFile(join(root, 'focus-sync-1.json'), JSON.stringify({ synced: ['old'], newestSyncedStartMs: 123 }))
    expect(await readFocusSyncState(root, 1)).toEqual({ synced: ['old'], newestSyncedStartMs: 123, latest: null })
  })

  it('restores notes from disk after restart and keeps accounts separate', async () => {
    const root = await temporaryRoot()
    await writeFocusSyncState(root, 1, { synced: ['match-a'], newestSyncedStartMs: 123, latest })
    await writeFocusSyncState(root, 2, { synced: ['other'], newestSyncedStartMs: 456, latest: null })
    expect((await readFocusSyncState(root, 1)).latest?.report?.notes?.next_action?.text).toBe('Private next action')
    expect((await readFocusSyncState(root, 2)).latest).toBeNull()
    expect((await readFocusSyncState(root, 3)).latest).toBeNull()
    expect((await readdir(root)).sort()).toEqual(['focus-sync-1.json', 'focus-sync-2.json'])
  })

  it('replaces an existing state atomically and ignores a malformed cached report', async () => {
    const root = await temporaryRoot()
    await writeFocusSyncState(root, 1, { synced: ['old'], newestSyncedStartMs: 100 })
    await writeFocusSyncState(root, 1, { synced: ['old', 'match-a'], newestSyncedStartMs: 123, latest })
    expect((await readFocusSyncState(root, 1)).synced).toEqual(['old', 'match-a'])
    await writeFile(join(root, 'focus-sync-1.json'), JSON.stringify({ synced: ['old'], newestSyncedStartMs: 123, latest: { focus: { id: 3 }, match_id: 'bad' } }))
    expect(await readFocusSyncState(root, 1)).toEqual({ synced: ['old'], newestSyncedStartMs: 123, latest: null })
  })
})

it('logs focus outcomes without printing report text or arbitrary API strings', () => {
  const line = focusReportDiagnostic({ ...latest, focus_event: 'untrusted response text' as never })
  expect(line).toContain('focus_id=3 event=unknown status=active checks=1 hits=1')
  expect(line).toContain('notes=present')
  expect(line).not.toMatch(/Private|untrusted|next action/)
})
