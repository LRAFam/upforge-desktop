<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { RecordingTimeline } from '../../composables/useVodReview'
import { canWatchRawRecording } from '../../lib/recording-demo-status'

const props = defineProps<{ game: string; current: RecordingTimeline }>()
const emit = defineEmits<{ close: []; select: [key: string, timeline: RecordingTimeline] }>()
const choices = ref<Array<{ key: string; label: string; load: () => Promise<RecordingTimeline | null> }>>([])
const loading = ref(true)
const busy = ref(false)
const query = ref('')
const error = ref('')
const libraryError = ref('')
const dialog = ref<HTMLDialogElement | null>(null)
let alive = true
onBeforeUnmount(() => { alive = false })
const filtered = computed(() => choices.value.filter(c => c.label.toLowerCase().includes(query.value.toLowerCase())))
function title(map: string | null, agent: string | null, date: string | number, origin: string) {
  const parts = [map, agent, new Date(date).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), origin]
  return parts.filter(Boolean).join(' · ')
}
onMounted(async () => {
  dialog.value?.showModal()
  const requests = await Promise.allSettled([
    window.api.recordings.listAll(),
    props.game === 'valorant' || props.game === 'lol' ? window.api.analyses.get(50, props.game) : Promise.resolve([]),
  ])
  if (!alive) return
  const [local, cloud] = requests
  if (local.status === 'fulfilled') {
    choices.value.push(...local.value.filter(r => r.game === props.game && canWatchRawRecording(r) && r.id !== props.current.id && !(r.analysisId != null && r.analysisId === props.current.analysisId)).map(r => ({
      key: `recording:${r.id}`, label: title(r.map, r.agent, r.recordedAt, 'Recording'),
      load: () => window.api.recordings.getTimeline(r.id) as Promise<RecordingTimeline | null>,
    })))
  }
  if (cloud.status === 'fulfilled') {
    const listed = new Set(local.status === 'fulfilled' ? local.value.filter(r => r.game === props.game && canWatchRawRecording(r)).map(r => r.analysisId) : [])
    choices.value.push(...cloud.value.filter(a => a.status === 'completed' && a.id !== props.current.analysisId && !listed.has(a.id)).map(a => ({
      key: `analysis:${a.id}`, label: title(a.map, a.agent, a.created_at, 'Reviewed match'),
      load: () => window.api.analyses.getTimeline(a.id) as Promise<RecordingTimeline | null>,
    })))
  }
  if (requests.some(r => r.status === 'rejected')) libraryError.value = 'Part of your footage library could not load. Close and reopen to retry.'
  loading.value = false
})
async function choose(key: string) {
  if (busy.value) return
  if (key === 'current') { emit('select', key, props.current); return }
  const choice = choices.value.find(c => c.key === key)
  if (!choice) return
  busy.value = true
  error.value = ''
  try {
    const source = await choice.load()
    if (!alive) return
    if (source && source.game !== props.game) { error.value = 'This recording belongs to a different game. Your current selection has been kept.'; return }
    if (!source?.videoPath) { error.value = 'This match has no playable footage available. Your current selection has been kept.'; return }
    emit('select', key, source)
  } catch { if (alive) error.value = 'Footage could not load. Your current selection has been kept. Try again.' }
  finally { if (alive) busy.value = false }
}
</script>
<template>
  <dialog ref="dialog" class="source-backdrop" aria-labelledby="source-picker-title" @cancel.prevent="emit('close')" @click.self="emit('close')">
    <section class="source-picker">
      <header><h2 id="source-picker-title">Change footage</h2><button type="button" @click="emit('close')">Cancel</button></header>
      <p>Choose another {{ game }} recording. Only this side will change.</p>
      <label>Find footage <input v-model="query" autofocus type="search" placeholder="Map, agent or date" /></label>
      <p v-if="loading" role="status">Loading footage…</p>
      <p v-if="busy" role="status">Opening recording…</p>
      <p v-if="libraryError" role="status">{{ libraryError }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="source-list">
        <button type="button" :disabled="busy" @click="choose('current')">Current review · {{ current.map }} · {{ current.agent }}</button>
        <button v-for="choice in filtered" :key="choice.key" type="button" :disabled="busy" @click="choose(choice.key)">{{ choice.label }}</button>
      </div>
      <p v-if="!loading && !filtered.length">No other matching footage found.</p>
      <p>Includes recordings on this device and up to 50 recent reviewed matches. Unavailable recordings cannot be selected.</p>
    </section>
  </dialog>
</template>
<style scoped>
.source-backdrop { position: fixed; inset: 0; width: 100vw; height: 100vh; max-width: none; max-height: none; margin: 0; border: 0; color: white; z-index: 60; background: transparent; } .source-backdrop::backdrop { background: #000b; } .source-backdrop[open] { display: grid; place-items: center; padding: 20px; }
.source-picker { width: min(620px, 100%); max-height: 85vh; overflow: auto; background: #15181e; border: 1px solid #ffffff25; border-radius: 8px; padding: 20px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; } h2 { font-size: 18px; font-weight: 700; } p,label { font-size: 12px; color: #aab2bf; margin: 12px 0; } label { display: grid; gap: 6px; }
button,input { color: white; background: #20242c; border: 1px solid #ffffff25; border-radius: 4px; padding: 10px; font-size: 12px; }button { cursor: pointer; }button:disabled { opacity: .5; cursor: wait; }
.source-list { display: grid; gap: 8px; margin-top: 12px; }.source-list button { text-align: left; } :is(button,input):focus-visible { outline: 2px solid #e11d48; outline-offset: 2px; }
</style>
