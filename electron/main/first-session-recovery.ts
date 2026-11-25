import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { PendingRecording } from './recordings-store'

export interface RecoverySession { owner: number; token: string }
export interface RecoveryAssignment {
  assignment_id: string
  variant: 'control' | 'treatment'
  recording_id: string
  events: Partial<Record<'exposed' | 'entered' | 'resolved' | 'dismissed', { id: string; sent: boolean }>>
  resolved: boolean
  dismissed: boolean
}
export interface RecoveryTile { assignmentId: string; recordingId: string }
interface Dependencies {
  userDataPath: string
  appVersion: string
  session: () => RecoverySession | null
  recordings: (owner: number) => PendingRecording[]
  safeForeground: () => boolean
  busy: (recordingId: string) => boolean
  post: (session: RecoverySession, endpoint: string, data: Record<string, unknown>) => Promise<unknown>
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ERROR = 'upload_network_interrupted'
const BASE = '/api/experiments/first-session-recovery'

/** The source of eligibility is the owned catalogue and real file, never renderer error text. */
export function recoverableUpload(recording: PendingRecording | undefined, busy: boolean): boolean {
  if (!recording || recording.game !== 'valorant' || recording.lastFailureCode !== ERROR
    || !recording.lastAnalysisError || recording.pipelineStatus || recording.analysisId
    || recording.clipsOnly || recording.fileFinalizing || recording.onboardingAdminTest || busy) return false
  try { const file = fs.statSync(recording.path); return file.isFile() && file.size > 0 } catch { return false }
}

/** Stores only one owner-scoped experiment identity, so control outcomes survive restarts too. */
export class FirstSessionRecovery {
  private readonly state = new Map<number, RecoveryAssignment | null>()
  private readonly reading = new Set<number>()
  constructor(private readonly deps: Dependencies) {}
  private file(owner: number) { return path.join(this.deps.userDataPath, 'users', String(owner), 'first-session-recovery.json') }
  private load(owner: number): RecoveryAssignment | null {
    if (this.state.has(owner)) return this.state.get(owner) ?? null
    let state: RecoveryAssignment | null = null
    try {
      const data = JSON.parse(fs.readFileSync(this.file(owner), 'utf8'))
      if (UUID.test(data.assignment_id) && ['control', 'treatment'].includes(data.variant)
        && typeof data.recording_id === 'string' && data.recording_id.length <= 80
        && data.events && typeof data.events === 'object' && !Array.isArray(data.events)
        && Object.entries(data.events).every(([kind, value]) => ['exposed', 'entered', 'resolved', 'dismissed'].includes(kind)
          && value && typeof value === 'object' && UUID.test((value as { id: string }).id) && typeof (value as { sent: boolean }).sent === 'boolean')
        && typeof data.resolved === 'boolean' && typeof data.dismissed === 'boolean') state = data
    } catch { /* No valid saved assignment: never fabricate a cohort. */ }
    this.state.set(owner, state)
    return state
  }
  private save(owner: number, state: RecoveryAssignment): void {
    const file = this.file(owner)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(temp, JSON.stringify(state), 'utf8')
    fs.renameSync(temp, file)
    this.state.set(owner, state)
  }
  private current(session: RecoverySession) {
    const current = this.deps.session()
    return current?.owner === session.owner && current.token === session.token
  }
  private recording(session: RecoverySession, id: string) { return this.deps.recordings(session.owner).find(row => row.id === id) }
  private eligible(session: RecoverySession, id: string) {
    return this.current(session) && this.deps.safeForeground() && recoverableUpload(this.recording(session, id), this.deps.busy(id))
  }
  private async event(session: RecoverySession, state: RecoveryAssignment, type: keyof RecoveryAssignment['events']): Promise<void> {
    if (!this.current(session)) return
    const event = state.events[type] ?? { id: randomUUID(), sent: false }
    if (event.sent) return
    state.events[type] = event
    this.save(session.owner, state)
    try {
      await this.deps.post(session, `${BASE}/${state.assignment_id}/events`, { type, event_id: event.id, app_version: this.deps.appVersion })
      event.sent = true
      this.save(session.owner, state)
    } catch { /* The same event identity is retained for a later safe foreground retry. */ }
  }
  async currentTile(): Promise<RecoveryTile | null> {
    const session = this.deps.session()
    if (!session || !Number.isSafeInteger(session.owner) || session.owner <= 0 || !this.deps.safeForeground() || this.reading.has(session.owner)) return null
    this.reading.add(session.owner)
    try {
      let state = this.load(session.owner)
      if (state) {
        const recording = this.recording(session, state.recording_id)
        if (recording && (recording.analysisId || recording.pipelineStatus === 'analysing')) {
          state.resolved = true
          this.save(session.owner, state)
        }
        if (state.resolved) { await this.event(session, state, 'resolved'); return null }
        if (state.dismissed) { await this.event(session, state, 'dismissed'); return null }
      }
      const recording = state ? this.recording(session, state.recording_id)
        : this.deps.recordings(session.owner).find(row => recoverableUpload(row, this.deps.busy(row.id)))
      if (!recording || !this.eligible(session, recording.id)) return null
      const response = await this.deps.post(session, `${BASE}/current`, {
        recording_id: recording.id, game: 'valorant', app_version: this.deps.appVersion, error_code: ERROR,
      }) as { recovery?: { assignment_id: string; variant: 'control' | 'treatment'; task: { recording_id: string; error_code: string; action: string } | null } }
      if (!this.eligible(session, recording.id) || !response?.recovery) return null
      const recovery = response.recovery
      if (!UUID.test(recovery.assignment_id) || !['control', 'treatment'].includes(recovery.variant)) return null
      if (recovery.variant === 'treatment' && (recovery.task?.recording_id !== recording.id || recovery.task.error_code !== ERROR || recovery.task.action !== 'resume_upload')) return null
      if (state && (state.assignment_id !== recovery.assignment_id || state.variant !== recovery.variant)) return null
      state ??= { assignment_id: recovery.assignment_id, variant: recovery.variant, recording_id: recording.id, events: {}, resolved: false, dismissed: false }
      this.save(session.owner, state)
      return state.variant === 'treatment' ? { assignmentId: state.assignment_id, recordingId: recording.id } : null
    } catch { return null } finally { this.reading.delete(session.owner) }
  }
  async exposed(assignmentId: string): Promise<void> {
    const session = this.deps.session(); if (!session) return
    const state = this.load(session.owner)
    if (state?.assignment_id === assignmentId && state.variant === 'treatment' && !state.dismissed && !state.resolved && this.eligible(session, state.recording_id)) await this.event(session, state, 'exposed')
  }
  enter(assignmentId: string): { ok: boolean; recordingId?: string } {
    const session = this.deps.session(); if (!session) return { ok: false }
    const state = this.load(session.owner)
    if (state?.assignment_id !== assignmentId || state.variant !== 'treatment' || state.dismissed || state.resolved || !this.eligible(session, state.recording_id)) return { ok: false }
    // Telemetry failure must not block the player's existing explicit recovery action.
    void this.event(session, state, 'entered').catch(() => {})
    return { ok: true, recordingId: state.recording_id }
  }
  async dismiss(assignmentId: string): Promise<void> {
    const session = this.deps.session(); if (!session) return
    const state = this.load(session.owner)
    if (state?.assignment_id !== assignmentId || state.variant !== 'treatment' || !this.current(session)) return
    state.dismissed = true; this.save(session.owner, state)
    await this.event(session, state, 'dismissed')
  }
  async reportView(input: { result: string; result_id: string; foreground_ms: number; event_id: string }): Promise<'accepted' | 'ignored' | 'retry'> {
    const session = this.deps.session(); if (!session) return 'ignored'
    if (!this.deps.safeForeground()) return 'retry'
    const state = this.load(session.owner)
    if (!state || !['match_report', 'vod_report'].includes(input.result) || typeof input.result_id !== 'string'
      || !/^[A-Za-z0-9_-]{1,64}$/.test(input.result_id) || !Number.isInteger(input.foreground_ms)
      || input.foreground_ms < 10000 || input.foreground_ms > 300000 || !UUID.test(input.event_id)) return 'ignored'
    try {
      await this.deps.post(session, `${BASE}/${state.assignment_id}/report-view`, { ...input, app_version: this.deps.appVersion })
      return 'accepted'
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status
      if (status === 404 || status === 409) return 'ignored' // Disabled/expired pilot or stale app version.
      throw error
    }
  }
}
