<script setup lang="ts">
/**
 * Coach notes on the match page (UI v3), shown when a coach opens a student's match from the
 * review queue (?coachReviewId=). Write a note at the current video time; it's pinned there.
 * Drafts autosave on this PC; "Submit to student" asks first, then posts and completes.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useVodReview } from '../../../composables/useVodReview'
import UfButton from '../UfButton.vue'
import UfDialog from '../UfDialog.vue'
import {
  addNote, clearDraft, clock, CLOSING_MAX, emptyDraft, loadDraft, NOTE_MAX, removeNote,
  saveDraft, submitBlocker, submitDraft, type CoachNotesDraft,
} from './coach-notes'

const props = defineProps<{ reviewId: number }>()
const emit = defineEmits<{ submitted: [] }>()

const { currentTime, activeRoundNumber, seekToTime } = useVodReview()

const scope = ref('anon')
const draft = ref<CoachNotesDraft>(emptyDraft(props.reviewId))
const input = ref('')
const error = ref<string | null>(null)
const saved = ref(false)
const status = ref<string | null>(null)
const studentQuestion = ref<string | null>(null)
const onServer = ref(0)
const reviewOpen = ref(false)
const submitting = ref(false)
const done = ref(false)

const unsent = computed(() => draft.value.notes.filter(n => n.postedId == null).length)
const total = computed(() => draft.value.notes.length + onServer.value)
const blocker = computed(() => submitBlocker(draft.value, onServer.value))
const here = computed(() => {
  const t = clock(Math.round(currentTime.value * 1000))
  return activeRoundNumber.value != null ? `${t} · Round ${activeRoundNumber.value}` : t
})

function persist(d: CoachNotesDraft) {
  draft.value = d
  saved.value = saveDraft(scope.value, d)
}

function add() {
  error.value = null
  const res = addNote(draft.value, input.value, { offsetMs: Math.round(currentTime.value * 1000), round: activeRoundNumber.value })
  if (res.error) { error.value = res.error; return }
  persist(res.draft)
  input.value = ''
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add() }
}

watch(() => draft.value.closing, () => persist({ ...draft.value }))

async function submit() {
  if (blocker.value || submitting.value) return
  submitting.value = true
  error.value = null
  const res = await submitDraft(draft.value, window.api.coach, d => persist(d))
  submitting.value = false
  if (!res.ok) { persist(res.draft); error.value = res.error; return }
  clearDraft(scope.value, props.reviewId)
  draft.value = emptyDraft(props.reviewId)
  reviewOpen.value = false
  done.value = true
  emit('submitted')
}

onMounted(async () => {
  try {
    const user = await window.api.auth.getUser() as { id?: number } | null
    if (user?.id != null) scope.value = `user-${user.id}`
  } catch { /* keep anon scope */ }
  draft.value = loadDraft(scope.value, props.reviewId)
  saved.value = draft.value.notes.length > 0 || !!draft.value.closing
  try {
    const review = await window.api.coach.getReviewAnnotations(props.reviewId)
    if (review) {
      status.value = review.status
      studentQuestion.value = review.student_question
      onServer.value = review.annotations?.length ?? 0
      if (review.status === 'completed') done.value = true
    }
  } catch { /* the editor still works offline from the draft */ }
})
</script>

