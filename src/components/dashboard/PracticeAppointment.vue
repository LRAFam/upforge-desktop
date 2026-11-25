<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useWindowAttention } from '../../lib/window-attention'
import { appointmentSchedule, type PracticeAppointment } from '../../lib/practice-appointment'
const props = defineProps<{ safe: boolean }>()
const router = useRouter()
const foreground = useWindowAttention()
const appointment = ref<PracticeAppointment | null>(null)
const localTime = ref('')
const reminder = ref(false)
const editing = ref(false)
const busy = ref(false)
const error = ref('')
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
const schedule = computed(() => appointmentSchedule(localTime.value, reminder.value))
const visible = computed(() => props.safe && foreground.value && appointment.value?.arm === 'treatment' && !!appointment.value.task && ['chosen', 'scheduled', 'completed'].includes(appointment.value.state))
let generation = 0
let stopped = false
let timer: ReturnType<typeof setInterval> | undefined
async function refresh(boundary = false) {
  const current = ++generation
  if (!props.safe || !foreground.value || !window.api?.practiceAppointment) { appointment.value = null; return }
  const value = await window.api.practiceAppointment.current().catch(() => null)
  if (stopped || current !== generation || !props.safe || !foreground.value) return
  appointment.value = value
  // No interval sends a reminder: only mount/focus/return-to-safe state is a session boundary.
  if (boundary) void window.api.practiceAppointment.boundary().catch(() => {})
}
async function change(action: 'schedule' | 'skip' | 'stop') {
  const a = appointment.value
  if (!a?.assignment_id || busy.value || !visible.value) return
  const data = action === 'schedule' ? schedule.value : undefined
  if (action === 'schedule' && !data) { error.value = 'Choose a valid local date and time.'; return }
  const current = ++generation
  busy.value = true; error.value = ''
  try {
    const value = await window.api.practiceAppointment.change(a.assignment_id, action, data ?? undefined)
    if (!stopped && current === generation) { appointment.value = value; editing.value = false }
  } catch { if (!stopped && current === generation) error.value = 'Could not save. Choose a future time within seven days and try again.' }
  finally { if (!stopped) busy.value = false }
}
async function resume() {
  const current = ++generation
  const a = await window.api.practiceAppointment.current().catch(() => null)
  if (stopped || current !== generation || !props.safe || !foreground.value) return
  appointment.value = a
  if (a?.task && ['chosen', 'scheduled'].includes(a.state)) await router.push({ path: '/training', query: { appointmentDrill: String(a.task.id), game: 'valorant' } })
}
watch([() => props.safe, foreground], () => { void refresh(true) })
onMounted(() => { void refresh(true); timer = setInterval(() => { if (!busy.value) void refresh() }, 30000) })
onUnmounted(() => { stopped = true; generation++; clearInterval(timer) })
</script>
<template>
  <section v-if="visible && appointment" class="appointment" aria-label="Saved practice task">
    <div class="appointment-copy">
      <strong>{{ appointment.task?.title }}</strong>
      <p v-if="appointment.state === 'completed'">{{ appointment.task?.practice_target_hit ? 'Practice target reached. This does not establish improvement in matches.' : 'This task is already done. No reminder will be sent.' }}</p>
      <template v-else-if="appointment.state === 'chosen' || editing">
        <p>Want to pick a time for this task? Scheduling is optional.</p>
        <label>Date and time <input v-model="localTime" type="datetime-local" :disabled="busy" /></label>
        <p>Timezone: {{ zone }}<template v-if="schedule"> · UTC offset {{ schedule.utc_offset_minutes }} minutes</template>. Saved in this timezone if your device timezone changes.</p>
        <label><input v-model="reminder" type="checkbox" :disabled="busy" /> One desktop reminder when UpForge is in front and no game is active</label>
        <p>The saved task stays available here without a desktop reminder.</p>
        <button type="button" :disabled="busy || !schedule" @click="change('schedule')">Save time</button>
        <button type="button" :disabled="busy" @click="change('skip')">Skip</button>
      </template>
      <template v-else>
        <p>Saved for {{ appointment.local_datetime?.replace('T', ' ') }} · {{ appointment.timezone }}.</p>
        <p>{{ appointment.reminder_opt_in ? 'One reminder may appear at a safe foreground session after that time.' : 'In-app reminder only. No desktop notification.' }}</p>
        <button v-if="!appointment.reminder_status" type="button" :disabled="busy" @click="editing = true">Change time</button>
      </template>
      <p v-if="error" role="status">{{ error }}</p>
    </div>
    <button v-if="appointment.state !== 'completed'" type="button" :disabled="busy" @click="resume">Open saved task</button>
    <button type="button" :disabled="busy" @click="change('stop')">Stop reminders</button>
  </section>
</template>
<style scoped>
.appointment { display:flex; align-items:center; flex-wrap:wrap; gap:.75rem; padding:1rem; border-bottom:1px solid #41474a; background:#1b2226; font-size:.8rem; }
.appointment-copy { flex:1 1 22rem; }
.appointment p { margin:.3rem 0; color:#c5cbce; }
.appointment label { display:block; margin:.5rem 0; }
.appointment button, .appointment input[type=datetime-local] { padding:.4rem .65rem; border:1px solid #77858c; border-radius:.3rem; margin-right:.5rem; }
.appointment button:disabled { opacity:.5; }
</style>
