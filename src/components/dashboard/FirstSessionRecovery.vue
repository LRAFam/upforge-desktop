<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useWindowAttention } from '../../lib/window-attention'
import type { RecoveryTile } from '../../../electron/main/first-session-recovery'
const props = defineProps<{ safe: boolean }>()
const foreground = useWindowAttention()
const tile = ref<RecoveryTile | null>(null)
const working = ref(false)
const message = ref('')
const visible = computed(() => props.safe && foreground.value && tile.value !== null)
let timer: ReturnType<typeof setInterval> | undefined
let generation = 0
let stopped = false
async function refresh() {
  const current = ++generation
  if (!props.safe || !foreground.value || !window.api?.firstSessionRecovery) { tile.value = null; return }
  const result = await window.api.firstSessionRecovery.current().catch(() => null)
  if (stopped || current !== generation || !props.safe || !foreground.value) return
  tile.value = result
  if (result) {
    await nextTick()
    if (!stopped && current === generation && visible.value && tile.value?.assignmentId === result.assignmentId) await window.api.firstSessionRecovery.exposed(result.assignmentId).catch(() => {})
  }
}
async function resume() {
  if (!tile.value || working.value) return
  const chosen = tile.value
  const current = generation
  working.value = true; message.value = ''
  try {
    const entry = await window.api.firstSessionRecovery.enter(chosen.assignmentId)
    if (stopped || current !== generation) return
    if (!entry.ok || entry.recordingId !== chosen.recordingId) { tile.value = null; return }
    // Existing upload path owns reconciliation, credit reservation and match-capture deferral.
    const result = await window.api.recordings.analyse(entry.recordingId)
    if (!result.ok) message.value = result.error ?? 'Resume Upload could not start. Open the recording to check its status.'
    await refresh()
  } catch { message.value = 'Resume Upload could not start. Open the recording to check its status.' }
  finally { working.value = false }
}
async function dismiss() {
  if (!tile.value) return
  const chosen = tile.value; tile.value = null; generation++
  await window.api.firstSessionRecovery.dismiss(chosen.assignmentId).catch(() => {})
}
watch([() => props.safe, foreground], () => { void refresh() })
onMounted(() => { void refresh(); timer = setInterval(() => { if (!working.value) void refresh() }, 30000) })
onUnmounted(() => { stopped = true; generation++; clearInterval(timer) })
</script>
<template>
  <section v-if="visible" class="recovery-tile" aria-label="Recording needs attention">
    <div><strong>Needs attention</strong><p>Your upload was interrupted. Resume this saved recording when you are ready.</p><p v-if="message" role="status">{{ message }}</p></div>
    <button type="button" :disabled="working" @click="resume">{{ working ? 'Checking recording…' : 'Resume Upload' }}</button>
    <button type="button" :disabled="working" @click="dismiss">Dismiss</button>
  </section>
</template>
<style scoped>
.recovery-tile { display: flex; align-items: center; gap: .75rem; padding: .8rem 1rem; border-bottom: 1px solid #a66b26; background: #2b241b; font-size: .8rem; flex-wrap: wrap; }
.recovery-tile div { flex: 1 1 18rem; }
.recovery-tile p { color: #c6c0b6; margin: .2rem 0 0; }
.recovery-tile button { padding: .4rem .65rem; border: 1px solid #958169; border-radius: .3rem; }
.recovery-tile button:disabled { opacity: .5; }
</style>
