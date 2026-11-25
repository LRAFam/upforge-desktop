export interface PracticeAppointment {
  assignment_id?: string
  arm?: 'control' | 'treatment'
  state: string
  task?: { id: number; title: string; completion: string; practice_target_hit: boolean } | null
  due_at?: string | null
  local_datetime?: string | null
  timezone?: string | null
  utc_offset_minutes?: number | null
  reminder_opt_in?: boolean
  reminder_status?: string | null
  expires_at?: string
}
export interface AppointmentSchedule {
  local_datetime: string; timezone: string; utc_offset_minutes: number; reminder_opt_in: boolean
}
export const appointmentUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
export const appointmentDrillId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0
/** Device-local form explicitly shows its IANA zone and offset; server verifies the same roundtrip. */
export function appointmentSchedule(local: string, optIn: boolean): AppointmentSchedule | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null
  const d = new Date(local)
  const pad = (n: number) => String(n).padStart(2, '0')
  const roundtrip = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (!Number.isFinite(d.getTime()) || roundtrip !== local || !timezone) return null
  return { local_datetime: local, timezone, utc_offset_minutes: -d.getTimezoneOffset(), reminder_opt_in: optIn }
}
