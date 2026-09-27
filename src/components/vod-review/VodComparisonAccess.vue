<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { validReviewAccess } from '../../lib/account-usage'
import { validSavedComparison, type SavedComparison } from '../../lib/review-notebook'
const emit = defineEmits<{ allowed: []; close: [] }>()
const loading = ref(false), locked = ref(false), error = ref(''), savedError = ref('')
const items = ref<SavedComparison[]>([])
let generation = 0
async function load() {
  const current = ++generation
  loading.value = true; locked.value = false; items.value = []; error.value = ''; savedError.value = ''
  try {
    const result = await window.api.accountUsage.get()
    if (current !== generation) return
    if (!result.ok) { error.value = result.error; return }
    const access = (result.data as { review_access?: unknown })?.review_access
    if (!validReviewAccess(access)) { error.value = 'Comparison access is unavailable from this server. Try again after the server update.'; return }
    if (access.comparison) { emit('allowed'); return }
    locked.value = true
    const saved = await window.api.reviewNotebook.list()
    if (current !== generation) return
    if (!saved.ok || !Array.isArray(saved.data.items) || !saved.data.items.every(validSavedComparison)) { savedError.value = 'Saved comparisons could not be loaded. Your notes have not been removed.'; return }
    items.value = saved.data.items
  } catch { if (current === generation) error.value = 'Could not check comparison access. Please retry.' }
  finally { if (current === generation) loading.value = false }
}
const cleanups = ['session:user-changed', 'auth:session-expired'].map(event => window.api.on(event, () => { generation++; items.value = []; locked.value = false; loading.value = false; error.value = 'Your account changed. Reopen comparison.' }))
onMounted(load)
onBeforeUnmount(() => { generation++; cleanups.forEach(fn => fn()) })
function plans() { void window.api.app.openUrl('https://upforge.gg/pricing') }
function stamp(value: number) { return `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, '0')}` }
</script>
<template>
  <section class="comparison-access" aria-label="Comparison access">
    <header><button type="button" @click="emit('close')">Back to review</button><button type="button" :disabled="loading" @click="load">{{ loading ? 'Checking…' : 'Refresh access' }}</button></header>
    <p v-if="loading" role="status">Checking your account…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="locked">
      <h2>Compare moments with Plus or Pro</h2>
      <p>Review two moments side by side, link playback and save comparisons to revisit.</p>
      <button type="button" class="primary" @click="plans">View plans</button>
      <p>Single-match replay, personal notes and next-match focus stay free.</p>
      <h3>Your saved comparisons</h3><p>Your existing work stays readable when your plan changes.</p>
      <p v-if="savedError" role="status">{{ savedError }}</p>
      <p v-else-if="!loading && !items.length">No saved comparisons.</p>
      <details v-for="item in items" :key="item.id"><summary>{{ item.title }}</summary><p v-if="item.focus">Next-match focus: {{ item.focus }}</p>
        <article v-for="note in item.notes" :key="note.id"><p>{{ note.text }}</p><small v-for="(moment, index) in note.context.moments" :key="index">{{ index === 0 ? 'A' : 'B' }} · {{ moment.source.label || moment.source.id }} · {{ stamp(moment.position) }} </small></article>
      </details>
    </template>
  </section>
</template>
<style scoped>
.comparison-access{overflow:auto;max-width:900px;width:100%;margin:0 auto;padding:24px;color:#d1d5db;font-size:14px}header{display:flex;justify-content:space-between;gap:12px}h2{font-size:22px;font-weight:700;color:white;margin-top:24px}h3{font-size:16px;font-weight:700;margin-top:28px}p{line-height:1.6;margin:12px 0;white-space:pre-wrap}button{padding:9px 12px;min-height:36px;border:1px solid #ffffff28;border-radius:5px}button:disabled{opacity:.5}.primary{background:#d60838;color:white}details{border-top:1px solid #ffffff20;padding:14px 0}summary{cursor:pointer}article{padding:8px 0;border-top:1px solid #ffffff12}small{color:#9ca3af}button:focus-visible,summary:focus-visible{outline:2px solid #e11d48;outline-offset:3px}
</style>