<template>
  <section class="cn3" aria-label="Coach notes">
    <p v-if="done" class="uf-t4 cn3-done">Review completed. Your notes are on the student’s match timeline.</p>
    <template v-else>
      <div class="cn3-row">
        <span class="uf-label cn3-at" :title="'The note is pinned to this video time'">Note at {{ here }}</span>
        <input
          id="coach-note-input"
          v-model="input"
          class="cn3-input"
          :maxlength="NOTE_MAX"
          placeholder="What should they see here? (Ctrl/Cmd + Enter to add)"
          aria-label="Coach note at the current video time"
          @keydown="onKey"
        >
        <UfButton variant="secondary" icon="chat" :disabled="!input.trim()" @click="add">Add note</UfButton>
        <span class="cn3-spacer" />
        <span class="uf-t4">{{ total }} {{ total === 1 ? 'note' : 'notes' }}<template v-if="saved && unsent"> · draft saved on this PC</template></span>
        <UfButton variant="primary" icon="check" :disabled="!!blocker" :title="blocker ?? undefined" @click="reviewOpen = true">Submit to student</UfButton>
      </div>
      <p v-if="studentQuestion" class="uf-t4 cn3-q">They asked: “{{ studentQuestion }}”</p>
      <p v-if="error" class="uf-t4 cn3-err" role="alert">{{ error }}</p>
    </template>

    <UfDialog :open="reviewOpen" title="Submit to student" kicker="Coach notes" :width="620" :persistent="submitting" @close="reviewOpen = false">
      <p class="uf-t2" style="margin: 0">
        {{ unsent }} new {{ unsent === 1 ? 'note' : 'notes' }} will be added to their match timeline and the review is marked complete.
        They get a notification.
      </p>
      <ol class="cn3-list">
        <li v-for="n in draft.notes" :key="n.key">
          <button type="button" class="uf-link cn3-time" :aria-label="`Jump to ${clock(n.offsetMs)}`" @click="n.offsetMs != null && seekToTime(Math.max(0, n.offsetMs / 1000 - 3))">{{ clock(n.offsetMs) }}<template v-if="n.round"> · R{{ n.round }}</template></button>
          <span class="uf-t3 cn3-body">{{ n.body }}</span>
          <span v-if="n.postedId != null" class="uf-t4">sent</span>
          <button v-else type="button" class="cn3-x" aria-label="Remove this note" @click="persist(removeNote(draft, n.key))">×</button>
        </li>
      </ol>
      <label class="uf-label" for="coach-closing">Closing note (optional)</label>
      <textarea id="coach-closing" v-model="draft.closing" class="cn3-input cn3-area" :maxlength="CLOSING_MAX" rows="4" placeholder="The one thing to work on next." />
      <p class="uf-t4" style="margin: 0">{{ draft.closing.length }} / {{ CLOSING_MAX.toLocaleString('en-GB') }}</p>
      <p v-if="error" class="uf-t4 cn3-err" role="alert">{{ error }}</p>
      <template #actions>
        <UfButton variant="link" :disabled="submitting" @click="reviewOpen = false">Keep editing</UfButton>
        <UfButton variant="primary" icon="check" :disabled="submitting || !!blocker" @click="submit">{{ submitting ? 'Submitting…' : 'Submit and complete' }}</UfButton>
      </template>
    </UfDialog>
  </section>
</template>

<style scoped>
.cn3 { display: flex; flex-direction: column; gap: 6px; padding: 10px 0; border-bottom: 1px solid var(--uf-line); }
.cn3-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.cn3-at { white-space: nowrap; font-variant-numeric: tabular-nums; }
.cn3-input { flex: 1 1 320px; min-width: 0; background: var(--uf-raised); border: 1px solid var(--uf-line); color: var(--uf-bone); font: 400 15px/1.4 var(--uf-body); padding: 8px 10px; border-radius: 2px; }
.cn3-input:focus { outline: none; border-color: var(--uf-muted); }
.cn3-area { width: 100%; resize: vertical; }
.cn3-spacer { flex: 1; }
.cn3-q { margin: 0; color: var(--uf-muted); }
.cn3-err { margin: 0; color: var(--uf-loss); }
.cn3-done { margin: 0; }
.cn3-list { list-style: none; margin: 0; padding: 0; max-height: 280px; overflow: auto; }
.cn3-list li { display: grid; grid-template-columns: 96px minmax(0, 1fr) auto; gap: 12px; align-items: baseline; padding: 8px 0; border-bottom: 1px solid var(--uf-line); }
.cn3-time { font-variant-numeric: tabular-nums; text-align: left; }
.cn3-body { overflow-wrap: anywhere; }
.cn3-x { background: none; border: 0; color: var(--uf-muted); cursor: pointer; font: 400 16px/1 var(--uf-body); padding: 2px 6px; }
.cn3-x:hover { color: var(--uf-bone); }
</style>
