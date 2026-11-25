import { afterEach, expect, it, vi } from 'vitest'
import { appointmentSchedule } from './practice-appointment'
afterEach(() => vi.unstubAllEnvs())
it('rejects malformed dates and a nonexistent local clock time across spring DST', () => {
  vi.stubEnv('TZ', 'Europe/London')
  expect(appointmentSchedule('2026-02-30T12:00', false)).toBeNull()
  expect(appointmentSchedule('2026-03-29T01:30', false)).toBeNull()
  expect(appointmentSchedule('not-a-date', false)).toBeNull()
})
it('saves the explicit local timezone and occurrence offset, keeping opt-in separate', () => {
  vi.stubEnv('TZ', 'Europe/London')
  expect(appointmentSchedule('2026-07-01T12:00', false)).toEqual({ local_datetime: '2026-07-01T12:00', timezone: 'Europe/London', utc_offset_minutes: 60, reminder_opt_in: false })
  const fold = appointmentSchedule('2026-10-25T01:30', true)!
  expect(fold.timezone).toBe('Europe/London'); expect([0, 60]).toContain(fold.utc_offset_minutes); expect(fold.reminder_opt_in).toBe(true)
})
