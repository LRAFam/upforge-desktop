<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { notebookWriteForIpc, validNotebookContext, validSavedComparison, relinkNotebook, type NotebookRelink, editNotebookNote, checkInFocus, type NotebookWrite, type FocusCheckIn, type NotebookContext, type NotebookNote, type SavedComparison } from '../../lib/review-notebook'

const props = defineProps<{ initialComparisonId?: string;  capture: () => NotebookContext | null; restoring: boolean }>()
const emit = defineEmits<{ restore: [context: NotebookContext, attachment: 'a' | 'b' | 'both', item: SavedComparison]; close: []; itemsChanged: [items: SavedComparison[]] }>()
const notebookElement = ref<HTMLElement | null>(null)
const items = ref<SavedComparison[]>([])
watch(items, value => emit('itemsChanged', value), { immediate: true })
const selectedNoteId = ref<string | null>(null)
let draftId = crypto.randomUUID()
const active = ref<SavedComparison | null>(null)
const title = ref('')
const focus = ref('')
const noteText = ref('')
const attachment = ref<'a' | 'b' | 'both'>('both')
const editing = ref<{ item: SavedComparison; note: NotebookNote; text: string } | null>(null)
const revisiting = ref<SavedComparison | null>(null)
const outcome = ref<FocusCheckIn['outcome'] | ''>('')
const reflection = ref('')
const focusItems = computed(() => items.value.filter(item => item.focus.trim()))
const scope = ref<'current' | 'all'>('current')
const busy = ref(false)
const status = ref('')
const error = ref('')
const loading = ref(false)
let generation = 0
let alive = true
const dirty = computed(() => editing.value !== null || revisiting.value !== null || !!noteText.value.trim() || title.value !== (active.value?.title ?? '') || focus.value !== (active.value?.focus ?? ''))
const visibleNotes = computed(() => scope.value === 'all'
  ? items.value.flatMap(item => item.notes.map(note => ({ note, item })))
  : (active.value?.notes ?? []).map(note => ({ note, item: active.value! })))
