import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { appointmentDrillId, appointmentUuid, type PracticeAppointment, type AppointmentSchedule } from '../../src/lib/practice-appointment'
interface Session { owner: number; token: string }
interface Dependencies {
  userDataPath: string
  session(): Session | null
  safeForeground(): boolean
  request(session: Session, method: 'get' | 'post' | 'put', endpoint: string, data?: unknown): Promise<unknown>
  notify(title: string, onClick: () => void): Promise<'delivered' | 'failed' | 'unknown'>
  openPractice(drillId: number): void
}
const prefix = '/api/experiments/practice-appointment'
export class PracticeAppointments {
  constructor(private deps: Dependencies) {}
  private same(s: Session): boolean { const now = this.deps.session(); return now?.owner === s.owner && now.token === s.token }
  private async request(s: Session, method: 'get' | 'post' | 'put', suffix: string, data?: unknown): Promise<unknown> {
    if (!this.same(s)) throw new Error('Account changed')
    const result = await this.deps.request(s, method, prefix + suffix, data)
    if (!this.same(s)) throw new Error('Account changed')
    return result
  }
  async current(): Promise<PracticeAppointment | null> {
    const s = this.deps.session()
    if (!s || !this.deps.safeForeground()) return null
    const result = await this.request(s, 'get', '/current') as PracticeAppointment
    return this.deps.safeForeground() ? result : null
  }
  async choose(drillId: unknown): Promise<{ ok: boolean }> {
    const s = this.deps.session()
    if (!s || !this.deps.safeForeground() || !appointmentDrillId(drillId)) return { ok: false }
    try { await this.request(s, 'post', '/choose', { drill_id: drillId, event_id: randomUUID() }) }
    catch { /* Disabled/offline measurement does not prevent ordinary practice. */ }
    return { ok: this.same(s) && this.deps.safeForeground() }
  }
  async change(id: unknown, action: unknown, data?: AppointmentSchedule): Promise<PracticeAppointment | null> {
    const s = this.deps.session()
    if (!s || !appointmentUuid(id) || !['schedule', 'skip', 'stop'].includes(String(action)) || !this.deps.safeForeground()) return null
    if (action === 'schedule' && (!data || typeof data.local_datetime !== 'string' || typeof data.timezone !== 'string' || typeof data.reminder_opt_in !== 'boolean' || !Number.isInteger(data.utc_offset_minutes))) return null
    return await this.request(s, action === 'schedule' ? 'put' : 'post', `/${id}/${action}`, action === 'schedule' ? data : undefined) as PracticeAppointment
  }
  async reportView(input: { match_id: string; foreground_ms: number; event_id: string }): Promise<'accepted' | 'retry'> {
    const s = this.deps.session()
    if (!s || !this.deps.safeForeground()) return 'retry'
    if (!input || !/^[A-Za-z0-9_-]{1,64}$/.test(input.match_id) || !appointmentUuid(input.event_id) || !Number.isInteger(input.foreground_ms) || input.foreground_ms < 10000 || input.foreground_ms > 300000) return 'retry'
    await this.request(s, 'post', '/report-view', input)
    return 'accepted'
  }
  /** Called only on a safe foreground boundary, never a background timer. */
  async boundary(): Promise<void> {
    const s = this.deps.session()
    if (!s || !this.deps.safeForeground()) return
    const a = await this.current()
    if (!this.same(s) || !this.deps.safeForeground() || !a || a.arm !== 'treatment' || a.state !== 'scheduled' || !a.reminder_opt_in || !appointmentUuid(a.assignment_id) || !appointmentDrillId(a.task?.id) || !a.due_at || !Number.isFinite(Date.parse(a.due_at)) || Date.parse(a.due_at) > Date.now() || a.reminder_status) return
    const dir = path.join(this.deps.userDataPath, 'users', String(s.owner), 'practice-appointment-attempts')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, a.assignment_id)
    // Atomic exclusive marker before network I/O: an ambiguous reservation is never retried, even after restart.
    try { fs.writeFileSync(file, 'attempted', { flag: 'wx' }) } catch { return }
    const receipt = await this.request(s, 'post', `/${a.assignment_id}/reminder`, { foreground: true, active_match: false }) as { receipt_id?: string; assignment_id?: string; drill_id?: number } | null
    if (!receipt) { fs.unlinkSync(file); return } // A confirmed 204 made no reservation.
    if (!appointmentUuid(receipt.receipt_id) || receipt.assignment_id !== a.assignment_id || receipt.drill_id !== a.task!.id) return
    let status: 'delivered' | 'failed' | 'unknown' = 'unknown'
    if (this.same(s) && this.deps.safeForeground()) {
      // Re-resolve after reservation: logout, Stop or completion while awaiting must suppress display.
      const latest = await this.current()
      if (this.same(s) && this.deps.safeForeground() && latest?.assignment_id === a.assignment_id && latest.state === 'scheduled' && latest.reminder_opt_in && latest.task?.id === receipt.drill_id) {
        status = await this.deps.notify(latest.task.title, () => {
          if (this.same(s) && this.deps.safeForeground()) this.deps.openPractice(receipt.drill_id!)
        }).catch(() => 'failed' as const)
      }
    }
    if (this.same(s)) await this.request(s, 'post', `/${a.assignment_id}/reminder-result`, { receipt_id: receipt.receipt_id, status }).catch(() => {})
  }
}
