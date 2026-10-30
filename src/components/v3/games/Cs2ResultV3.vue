<script setup lang="ts">
/** In-app CS2 result for an analysed demo (instead of opening the web). Read-only. */
import { computed, ref, watch } from 'vue'
import UfDialog from '../UfDialog.vue'
import UfSkeleton from '../UfSkeleton.vue'
import Cs2MatchTabsV3 from '../matchpage/cs2/Cs2MatchTabsV3.vue'
import { shapeCs2Result, type Cs2Result } from './cs2-result'

const props = defineProps<{ open: boolean; jobId: string | null }>()
const emit = defineEmits<{ close: [] }>()

const result = ref<Cs2Result | null>(null)
const state = ref<'idle' | 'loading' | 'ready' | 'error' | 'unsupported'>('idle')
const detailApi = () => (window.api.cs2 as { getAnalysisDetail?: (jobId: string) => Promise<{ ok: true; analysis: unknown } | { ok: false; error: string }> }).getAnalysisDetail

async function load() {
  if (!props.open || !props.jobId) return
  const api = detailApi()
  if (!api) { state.value = 'unsupported'; return }
  state.value = 'loading'
  const res = await api(props.jobId).catch(() => ({ ok: false as const, error: 'fetch_failed' }))
  if (!res.ok) { state.value = 'error'; return }
  result.value = shapeCs2Result(res.analysis)
  state.value = result.value ? 'ready' : 'error'
}
watch(() => [props.open, props.jobId], () => { result.value = null; void load() }, { immediate: true })
const title = computed(() => result.value?.title ?? 'CS2 match')
function openWeb() { void window.api.cs2.openDashboard() }
</script>

<template>
  <UfDialog :open="open" kicker="Demo review" :title="title" :width="860" @close="emit('close')">
    <div v-if="state === 'loading'" class="c2r" role="status" aria-label="Loading the demo review">
      <UfSkeleton :lines="2" /><UfSkeleton :h="40" /><UfSkeleton :lines="6" />
    </div>
    <p v-else-if="state === 'error'" class="uf-t2">Couldn't load this review. <button type="button" class="uf-link" @click="load">Try again →</button></p>
    <p v-else-if="state === 'unsupported'" class="uf-t2">This version of the app opens reviews on the web. <button type="button" class="uf-link" @click="openWeb">Open on the web →</button></p>

    <div v-else-if="state === 'ready' && result" class="c2r uf-reveal">
      <p v-if="result.status === 'processing'" class="uf-t2">This review is still being written. It usually takes a few minutes after the demo uploads.</p>
      <p v-else-if="result.status === 'failed'" class="uf-t2">This review didn't finish. Your credit was returned if one was used.</p>

      <section v-if="result.focus || result.summary" class="c2r-block">
        <p v-if="result.focus" class="uf-t1">{{ result.focus }}</p>
        <p v-if="result.summary" class="uf-t2">{{ result.summary }}</p>
      </section>

      <section v-if="result.stats" class="c2r-block"><Cs2MatchTabsV3 :view="result.stats" /></section>

      <section v-if="result.issues.length" class="c2r-block">
        <span class="uf-label">What to work on</span>
        <div v-for="(i, n) in result.issues" :key="n" class="c2r-issue">
          <span v-if="i.category" class="uf-t4">{{ i.category }}</span>
          <span class="uf-t3">{{ i.issue }}</span>
          <span v-if="i.evidence" class="uf-t4">{{ i.evidence }}</span>
          <span v-if="i.fix" class="uf-t2">{{ i.fix }}</span>
        </div>
      </section>

      <section v-if="result.strengths.length" class="c2r-block">
        <span class="uf-label">What went well</span>
        <p v-for="(s, n) in result.strengths" :key="n" class="uf-t2 c2r-line">{{ s }}</p>
      </section>

      <section v-for="note in result.notes" :key="note.label" class="c2r-block">
        <span class="uf-label">{{ note.label }}</span>
        <p class="uf-t2">{{ note.text }}</p>
      </section>

      <section v-if="result.drills.length" class="c2r-block">
        <span class="uf-label">Practice</span>
        <div v-for="(d, n) in result.drills" :key="n" class="c2r-issue">
          <span class="uf-t3">{{ d.title }}<span v-if="d.frequency" class="uf-t4"> · {{ d.frequency }}</span></span>
          <span v-if="d.description" class="uf-t2">{{ d.description }}</span>
        </div>
      </section>
    </div>
  </UfDialog>
</template>

<style scoped>
.c2r { display: flex; flex-direction: column; gap: 24px; }
.c2r p { margin: 0; }
.c2r-block { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.c2r-issue { display: flex; flex-direction: column; gap: 4px; padding: 12px 0; border-top: 1px solid var(--uf-line); }
.c2r-line { padding: 6px 0; border-top: 1px solid var(--uf-line); }
</style>
