import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FirstSessionRecovery, recoverableUpload, type RecoverySession } from './first-session-recovery'
import type { PendingRecording } from './recordings-store'
const id = '11111111-1111-4111-8111-111111111111'
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
function setup(variant: 'control' | 'treatment' = 'treatment') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-recovery-')); roots.push(root)
  const file = path.join(root, 'recording.mp4'); fs.writeFileSync(file, 'nonempty local recording')
  let session: RecoverySession | null = { owner: 1, token: 'owner-a' }
  let safe = true, busy = false
  const recording = { id: 'recording-a', game: 'valorant', path: file, lastFailureCode: 'upload_network_interrupted', lastAnalysisError: 'socket hang up', analysed: false } as PendingRecording
  const response = { recovery: { assignment_id: id, variant, task: variant === 'treatment' ? { id, recording_id: recording.id, error_code: recording.lastFailureCode, action: 'resume_upload' } : null } }
  const post = vi.fn(async (_session: RecoverySession, endpoint: string, _body: Record<string, unknown>) => endpoint.endsWith('/current') ? response : undefined)
  const deps = { userDataPath: root, appVersion: '3.4.29', session: () => session, recordings: (owner: number) => owner === 1 ? [recording] : [], safeForeground: () => safe, busy: () => busy, post }
  return { recovery: new FirstSessionRecovery(deps), deps, root, recording, response, post, safe: (value: boolean) => { safe = value }, busy: (value: boolean) => { busy = value }, session: (value: RecoverySession | null) => { session = value } }
}
describe('owned first-session upload recovery', () => {
  it('uses only the real exact recoverable error, owned file and idle pipeline', async () => {
    const s = setup()
    expect(await s.recovery.currentTile()).toEqual({ assignmentId: id, recordingId: 'recording-a' })
    expect(s.post).toHaveBeenCalledWith({ owner: 1, token: 'owner-a' }, expect.stringContaining('/current'), { recording_id: 'recording-a', game: 'valorant', app_version: '3.4.29', error_code: 'upload_network_interrupted' })
    for (const change of [{ lastFailureCode: 'upload_stalled' }, { lastAnalysisError: null }, { pipelineStatus: 'uploading' }, { pipelineStatus: 'pending' }, { game: 'cs2' }, { fileFinalizing: true }, { clipsOnly: true }, { analysisId: 22 }, { path: '/missing' }]) expect(recoverableUpload({ ...s.recording, ...change } as PendingRecording, false)).toBe(false)
    expect(recoverableUpload(s.recording, true)).toBe(false)
  })
  it('never requests or exposes a task in background, active game or busy state', async () => {
    const s = setup(); s.safe(false); expect(await s.recovery.currentTile()).toBeNull(); expect(s.post).not.toHaveBeenCalled()
    s.safe(true); s.busy(true); expect(await s.recovery.currentTile()).toBeNull(); expect(s.post).not.toHaveBeenCalled()
  })
  it('control gets no tile but persists the same assignment and records actual resolved upload after restart', async () => {
    const s = setup('control'); expect(await s.recovery.currentTile()).toBeNull()
    const restored = new FirstSessionRecovery(s.deps); s.recording.pipelineStatus = 'analysing'; s.recording.lastAnalysisError = null
    expect(await restored.currentTile()).toBeNull()
    expect(s.post).toHaveBeenCalledWith(expect.anything(), expect.stringContaining(`/${id}/events`), expect.objectContaining({ type: 'resolved' }))
    expect(restored.enter(id)).toEqual({ ok: false })
  })
  it('rechecks safety and file availability at explicit entry; never launches an upload itself', async () => {
    const s = setup(); await s.recovery.currentTile(); expect(s.recovery.enter('another-id')).toEqual({ ok: false })
    s.safe(false); expect(s.recovery.enter(id)).toEqual({ ok: false }); s.safe(true)
    fs.unlinkSync(s.recording.path); expect(s.recovery.enter(id)).toEqual({ ok: false })
    expect(s.post.mock.calls.some(call => call[2].type === 'entered')).toBe(false)
  })
  it('account switch or logout/relogin rejects late eligibility and original-token results', async () => {
    const s = setup(); let resolve!: (value: typeof s.response) => void
    s.post.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const pending = s.recovery.currentTile(); s.session({ owner: 2, token: 'owner-b' }); resolve(s.response)
    expect(await pending).toBeNull(); expect(s.recovery.enter(id)).toEqual({ ok: false })
    s.session({ owner: 1, token: 'new-owner-a' }); expect(s.recovery.enter(id)).toEqual({ ok: false })
  })
  it('server cannot substitute another recording, error family or action', async () => {
    for (const change of [{ recording_id: 'other' }, { error_code: 'unknown' }, { action: 'open_url' }]) {
      const s = setup(); Object.assign(s.response.recovery.task!, change); expect(await s.recovery.currentTile()).toBeNull()
    }
  })
  it('exposure is idempotent across retries/restart and never emitted for control', async () => {
    const s = setup(); await s.recovery.currentTile(); s.post.mockRejectedValueOnce(new Error('offline'))
    await s.recovery.exposed(id); await s.recovery.exposed(id)
    const events = s.post.mock.calls.filter(call => call[2].type === 'exposed')
    expect(events).toHaveLength(2); expect(events[0][2].event_id).toBe(events[1][2].event_id)
    await new FirstSessionRecovery(s.deps).exposed(id); expect(s.post.mock.calls.filter(call => call[2].type === 'exposed')).toHaveLength(2)
    const control = setup('control'); await control.recovery.currentTile(); await control.recovery.exposed(id)
    expect(control.post.mock.calls.some(call => call[2].type === 'exposed')).toBe(false)
  })
  it('dismissal persists and never becomes resolution or a new prompt', async () => {
    const s = setup(); await s.recovery.currentTile(); await s.recovery.dismiss(id)
    expect(await new FirstSessionRecovery(s.deps).currentTile()).toBeNull(); expect(s.recovery.enter(id)).toEqual({ ok: false })
    expect(s.post.mock.calls.filter(call => call[2].type === 'dismissed')).toHaveLength(1)
    expect(s.post.mock.calls.some(call => call[2].type === 'resolved')).toBe(false)
  })
  it('stops a report observation when the server disables the pilot or rejects its app version', async () => {
    const s = setup(); await s.recovery.currentTile()
    const visit = { result: 'match_report', result_id: 'owned-match', foreground_ms: 10000, event_id: '22222222-2222-4222-8222-222222222222' }
    for (const status of [404, 409]) {
      s.post.mockRejectedValueOnce({ response: { status } })
      expect(await s.recovery.reportView(visit)).toBe('ignored')
    }
    s.safe(false); expect(await s.recovery.reportView(visit)).toBe('retry')
  })
  it('both arms send only qualified foreground report observations; offline errors remain retryable', async () => {
    for (const variant of ['control', 'treatment'] as const) {
      const s = setup(variant); await s.recovery.currentTile()
      const visit = { result: 'match_report', result_id: 'owned-match', foreground_ms: 10000, event_id: '22222222-2222-4222-8222-222222222222' }
      await s.recovery.reportView({ ...visit, foreground_ms: 9999 }); expect(s.post).toHaveBeenCalledTimes(1)
      s.safe(false); await s.recovery.reportView(visit); expect(s.post).toHaveBeenCalledTimes(1); s.safe(true)
      s.post.mockRejectedValueOnce(new Error('offline')); await expect(s.recovery.reportView(visit)).rejects.toThrow('offline')
      await s.recovery.reportView(visit); expect(s.post).toHaveBeenLastCalledWith({ owner: 1, token: 'owner-a' }, expect.stringContaining(`/${id}/report-view`), { ...visit, app_version: '3.4.29' })
    }
  })
})
