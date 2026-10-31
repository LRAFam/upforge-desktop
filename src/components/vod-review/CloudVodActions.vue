<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue'
import { useVodReview } from '../../composables/useVodReview'
const { timeline, coachingDetail } = useVodReview()
const busy = ref(false), error = ref(''), confirming = ref(false)
let generation = 0
const state = computed(() => timeline.value?.archiveAnalysisState)
const active = computed(() => ['queued', 'analysing'].includes(state.value ?? ''))
async function update(analyse = false) {
  const id = timeline.value?.archiveId
  if (!id || busy.value) return
  const request = ++generation
  busy.value = true; error.value = ''; confirming.value = false
  try {
    const result = await window.api.archives.review(id, analyse)
    if (request !== generation) return
    if (!result.ok) { error.value = result.error; return }
    // Keep the playing source and review position while checking job status.
    timeline.value = { ...result.timeline, videoPath: timeline.value?.videoPath ?? result.timeline.videoPath }
    if (result.timeline.analysisId) {
      const detail = await window.api.analyses.getDetail(result.timeline.analysisId)
      if (request === generation) coachingDetail.value = detail
    }
  } catch { if (request === generation) error.value = 'Could not check cloud coaching. Please retry.' }
  finally { if (request === generation) busy.value = false }
}
const cleanups = ['session:user-changed', 'auth:session-expired'].map(event => window.api.on(event, () => { generation++; busy.value = false; confirming.value = false; error.value = 'Your account changed. Reopen this review.' }))
onBeforeUnmount(() => { generation++; cleanups.forEach(fn => fn()) })
</script>
<template>
  <section class="border-b border-white/10 px-3 py-2 text-xs flex-shrink-0" aria-label="Cloud recording coaching">
    <div class="flex flex-wrap items-center gap-3">
      <span class="text-gray-400">Cloud recording</span>
      <span v-if="active" role="status">{{ state === 'queued' ? 'AI analysis queued' : 'AI analysis in progress' }}</span>
      <span v-else-if="state === 'analysed'">AI review available in Coaching</span>
      <button v-if="!active && state !== 'analysed'" class="rounded bg-rose-600 px-3 py-2 text-white disabled:opacity-50" :disabled="busy || !timeline?.archiveAnalysisReady" @click="confirming=true">{{ state === 'failed' ? 'Retry AI analysis' : 'Analyse this VOD' }}</button>
      <button :disabled="busy" class="underline disabled:opacity-50" @click="update()">{{ busy ? 'Checking…' : 'Check coaching status' }}</button>
    </div>
    <p v-if="!active && state !== 'analysed' && timeline?.archiveAnalysisReady === false" class="mt-2 text-amber-200">{{ timeline.archiveAnalysisMessage }}</p>
    <p v-if="timeline?.matchDataAvailable === false" class="mt-2 text-amber-200">This archive has no saved match data. Video playback is available; event and spatial views need match data.</p>
    <div v-if="confirming" class="mt-3 flex flex-wrap items-center gap-3">
      <p>Use your {{ timeline?.game }} match-analysis allowance? Your plan and available credits are checked before the job starts.</p>
      <button class="rounded bg-rose-600 px-3 py-2" :disabled="busy" @click="update(true)">Confirm analysis</button>
      <button class="underline" @click="confirming=false">Cancel</button>
    </div>
    <p v-if="error" role="alert" class="mt-2 text-amber-200">{{ error }}</p>
  </section>
</template>
