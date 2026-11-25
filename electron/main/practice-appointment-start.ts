import type { AuthManager } from './auth-manager'

/** Secondary experiment observation: only an actual assigned-task launch, never a click or free play. */
export function trackPracticeAppointmentStart(
  auth: AuthManager, ownerId: number | null, drillId: number | undefined, eventId: string,
): void {
  const token = auth.getToken()
  if (!token || ownerId === null || auth.getUser()?.id !== ownerId || !Number.isSafeInteger(drillId) || drillId! <= 0) return
  // Server verifies assignment ownership, task support and experiment enrollment/flags.
  // The launch UUID is shared with drill_started and stays stable for this one launch.
  try {
    void auth.getApi().post('/api/experiments/practice-appointment/task-start', {
      drill_id: drillId, event_id: eventId,
    }, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
  } catch { /* Experiment telemetry cannot hold up a working trainer, including when disabled/offline. */ }
}