const confirmDiscard = () => !dirty.value || window.confirm('Discard your unsaved notebook draft?')
function clearAccount() { generation++; selectedNoteId.value = null; editing.value = null; revisiting.value = null; items.value = []; active.value = null; title.value = ''; focus.value = ''; noteText.value = ''; error.value = ''; status.value = ''; busy.value = false }
onBeforeRouteLeave(() => busy.value ? false : confirmDiscard())
const cleanup = [window.api.on('session:user-changed', clearAccount), window.api.on('auth:session-expired', clearAccount)]
onBeforeUnmount(() => { alive = false; generation++; cleanup.forEach(fn => fn()) })
let initialOpened = false
const search = ref('')
const filteredItems = computed(() => items.value.filter(item => [item.title, item.focus, ...item.context.moments.map(m => m.source.label)].join(' ').toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())))
onMounted(load)
async function load() {
  const current = ++generation
  loading.value = true; error.value = ''
  try {
    const result = await window.api.reviewNotebook.list()
    if (!alive || current !== generation) return
    if (!result.ok) { error.value = result.error; return }
    if (!Array.isArray(result.data.items) || !result.data.items.every(validSavedComparison)) { error.value = 'Notebook returned an unsupported entry. Your draft has been kept.'; return }
    items.value = result.data.items
    if (props.initialComparisonId && !initialOpened) {
      initialOpened = true
      const item = items.value.find(item => item.id === props.initialComparisonId)
      if (item) open(item); else error.value = 'This saved comparison is no longer available.'
    }
  } catch { if (alive && current === generation) error.value = 'Notebook unavailable. Reopen the updated app and try again.' }
  finally { if (alive && current === generation) loading.value = false }
}
function open(item: SavedComparison) {
  if (!confirmDiscard()) return
  editing.value = null; revisiting.value = null
  active.value = item; title.value = item.title; focus.value = item.focus; noteText.value = ''; status.value = ''; error.value = ''
  emit('restore', item.context, 'both', item)
}
function newComparison() {
  if (!confirmDiscard()) return
  editing.value = null; revisiting.value = null
  draftId = crypto.randomUUID()
  active.value = null; title.value = ''; focus.value = ''; noteText.value = ''; status.value = ''; error.value = ''
}
async function save(withNote = false) {
  if (busy.value) return
  const context = props.capture()
  if (!context || !validNotebookContext(context)) { error.value = 'Load both recordings before saving this comparison.'; return }
  if (!title.value.trim()) { error.value = 'Give this comparison a title.'; return }
  if (withNote && !noteText.value.trim()) return
  const notes = [...(active.value?.notes ?? [])]
  if (withNote) notes.push({ id: crypto.randomUUID(), text: noteText.value.trim(), attachment: attachment.value, context, createdAt: new Date().toISOString() })
  const id = active.value?.id ?? draftId
  const current = generation
  busy.value = true; error.value = ''; status.value = ''
  try {
    const result = await window.api.reviewNotebook.save(id, notebookWriteForIpc({ revision: active.value?.revision ?? 0, title: title.value.trim(), focus: focus.value.trim(), context, notes, focusCheckIn: active.value?.focus === focus.value.trim() ? active.value.focusCheckIn : null }))
    if (!alive || current !== generation) return
    if (!result.ok) { error.value = result.error; return }
    if (!validSavedComparison(result.data)) { error.value = 'Save could not be verified. Refresh the list before retrying.'; return }
    active.value = result.data; title.value = result.data.title; focus.value = result.data.focus
    items.value = [result.data, ...items.value.filter(i => i.id !== id)]
    if (withNote) noteText.value = ''
    status.value = withNote ? 'Note and moments saved to your account.' : 'Comparison and focus saved to your account.'
  } catch (cause) { console.error('Notebook save failed', cause); if (alive && current === generation) error.value = 'Could not save. Your draft is still open; try again.' }
  finally { if (alive && current === generation) busy.value = false }
}
function beginEdit(item: SavedComparison, note: NotebookNote) {
  if (busy.value || !confirmDiscard()) return
  noteText.value = ''; revisiting.value = null
  title.value = active.value?.title ?? ''; focus.value = active.value?.focus ?? ''
  editing.value = { item, note, text: note.text }; status.value = ''; error.value = ''
}
function revisit(item: SavedComparison) {
  if (busy.value || !confirmDiscard()) return
  noteText.value = ''; editing.value = null
  title.value = active.value?.title ?? ''; focus.value = active.value?.focus ?? ''
  revisiting.value = item; outcome.value = item.focusCheckIn?.outcome ?? ''; reflection.value = item.focusCheckIn?.reflection ?? ''
  status.value = ''; error.value = ''
}
async function persistExisting(item: SavedComparison, document: NotebookWrite, success: string) {
  if (busy.value) return
  const current = generation
  busy.value = true; error.value = ''; status.value = ''
  try {
    const result = await window.api.reviewNotebook.save(item.id, notebookWriteForIpc(document))
    if (!alive || current !== generation) return
    if (!result.ok) { error.value = result.error; return }
    if (!validSavedComparison(result.data)) { error.value = 'Save could not be verified. Refresh the list before retrying.'; return }
    items.value = items.value.map(existing => existing.id === item.id ? result.data : existing)
    if (active.value?.id === item.id) { active.value = result.data; title.value = result.data.title; focus.value = result.data.focus }
    editing.value = null; revisiting.value = null; status.value = success
    return true
  } catch (cause) { console.error('Notebook save failed', cause); if (alive && current === generation) error.value = 'Could not save. Your draft is still open; try again.' }
  finally { if (alive && current === generation) busy.value = false }
}
async function deleteNote(item: SavedComparison, note: NotebookNote) {
  if (busy.value || dirty.value) { error.value = 'Save or cancel your draft before deleting a note.'; return }
  if (!window.confirm('Delete this note from your account? Its saved timestamps will also be removed. This cannot be undone.')) return
  const { id: _id, updatedAt: _updatedAt, ...document } = item
  await persistExisting(item, { ...document, notes: item.notes.filter(entry => entry.id !== note.id) }, 'Note deleted from your account.')
}
async function deleteComparison(item: SavedComparison) {
  if (busy.value || dirty.value) { error.value = 'Save or cancel your draft before deleting a comparison.'; return }
  if (!window.confirm(`Delete “${item.title}” and its ${item.notes.length} notes from your account? Footage will be kept. This cannot be undone.`)) return
  const current = generation
  busy.value = true; error.value = ''; status.value = ''
  try {
    const result = await window.api.reviewNotebook.remove(item.id, item.revision)
    if (!alive || current !== generation) return
    if (!result.ok) { error.value = result.error; return }
    if (result.data.id !== item.id || result.data.deleted !== true) { error.value = 'Deletion could not be verified. Refresh the list before retrying.'; return }
    items.value = items.value.filter(entry => entry.id !== item.id)
    if (active.value?.id === item.id) { active.value = null; title.value = ''; focus.value = ''; noteText.value = ''; selectedNoteId.value = null; draftId = crypto.randomUUID() }
    status.value = 'Comparison and notes deleted. Footage kept.'
  } catch { if (alive && current === generation) error.value = 'Deletion could not be verified. Refresh the list before retrying.' }
  finally { if (alive && current === generation) busy.value = false }
}
async function saveEdit() {
  if (!editing.value) return
  const document = editNotebookNote(editing.value.item, editing.value.note.id, editing.value.text)
  if (document) await persistExisting(editing.value.item, document, 'Note updated. Its original moments are unchanged.')
}
async function saveCheckIn() {
  if (!revisiting.value || !outcome.value) return
  const document = checkInFocus(revisiting.value, outcome.value, reflection.value, new Date().toISOString())
  if (document) await persistExisting(revisiting.value, document, 'Focus check-in saved to your account.')
}
function outcomeLabel(value: FocusCheckIn['outcome']) { return { improved: 'Improved', practising: 'Still practising', not_tried: 'Not tried yet' }[value] }
function stamp(n: number) { return `${Math.floor(n / 60)}:${(n % 60).toFixed(1).padStart(4, '0')}` }
function restoreNote(note: NotebookNote, item: SavedComparison) { emit('restore', note.context, note.attachment, item) }
function openSavedNote(item: SavedComparison, note: NotebookNote) {
  if (busy.value || !confirmDiscard()) return false
  editing.value = null; revisiting.value = null; noteText.value = ''
  active.value = item; title.value = item.title; focus.value = item.focus; scope.value = 'current'
  selectedNoteId.value = note.id; status.value = ''; error.value = ''
  restoreNote(note, item)
  void nextTick(() => {
    const entry = [...(notebookElement.value?.querySelectorAll<HTMLElement>('[data-note-id]') ?? [])].find(node => node.dataset.noteId === note.id)
    entry?.scrollIntoView({ block: 'nearest' })
    entry?.focus({ preventScroll: true })
  })
  return true
}
function canClose() { return !busy.value && confirmDiscard() }
async function saveRelink(item: SavedComparison, changes: NotebookRelink[]) {
  if (busy.value || dirty.value) { error.value = 'Save or cancel your notebook draft before saving replacement footage.'; return false }
  const latest = items.value.find(entry => entry.id === item.id)
  if (!latest || latest.revision !== item.revision) { error.value = 'Reopen the comparison before updating its footage links.'; return false }
  const document = relinkNotebook(latest, changes)
  return document ? !!await persistExisting(latest, document, 'Replacement footage saved. Notes and timestamps are unchanged.') : false
}
defineExpose({ canClose, saveRelink, openSavedNote })
</script>
<template>
  <aside ref="notebookElement" class="notebook" aria-label="Review notebook" @keydown.stop>
    <header><h2>Review notebook</h2><button type="button" aria-label="Collapse notebook" @click="emit('close')">Hide</button></header>
    <p class="privacy">Private · Account notebook</p>
    <details><summary>Saved comparisons ({{ items.length }})</summary>
      <button type="button" :disabled="busy" @click="newComparison">New comparison</button>
      <button type="button" :disabled="busy || loading" @click="load">{{ loading ? 'Loading…' : 'Refresh list' }}</button>
      <label>Find a comparison<input v-model="search" type="search" placeholder="Title, match or focus" /></label>
      <p v-if="items.length && !filteredItems.length">No matching comparisons.</p>
      <div v-for="item in filteredItems" :key="item.id" class="saved-row"><button class="saved-entry" type="button" :disabled="busy" @click="open(item)">{{ item.title }}</button><button type="button" class="delete-action" :aria-label="`Delete comparison ${item.title}`" :disabled="busy" @click="deleteComparison(item)">Delete</button></div>
      <p v-if="!loading && !items.length">No comparisons loaded.</p>
    </details>
    <details class="focus-list"><summary>Revisit a focus ({{ focusItems.length }})</summary>
      <p v-if="!focusItems.length" class="privacy">Saved focus areas will appear here for your next review.</p>
      <div v-for="item in focusItems" :key="item.id" class="focus-entry">
        <p>{{ item.focus }}</p><span class="privacy">{{ item.title }} · {{ item.focusCheckIn ? outcomeLabel(item.focusCheckIn.outcome) : 'No check-in yet' }}</span>
        <button type="button" :disabled="busy" @click="revisit(item)">Check in</button>
      </div>
    </details>
    <section v-if="revisiting" class="editor" aria-label="Focus check-in">
      <h3>How did it go?</h3><p>{{ revisiting.focus }}</p>
      <label>Self-assessment<select v-model="outcome" :disabled="busy"><option disabled value="">Choose an outcome</option><option value="improved">Improved</option><option value="practising">Still practising</option><option value="not_tried">Not tried yet</option></select></label>
      <label>Reflection (optional)<textarea v-model="reflection" maxlength="1000" rows="3" :disabled="busy" placeholder="What happened when you tried it?" /></label>
      <button type="button" :disabled="busy || restoring" @click="emit('restore', revisiting.context, 'both', revisiting)">Revisit original moments</button>
      <div class="note-actions"><button type="button" class="primary" :disabled="busy || !outcome" @click="saveCheckIn">Save check-in</button><button type="button" :disabled="busy" @click="revisiting = null">Cancel</button></div>
    </section>
    <section v-if="editing" class="editor" aria-label="Edit saved note">
      <h3>Edit note</h3><p class="privacy">{{ editing.item.title }} · Original timestamps retained</p>
      <label>Note text<textarea v-model="editing.text" maxlength="2000" rows="4" :disabled="busy" /></label>
      <div class="note-actions"><button type="button" class="primary" :disabled="busy || !editing.text.trim()" @click="saveEdit">Save edit</button><button type="button" :disabled="busy" @click="editing = null">Cancel</button></div>
    </section>
    <div v-show="!editing && !revisiting">
    <label>Comparison title<input v-model="title" maxlength="120" :disabled="busy" placeholder="e.g. Waiting for support" /></label>
    <button v-if="active" type="button" :disabled="restoring || busy" @click="emit('restore', active.context, 'both', active)">Restore saved moments</button>
    <label>Next-match focus<textarea v-model="focus" rows="2" maxlength="200" :disabled="busy" placeholder="One thing to practise next match" /></label>
    <button type="button" class="primary" :disabled="busy || restoring" @click="save(false)">{{ busy ? 'Saving…' : 'Save comparison' }}</button>
    <div class="note-heading"><h3>Moment notes</h3><select v-model="scope" aria-label="Notes to show"><option value="current">This comparison</option><option value="all">All notes</option></select></div>
    <label>Add a note<textarea v-model="noteText" rows="3" maxlength="2000" :disabled="busy" placeholder="What would you repeat or change?" /></label>
    <div class="note-actions"><label>Attach to<select v-model="attachment" :disabled="busy"><option value="both">Both moments</option><option value="a">Moment A</option><option value="b">Moment B</option></select></label><button type="button" :disabled="busy || restoring || !noteText.trim()" @click="save(true)">Save note</button></div>
    </div>
    <p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="status" role="status">{{ status }}</p>
    <article v-for="entry in visibleNotes" :key="entry.note.id" class="note-entry" tabindex="-1" :data-note-id="entry.note.id" :class="{ selected: selectedNoteId === entry.note.id && active?.id === entry.item.id }">
      <span v-if="scope === 'all'" class="privacy">{{ entry.item.title }}</span>
      <p>{{ entry.note.text }}</p>
      <p class="privacy"><template v-if="entry.note.attachment !== 'b'">A {{ stamp(entry.note.context.moments[0].position) }} </template><template v-if="entry.note.attachment !== 'a'">B {{ stamp(entry.note.context.moments[1].position) }}</template></p>
      <button type="button" :disabled="restoring || busy" @click="restoreNote(entry.note, entry.item)">Restore {{ entry.note.attachment === 'both' ? 'moments' : `moment ${entry.note.attachment.toUpperCase()}` }}</button>
      <button type="button" :disabled="busy" @click="beginEdit(entry.item, entry.note)">Edit note</button>
      <button type="button" class="delete-action" :disabled="busy" @click="deleteNote(entry.item, entry.note)">Delete note</button>
    </article>
    <p class="privacy">Notes stay saved if footage expires. Unsaved drafts remain in this view until you leave.</p>
  </aside>
