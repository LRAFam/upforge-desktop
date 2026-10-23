<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { useVodReview } from '../../composables/useVodReview'
import { validPersonalReview, type PersonalReview, type PersonalReviewSource, type PersonalNote, type PersonalFocusCheckIn } from '../../lib/personal-review'
const { timeline, currentTime, activeRoundNumber, seekToTime, formatSeconds, videoEl } = useVodReview()
const source = computed<PersonalReviewSource | null>(() => {
  const t = timeline.value
  if (!t) return null
  if (t.archiveAnalysisState !== undefined && t.archiveId) return { kind: 'recording', id: t.archiveId, game: t.game }
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
  <section class="personal-review" aria-label="Your self-review" @keydown.stop>
    <header class="review-header">
      <div><p class="review-kicker">Your perspective</p><h3>Match notebook</h3></div>
      <button class="reload-button" type="button" :disabled="busy || loading" @click="load" aria-label="Reload saved review">Reload</button>
    </header>
    <p class="review-intro">Capture a moment. Take one lesson into your next match.</p>
    <div v-if="error" role="alert" class="review-message review-message--error">{{ error }}</div>
    <p v-if="loading" role="status" class="review-loading">Loading your saved review…</p>
    <template v-if="saved">
      <details v-if="previousFocus" class="focus-check-in" :open="!saved.focusCheckIn">
        <summary>{{ saved.focusCheckIn ? 'Previous focus · checked in' : 'How did your previous focus go?' }}</summary>
        <p class="previous-focus">{{ previousFocus.focus }}</p>
        <p class="focus-hint">From another review of this game. Reflect on how it went in this match.</p>
        <label>Your assessment<select v-model="outcome" :disabled="busy || !!pending"><option value="">Choose when ready</option><option value="improved">I improved</option><option value="practising">Still practising</option><option value="not_tried">I haven’t tried it yet</option></select></label>
        <label>Reflection <span class="optional">Optional</span><textarea v-model="reflection" maxlength="1000" rows="2" :disabled="busy || !!pending" placeholder="What changed this match?" /></label>
        <button class="text-button" type="button" :disabled="busy || !!pending" @click="focus = previousFocus.focus">Keep this focus for next match</button>
      </details>
      <section class="review-section" aria-labelledby="moment-note-label">
        <div class="section-heading"><span class="section-number" aria-hidden="true">01</span><label id="moment-note-label" for="personal-moment-note">Review this moment</label></div>
        <div class="moment-anchor">
          <span><span class="anchor-label">{{ anchor ? 'Note pinned to' : 'Playback position' }}</span><strong>{{ formatSeconds(anchor ? anchor.position : currentTime) }}<span v-if="(anchor ? anchor.round : activeRoundNumber) !== null"> · R{{ (anchor ? anchor.round! : activeRoundNumber!) + 1 }}</span></strong></span>
          <button v-if="anchor" type="button" class="text-button" :disabled="busy || !!pending" @click="capture">Use current time</button>
        </div>
        <textarea id="personal-moment-note" v-model="text" rows="4" maxlength="2000" :disabled="busy || !!pending" @focus="begin" placeholder="What happened? What would you do differently?" aria-describedby="personal-moment-help" />
        <p id="personal-moment-help" class="field-help">Starting a note pauses playback and pins its timestamp.</p>
      </section>
      <section class="review-section" aria-labelledby="next-focus-label">
        <div class="section-heading"><span class="section-number" aria-hidden="true">02</span><label id="next-focus-label" for="personal-next-focus">Choose your next-match focus</label></div>
        <input id="personal-next-focus" v-model="focus" maxlength="200" :disabled="busy || !!pending" placeholder="One specific thing to practise" />
      </section>
      <div class="review-save">
        <button class="primary" type="button" :disabled="busy || loading || !dirty" @click="save()">{{ busy ? 'Saving review…' : pending ? 'Retry save' : 'Save review' }}</button>
        <p class="save-status" :class="{ 'is-dirty': dirty }" role="status">{{ busy ? 'Saving to your account…' : pending ? 'Save unconfirmed. Your draft is still here.' : dirty ? 'Unsaved changes' : status || 'No unsaved changes' }}</p>
      </div>
      <details v-if="saved.notes.length" class="saved-notes" open>
        <summary>Saved moments <span>{{ saved.notes.length }}</span></summary>
        <article v-for="note in saved.notes" :key="note.id" class="saved-note">
          <div class="saved-note__header">
            <button type="button" class="note-time" @click="seekToTime(note.position)" :aria-label="`Watch note at ${formatSeconds(note.position)}`"><span aria-hidden="true">▷</span> {{ formatSeconds(note.position) }}<span v-if="note.round !== null"> · R{{ note.round + 1 }}</span></button>
            <button class="delete-note" type="button" :disabled="busy || dirty" @click="remove(note.id)" :aria-label="`Delete note at ${formatSeconds(note.position)}`">Delete</button>
          </div>
          <p>{{ note.text }}</p>
        </article>
      </details>
      <div v-else class="notes-empty"><strong>No saved moments yet</strong><p>Save a note above to return to that moment later.</p></div>
    </template>
  </section>
</template>
<style scoped>
.personal-review { --review-accent: #ee3157; padding: 20px; border: 1px solid #333b46; border-radius: 6px; background: #11161d; color: #d5dce6; font-size: 12px; }
.review-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.review-kicker { margin: 0 0 6px; font-size: 9px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: #f96a87; }
h3 { margin: 0; font-size: 19px; font-weight: 750; letter-spacing: -.02em; color: #f5f7fa; }
.review-intro { margin: 12px 0 20px; color: #aeb9c8; line-height: 1.7; }
button, input, textarea, select { font: inherit; color: inherit; }
button { cursor: pointer; min-height: 36px; border: 1px solid #424c5b; border-radius: 4px; background: #1a222c; padding: 8px 10px; }
button:hover:not(:disabled) { border-color: #8493a7; background: #24303d; }
button:disabled { opacity: .5; cursor: not-allowed; }
input, textarea, select { display: block; width: 100%; box-sizing: border-box; min-width: 0; padding: 11px 12px; background: #0b1016; border: 1px solid #495667; border-radius: 4px; line-height: 1.6; }
input::placeholder, textarea::placeholder { color: #8e9aac; }
textarea { resize: vertical; }
.review-section { padding-top: 20px; border-top: 1px solid #2c3541; margin-top: 20px; }
.section-heading { display: flex; align-items: center; gap: 9px; margin-bottom: 12px; }
.section-heading label { color: #e4e9f0; font-weight: 650; line-height: 1.5; }
.section-number { color: #fa718b; font-size: 10px; font-weight: 800; }
.moment-anchor { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.anchor-label { display: block; margin-bottom: 4px; font-size: 10px; color: #95a4b7; }
.moment-anchor strong { font-size: 12px; font-variant-numeric: tabular-nums; color: #e4eaf2; }
.text-button, .reload-button { background: transparent; font-size: 11px; }
.text-button { border-color: transparent; color: #c7d2e1; text-decoration: underline; text-underline-offset: 3px; }
.field-help { margin: 8px 0 0; color: #99a7b9; font-size: 11px; line-height: 1.6; }
.review-save { margin-top: 20px; }
.primary { width: 100%; background: #ce183e; border-color: #f15474; color: white; font-weight: 750; min-height: 42px; }
.primary:hover:not(:disabled) { background: #e0234b; border-color: #ff849f; }
.save-status { margin: 9px 0 0; color: #aab8c9; font-size: 11px; line-height: 1.6; }
.save-status.is-dirty { color: #e9bc76; }
.focus-check-in { padding: 14px; background: #18212b; border: 1px solid #364454; border-radius: 4px; }
summary { cursor: pointer; min-height: 32px; line-height: 1.6; font-weight: 650; color: #dae2ed; }
.previous-focus { margin: 10px 0; color: #f0f3f7; font-weight: 600; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.focus-hint { color: #a7b4c5; font-size: 11px; line-height: 1.6; }
.focus-check-in label { display: grid; gap: 6px; margin-top: 14px; }
.optional { color: #91a0b3; font-size: 10px; }
.saved-notes { margin-top: 24px; border-top: 1px solid #34404e; padding-top: 16px; }
.saved-notes summary span { margin-left: 7px; color: #91a3b9; font-variant-numeric: tabular-nums; }
.saved-note { border-top: 1px solid #2c3541; padding: 12px 0; }
.saved-note__header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.note-time { background: transparent; border-color: transparent; padding-left: 0; font-weight: 700; color: #dbe6f5; font-variant-numeric: tabular-nums; }
.delete-note { padding: 6px; border-color: transparent; background: transparent; color: #9caabd; font-size: 10px; }
.delete-note:hover:not(:disabled) { color: #ff8aa1; }
.saved-note p { margin: 8px 0 0; color: #bdc9d8; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.notes-empty { margin-top: 24px; border-top: 1px solid #34404e; padding-top: 18px; color: #a3b0c2; line-height: 1.6; }
.notes-empty strong { color: #c1ccda; font-size: 12px; font-weight: 600; }
.notes-empty p { margin: 6px 0 0; font-size: 11px; }
.review-message { margin: 16px 0; padding: 12px; line-height: 1.7; overflow-wrap: anywhere; }
.review-message--error { background: #351a24; border: 1px solid #a2435c; border-radius: 4px; color: #ffbbca; }
.review-loading { color: #abb9cb; padding: 16px 0; }
:is(button,input,textarea,select,summary):focus-visible { outline: 2px solid #ff718e; outline-offset: 3px; }
@media(max-width: 420px) { .personal-review { padding: 16px; } }
</style>
