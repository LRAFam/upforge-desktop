import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { PracticeAppointments } from './practice-appointment'
const id = '11111111-1111-4111-8111-111111111111', receipt = '22222222-2222-4222-8222-222222222222'
const roots: string[] = []
afterEach(() => { roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })) })
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'appointment-')); roots.push(root)
  let session: { owner: number; token: string } | null = { owner: 1, token: 'token-a' }, safe = true
  const appointment = { assignment_id: id, arm: 'treatment', state: 'scheduled', task: { id: 8, title: 'Head height', practice_target_hit: false, completion: 'active' }, reminder_opt_in: true, reminder_status: null, due_at: '2026-01-01T10:00:00Z' }
  const request = vi.fn(async (_s: unknown, _method: string, endpoint: string, _data?: unknown): Promise<unknown> => endpoint.endsWith('/current') ? appointment : endpoint.endsWith('/reminder') ? { receipt_id: receipt, assignment_id: id, drill_id: 8 } : undefined)
  const notify = vi.fn(async () => 'delivered' as const), openPractice = vi.fn()
  const deps = { userDataPath: root, session: () => session, safeForeground: () => safe, request, notify, openPractice }
  return { service: new PracticeAppointments(deps), deps, appointment, request, notify, openPractice, safe: (v: boolean) => { safe = v }, session: (v: typeof session) => { session = v } }
}
it('reserves and displays exactly once, including simultaneous boundaries and restart', async () => {
  const s = setup(); await Promise.all([s.service.boundary(), s.service.boundary()]); await new PracticeAppointments(s.deps).boundary()
  expect(s.notify).toHaveBeenCalledTimes(1)
  expect(s.request.mock.calls.filter(c => c[2].endsWith('/reminder'))).toHaveLength(1)
  expect(s.request).toHaveBeenCalledWith({ owner: 1, token: 'token-a' }, 'post', expect.stringContaining('/reminder-result'), { receipt_id: receipt, status: 'delivered' })
})
it('never requests a reminder in background or for control, no opt-in, completed or not due', async () => {
  const unsafe = setup(); unsafe.safe(false); await unsafe.service.boundary(); expect(unsafe.request).not.toHaveBeenCalled()
  for (const change of [{ arm: 'control' }, { reminder_opt_in: false }, { state: 'completed' }, { due_at: '2099-01-01' }, { reminder_status: 'attempted' }]) {
    const s = setup(); Object.assign(s.appointment, change); await s.service.boundary(); expect(s.notify).not.toHaveBeenCalled(); expect(s.request.mock.calls.some(c => c[2].endsWith('/reminder'))).toBe(false)
  }
})
it('does not retry ambiguous reservation after restart', async () => {
  const s = setup(); const implementation = s.request.getMockImplementation()!
  s.request.mockImplementation(async (...args) => { if (args[2].endsWith('/reminder')) throw new Error('response lost'); return implementation(...args) })
  await expect(s.service.boundary()).rejects.toThrow('response lost'); await new PracticeAppointments(s.deps).boundary()
  expect(s.request.mock.calls.filter(c => c[2].endsWith('/reminder'))).toHaveLength(1); expect(s.notify).not.toHaveBeenCalled()
})
it('a confirmed empty reservation permits a later safe boundary', async () => {
  const s = setup(); s.request.mockResolvedValueOnce(s.appointment).mockResolvedValueOnce(null)
  await s.service.boundary(); await s.service.boundary(); expect(s.notify).toHaveBeenCalledTimes(1)
})
it('rechecks account, safety and task completion after reservation', async () => {
  for (const change of ['account', 'game', 'completed']) {
    const s = setup(); const implementation = s.request.getMockImplementation()!
    s.request.mockImplementation(async (...args) => {
      const result = await implementation(...args)
      if (args[2].endsWith('/reminder')) { if (change === 'account') s.session({ owner: 2, token: 'b' }); else if (change === 'game') s.safe(false); else s.appointment.state = 'completed' }
      return result
    })
    await s.service.boundary().catch(() => {}); expect(s.notify).not.toHaveBeenCalled()
  }
})
it('a mismatched task/assignment receipt cannot display a notification', async () => {
  const s = setup(); s.request.mockResolvedValueOnce(s.appointment).mockResolvedValueOnce({ receipt_id: receipt, assignment_id: id, drill_id: 9 })
  await s.service.boundary(); expect(s.notify).not.toHaveBeenCalled()
})
it('choice keeps normal practice working offline, but blocks a late account-switch launch', async () => {
  const s = setup(); s.request.mockRejectedValueOnce(new Error('offline')); expect(await s.service.choose(8)).toEqual({ ok: true })
  s.request.mockImplementationOnce(async () => { s.session({ owner: 2, token: 'b' }); return { state: 'chosen' } })
  expect(await s.service.choose(8)).toEqual({ ok: false }); expect(await s.service.choose('8')).toEqual({ ok: false })
})
it('report observations require actual foreground threshold and explicit same-owner token', async () => {
  const s = setup(); const input = { match_id: 'owned-report', foreground_ms: 9999, event_id: receipt }
  expect(await s.service.reportView(input)).toBe('retry'); expect(s.request).not.toHaveBeenCalled()
  input.foreground_ms = 10000; expect(await s.service.reportView(input)).toBe('accepted')
  expect(s.request).toHaveBeenCalledWith({ owner: 1, token: 'token-a' }, 'post', expect.stringContaining('/report-view'), input)
})
it('schedule forwards the explicit timezone/offset and opt-in; no arbitrary endpoint', async () => {
  const s = setup(); const schedule = { local_datetime: '2026-11-25T12:00', timezone: 'Europe/London', utc_offset_minutes: 0, reminder_opt_in: false }
  await s.service.change(id, 'schedule', schedule)
  expect(s.request).toHaveBeenCalledWith(expect.anything(), 'put', expect.stringContaining(`/${id}/schedule`), schedule)
  s.request.mockClear(); expect(await s.service.change(id, 'send-anything')).toBeNull(); expect(s.request).not.toHaveBeenCalled()
})