</template>
<style scoped>
.saved-row { display:flex; align-items:center; gap:6px; }.saved-row .saved-entry { flex:1; min-width:0; overflow-wrap:anywhere; }.delete-action { color:#ff9cac; }
.notebook { min-width: 0; background: #15181e; border: 1px solid #ffffff20; border-radius: 6px; padding: 14px; font-size: 12px; overflow: auto; max-height: calc(100dvh - 160px); }
header,.note-heading,.note-actions { display:flex; align-items:center; justify-content:space-between; gap:8px; } h2 {font-size:15px;font-weight:700;}h3 {font-weight:600;} .privacy {font-size:11px;color:#9da8b7;margin:8px 0;}label {display:grid;gap:6px;margin:12px 0;color:#b7c0cc;} input,textarea,select,button {font:inherit;color:#e6e8ed;background:#1a1d24;border:1px solid #ffffff28;border-radius:4px;padding:8px;min-width:0;}textarea {resize:vertical;}button,summary {cursor:pointer;}button:disabled{opacity:.5;cursor:default;}button:hover{border-color:#e11d48;}.primary {background:#d60838;border-color:#d60838;width:100%;} :is(input,textarea,select,button,summary):focus-visible{outline:2px solid #e11d48;outline-offset:2px;}details {border-block:1px solid #ffffff18;padding:10px 0;}details button{margin-top:8px;}.saved-entry {display:block;width:100%;text-align:left;}.note-heading{margin-top:20px;}.note-entry{border-top:1px solid #ffffff20;padding:12px 0;}.note-entry p {white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:8px;}.error{color:#ff9cac;margin:12px 0;}
.editor { margin: 12px 0; padding-block: 12px; border-block: 1px solid #ffffff25; }.editor>p,.focus-entry>p { margin-top: 8px; overflow-wrap: anywhere; }.focus-entry { padding: 10px 0; border-top: 1px solid #ffffff18; }.focus-entry button { display: block; }.note-entry button + button { margin-left: 6px; }
.note-entry.selected { border-left: 2px solid #e11d48; padding-left: 10px; }
</style>
