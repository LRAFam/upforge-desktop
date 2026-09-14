import { redactSensitiveString } from './error-redaction'

const entries: Array<{ time: number; message: string }> = []

/** Keep only bounded, redacted activity in memory for future error reports. */
export function recordErrorActivity(message: string, time = Date.now()): void {
  entries.push({ time, message: redactSensitiveString(message).slice(0, 500) })
  if (entries.length > 50) entries.shift()
}

export function recentErrorActivity(): Array<{ time: number; message: string }> {
  return entries.map(entry => ({ ...entry }))
}

export function clearErrorActivity(): void {
  entries.length = 0
}
