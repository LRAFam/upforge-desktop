<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { useVodReview } from '../../composables/useVodReview'
import { validPersonalReview, type PersonalReview, type PersonalReviewSource, type PersonalNote, type PersonalFocusCheckIn } from '../../lib/personal-review'
const { timeline, currentTime, activeRoundNumber, seekToTime, formatSeconds, videoEl } = useVodReview()
const source = computed<PersonalReviewSource | null>(() => {
  const t = timeline.value
  if (!t) return null
  if (t.analysisId) return { kind: 'analysis', id: String(t.analysisId), game: t.game }
  return t.id ? { kind: 'recording', id: t.id, game: t.game } : null
})
const saved = ref<PersonalReview | null>(null), focus = ref(''), text = ref(''), error = ref(''), status = ref('')
const busy = ref(false), loading = ref(false), pending = ref<PersonalReview | null>(null)
const anchor = ref<{ position: number; round: number | null } | null>(null)
const outcome = ref<PersonalFocusCheckIn['outcome'] | ''>(''), reflection = ref('')
const previousFocus = computed(() => saved.value?.focusCheckIn ?? saved.value?.previousFocus ?? null)
const checkInDirty = computed(() => outcome.value !== (saved.value?.focusCheckIn?.outcome ?? '') || reflection.value !== (saved.value?.focusCheckIn?.reflection ?? ''))
function hydrateCheckIn() { outcome.value = saved.value?.focusCheckIn?.outcome ?? ''; reflection.value = saved.value?.focusCheckIn?.reflection ?? '' }
let generation = 0
const dirty = computed(() => checkInDirty.value || !!text.value.trim() || !!pending.value || focus.value !== (saved.value?.focus ?? ''))
const canLeave = () => !dirty.value || window.confirm('Leave your unsaved personal notes? Copy your draft first if you want to keep it.')
onBeforeRouteLeave(canLeave)
onBeforeRouteUpdate(canLeave)
function capture() { anchor.value = { position: currentTime.value, round: activeRoundNumber.value }; videoEl.value?.pause() }
function begin() { if (!anchor.value) capture() }
async function load() {
  if (!source.value || busy.value || (dirty.value && !window.confirm('Discard your draft and reload saved notes?'))) return
  const current = ++generation
  loading.value = true; error.value = ''; status.value = ''
  try {
    const result = await window.api.personalReview.get(source.value)
    if (current !== generation) return
    if (!result.ok) { error.value = result.error; return }
    if (!validPersonalReview(result.data) || JSON.stringify(result.data.source) !== JSON.stringify(source.value)) { error.value = 'Personal notes could not be verified.'; return }
    saved.value = result.data; hydrateCheckIn(); focus.value = result.data.focus; text.value = ''; pending.value = null; anchor.value = null
  } catch { if (current === generation) error.value = 'Personal notes are unavailable on this version. Your draft stays here.' }
  finally { if (current === generation) loading.value = false }
}
async function save(notes?: PersonalNote[]) {
  if (!saved.value || busy.value || loading.value) return
  if (checkInDirty.value && !outcome.value) { error.value = 'Choose a check-in before saving your reflection.'; return }
  const current = generation
  if (!pending.value) {
    const list = notes ?? saved.value.notes
    if (!notes && text.value.trim() && !anchor.value) capture()
    pending.value = { ...saved.value, ...(previousFocus.value && outcome.value ? { focusCheckIn: { sourceKey: previousFocus.value.sourceKey, focus: previousFocus.value.focus, outcome: outcome.value, reflection: reflection.value.trim() } } : {}), focus: focus.value.trim(), notes: !notes && text.value.trim() ? [...list, { id: crypto.randomUUID(), text: text.value.trim(), position: anchor.value!.position, round: anchor.value!.round, createdAt: new Date().toISOString() }] : list }
  }
  busy.value = true; error.value = ''; status.value = ''
  try {
    const result = await window.api.personalReview.save(JSON.parse(JSON.stringify(pending.value)))
    if (current !== generation) return
    if (!result.ok) { error.value = result.error; return }
    if (!validPersonalReview(result.data)) { error.value = 'Save could not be verified. Retry checks the same draft.'; return }
    saved.value = { ...result.data, previousFocus: saved.value?.previousFocus }; hydrateCheckIn(); focus.value = result.data.focus; text.value = ''; pending.value = null; anchor.value = null; status.value = 'Saved to your account.'
  } catch { if (current === generation) error.value = 'Save could not be confirmed. Retry keeps the same note and timestamp.' }
  finally { if (current === generation) busy.value = false }
}
function remove(id: string) {
  if (dirty.value || !saved.value) return
  if (window.confirm('Delete this personal note from your account? This cannot be undone.')) void save(saved.value.notes.filter(n => n.id !== id))
}
function clear() { generation++; saved.value = null; outcome.value = ''; reflection.value = ''; focus.value = ''; text.value = ''; pending.value = null; anchor.value = null; busy.value = false; loading.value = false; status.value = ''; error.value = '' }
watch(() => JSON.stringify(source.value), () => { clear(); void load() }, { immediate: true })
const cleanups = ['session:user-changed', 'auth:session-expired'].map(event => window.api.on(event, () => { clear(); error.value = 'Sign in again to open personal notes.' }))
onBeforeUnmount(() => { generation++; cleanups.forEach(fn => fn()) })
</script>
<template>
  <section class="personal-review" aria-label="Personal review" @keydown.stop>
    <header><h3>Your review <span>Free</span></h3><button type="button" :disabled="busy || loading" @click="load">{{ loading ? 'Loading…' : 'Reload' }}</button></header>
    <p>Private notes and a focus for your next match.</p>
    <template v-if="saved">
      <details v-if="previousFocus" class="focus-check-in" :open="!saved.focusCheckIn">
        <summary>{{ saved.focusCheckIn ? 'Your focus check-in' : 'Bring your focus into this review' }}</summary>
        <p>{{ previousFocus.focus }}</p>
        <p class="focus-hint">From another review of this game. How did it go in this match?</p>
        <label>Your assessment<select v-model="outcome" :disabled="busy || !!pending"><option value="">Choose when ready</option><option value="improved">I improved</option><option value="practising">Still practising</option><option value="not_tried">I haven’t tried it yet</option></select></label>
        <label>Reflection (optional)<textarea v-model="reflection" maxlength="1000" rows="2" :disabled="busy || !!pending" /></label>
        <button type="button" :disabled="busy || !!pending" @click="focus = previousFocus.focus">Keep this focus for next match</button>
      </details>
      <label>Next-match focus<input v-model="focus" maxlength="200" :disabled="busy || !!pending" placeholder="One thing to try next match" /></label>
      <label>Moment note<textarea v-model="text" rows="2" maxlength="2000" :disabled="busy || !!pending" @focus="begin" placeholder="What did you notice?" /></label>
      <div v-if="anchor" class="anchor"><span>{{ formatSeconds(anchor.position) }}<template v-if="anchor.round !== null"> · R{{ anchor.round + 1 }}</template></span><button type="button" :disabled="busy || !!pending" @click="capture">Use current moment</button></div>
      <button class="primary" type="button" :disabled="busy || loading || !dirty" @click="save()">{{ busy ? 'Saving…' : pending ? 'Retry save' : 'Save review' }}</button>
      <details v-if="saved.notes.length" open><summary>Saved notes ({{ saved.notes.length }})</summary><article v-for="note in saved.notes" :key="note.id"><button type="button" @click="seekToTime(note.position)">{{ formatSeconds(note.position) }}<template v-if="note.round !== null"> · R{{ note.round + 1 }}</template> · Watch</button><p>{{ note.text }}</p><button type="button" :disabled="busy || dirty" @click="remove(note.id)">Delete note</button></article></details>
    </template>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="status" role="status">{{ status }}</p>
  </section>
</template>
<style scoped>
.personal-review{padding:12px;border:1px solid #ffffff24;border-radius:6px;background:#15181e;font-size:12px}header,.anchor{display:flex;justify-content:space-between;align-items:center;gap:8px}h3{font-weight:700;color:#f3f4f6}h3 span{font-weight:400;color:#9ca3af;margin-left:6px}p{margin:8px 0;color:#aab2bf;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}label{display:grid;gap:6px;margin:12px 0;color:#d1d5db}input,textarea,select,button{font:inherit;border:1px solid #ffffff28;border-radius:4px;background:#1a1d24;color:#e5e7eb;padding:8px;min-width:0}textarea{resize:vertical}button{min-height:34px}button:disabled{opacity:.5}.primary{width:100%;background:#d60838;margin:10px 0}details{border-top:1px solid #ffffff18;padding-top:10px}summary{cursor:pointer;min-height:32px}article{padding:10px 0;border-top:1px solid #ffffff14}:is(button,input,textarea,select,summary):focus-visible{outline:2px solid #e11d48;outline-offset:2px}
</style>
