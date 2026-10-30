<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { validSavedComparison, type SavedComparison } from '../../lib/review-notebook'
import { openAnalysisVodReview } from '../../lib/open-vod-review'
import { uiV3 } from '../../lib/ui-v3'
import UfButton from '../v3/UfButton.vue'
const props = defineProps<{ analysisId: number }>()
const router = useRouter()
const items = ref<SavedComparison[]>([]), error = ref(''), loading = ref(false), opening = ref(false)
let generation = 0
async function load() {
  const current = ++generation
  items.value = []; error.value = ''; loading.value = true
  try {
    const result = await window.api.reviewNotebook.list()
    if (generation !== current) return
    if (!result.ok) { error.value = 'Saved reviews are unavailable. You can still review this match.'; return }
    if (!Array.isArray(result.data.items) || !result.data.items.every(validSavedComparison)) { error.value = 'Saved reviews could not be verified.'; return }
    items.value = result.data.items.filter(item => item.context.moments.some(m => m.source.kind === 'analysis' && m.source.id === String(props.analysisId)))
  } catch { if (generation === current) error.value = 'Saved reviews are unavailable.' }
  finally { if (generation === current) loading.value = false }
}
async function resume(item: SavedComparison) {
  if (opening.value) return
  opening.value = true
  try { if (!await openAnalysisVodReview(router, props.analysisId, { comparisonId: item.id })) error.value = 'Match footage is unavailable. Your saved notes have been kept.' }
  catch { error.value = 'Could not open this review. Please try again.' }
  finally { opening.value = false }
}
watch(() => props.analysisId, load, { immediate: true })
function clear() { generation++; items.value = []; loading.value = false; error.value = 'Sign in again to load saved reviews.' }
const cleanup = [window.api.on('session:user-changed', clear), window.api.on('auth:session-expired', clear)]
onBeforeUnmount(() => { generation++; cleanup.forEach(fn => fn()) })
</script>
<template>
  <section v-if="uiV3" class="msr3" aria-label="Saved reviews for this match">
    <div class="msr3-head">
      <span class="uf-label">Continue your review</span>
      <button type="button" class="uf-link uf-t4" :disabled="loading" @click="load">{{ loading ? 'Loading…' : 'Refresh' }}</button>
    </div>
    <p v-if="error" role="status" class="uf-t4 msr3-msg">{{ error }}</p>
    <p v-else-if="!loading && !items.length" class="uf-t4 msr3-msg">Save a comparison in the review workspace to return to it here.</p>
    <div v-for="item in items" :key="item.id" class="msr3-row">
      <div class="msr3-main">
        <span class="uf-t3">{{ item.title }}</span>
        <span v-if="item.focus" class="uf-t4">Next-match focus: {{ item.focus }}</span>
        <span class="uf-t4">{{ item.notes.length }} {{ item.notes.length === 1 ? 'note' : 'notes' }} · {{ new Date(item.updatedAt).toLocaleDateString() }}</span>
      </div>
      <UfButton variant="secondary" :disabled="opening" @click="resume(item)">Resume comparison</UfButton>
    </div>
  </section>
  <section v-else class="saved-reviews" aria-label="Saved reviews for this match">
    <div class="heading"><h3>Continue your review</h3><button type="button" :disabled="loading" @click="load">{{ loading ? 'Loading…' : 'Refresh' }}</button></div>
    <p v-if="error" role="status">{{ error }}</p>
    <p v-else-if="!loading && !items.length">Save a comparison in the review workspace to return to it here.</p>
    <article v-for="item in items" :key="item.id"><div><strong>{{ item.title }}</strong><p v-if="item.focus">Next-match focus: {{ item.focus }}</p><small>{{ item.notes.length }} notes · {{ new Date(item.updatedAt).toLocaleDateString() }}</small></div><button type="button" :disabled="opening" @click="resume(item)">Resume comparison</button></article>
  </section>
</template>
<style scoped>
.saved-reviews{border:1px solid #ffffff18;border-radius:8px;padding:14px;color:#d1d5db;font-size:12px}.heading,article{display:flex;justify-content:space-between;align-items:center;gap:12px}.heading{margin-bottom:8px}h3,strong{color:#f3f4f6;font-weight:700}p,small{color:#9ca3af;line-height:1.5}article{padding:12px 0;border-top:1px solid #ffffff14;flex-wrap:wrap}article>div{flex:1;min-width:160px}button{border:1px solid #ffffff28;border-radius:4px;padding:7px 10px;min-height:34px}button:hover{border-color:#f43f5e}button:focus-visible{outline:2px solid #f43f5e;outline-offset:3px}
</style>

<style scoped>
/* UI v3: hairline list, no box (own markup above). */
.msr3 { display: flex; flex-direction: column; }
.msr3-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding-bottom: 10px; }
.msr3-msg { margin: 0; padding: 10px 0; border-top: 1px solid var(--uf-line); }
.msr3-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px 0; border-top: 1px solid var(--uf-line); flex-wrap: wrap; }
.msr3-main { flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: 3px; }
</style>
