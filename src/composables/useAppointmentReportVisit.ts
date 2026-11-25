import { onMounted, onUnmounted, watch, type Ref } from 'vue'
import { useWindowAttention } from '../lib/window-attention'
import { RecoveryReportVisitClock, type RecoveryReportVisit } from '../lib/recovery-report-visit'

export function useAppointmentReportVisit(target: Ref<RecoveryReportVisit | null>): void {
  const foreground = useWindowAttention()
  const clock = new RecoveryReportVisitClock()
  let timer: ReturnType<typeof setInterval> | undefined
  let key = ''
  let eventId = ''
  let generation = 0
  let sending = false
  let stopped = false
  let nextAttempt = 0
  async function sample() {
    const value = target.value
    const next = value ? `${value.result}:${value.result_id}` : ''
    if (next !== key) { key = next; eventId = crypto.randomUUID(); generation++; sending = false; nextAttempt = 0 }
    const elapsed = clock.sample(value, foreground.value, performance.now())
    if (stopped || sending || elapsed === null || performance.now() < nextAttempt || !value || !window.api?.practiceAppointment) return
    const current = generation
    sending = true
    try {
      const outcome = await window.api.practiceAppointment.reportView({ match_id: value.result_id, foreground_ms: elapsed, event_id: eventId })
      if (!stopped && current === generation) {
        if (outcome === 'accepted') clock.delivered()
        else { clock.sample(null, false, performance.now()); nextAttempt = performance.now() + 10000 }
      }
    } catch { if (current === generation) nextAttempt = performance.now() + 30000 /* Retry the same id without an offline request loop. */ }
    finally { if (current === generation) sending = false }
  }
  watch([target, foreground], () => { void sample() }, { flush: 'sync' })
  onMounted(() => { timer = setInterval(() => { void sample() }, 1000); void sample() })
  onUnmounted(() => { stopped = true; generation++; clearInterval(timer) })
}
