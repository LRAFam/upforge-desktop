<script setup lang="ts">
/**
 * Practice → Analytics → Recent runs with "Remove". Confirms in a plain dialog first, then
 * window.api.trainer.removeRun; on success the row goes at once and `removed` asks the parent to
 * reload history (bests, trend). On failure the dialog stays open with a calm error.
 */
import { computed, ref } from 'vue'
import UfButton from '../UfButton.vue'
import UfDialog from '../UfDialog.vue'
import { REMOVE_RUN_BODY, REMOVE_RUN_TITLE, recentRunRows, type RecentRunInput, type RecentRunRow } from './practice-recent-runs'

const props = defineProps<{
  sessions: readonly RecentRunInput[] | null | undefined
  labelFor: (scenario: string) => string
}>()
const emit = defineEmits<{ removed: [id: number] }>()

const removedIds = ref(new Set<number>())
const rows = computed(() => recentRunRows(props.sessions, props.labelFor, removedIds.value))
const pending = ref<RecentRunRow | null>(null)
const busy = ref(false)
const error = ref('')

function ask(row: RecentRunRow) {
  pending.value = row
  error.value = ''
}
function close() {
  if (busy.value) return
  pending.value = null
  error.value = ''
}
async function confirm() {
  const row = pending.value
  if (!row || busy.value) return
  busy.value = true
  error.value = ''
  const res = await window.api.trainer.removeRun(row.id).catch(() => ({ ok: false as const, error: 'Couldn’t remove that run. Try again in a moment.' }))
  busy.value = false
  if (!res.ok) {
    error.value = res.error
    return
  }
  removedIds.value = new Set([...removedIds.value, row.id])
  pending.value = null
  emit('removed', row.id)
}
</script>

<template>
  <section v-if="rows.length" class="uf-rr uf-rise">
    <span class="uf-label">Recent runs</span>
    <ul class="uf-rr-rows">
      <li v-for="r in rows" :key="r.id" class="uf-rr-row">
        <span class="uf-t3 uf-rr-name">{{ r.label }}</span>
        <span class="uf-t3 uf-num uf-rr-cell">{{ r.score }}</span>
        <span class="uf-t4 uf-num uf-rr-cell">{{ r.accuracy }}</span>
        <span class="uf-t4 uf-rr-when">{{ r.when }}</span>
        <button type="button" class="uf-rr-remove" :aria-label="`Remove run: ${r.label}, ${r.when}`" @click="ask(r)">Remove</button>
      </li>
    </ul>

    <UfDialog :open="!!pending" :title="REMOVE_RUN_TITLE" :persistent="busy" @close="close">
      <p v-if="pending" class="uf-t3" style="margin: 0">{{ pending.label }} · {{ pending.score }} · {{ pending.when }}</p>
      <p class="uf-t2" style="margin: 0">{{ REMOVE_RUN_BODY }}</p>
      <p v-if="error" class="uf-t4" role="alert" style="margin: 0; color: var(--uf-red)">{{ error }}</p>
      <template #actions>
        <UfButton variant="secondary" :disabled="busy" @click="close">Cancel</UfButton>
        <UfButton variant="secondary" :disabled="busy" @click="confirm">{{ busy ? 'Removing…' : 'Remove run' }}</UfButton>
      </template>
    </UfDialog>
  </section>
</template>

<style scoped>
.uf-rr { display: flex; flex-direction: column; }
.uf-rr-rows { list-style: none; margin: 10px 0 0; padding: 0; }
.uf-rr-row { display: flex; align-items: center; gap: 18px; padding: 10px 0; border-top: 1px solid var(--uf-line); }
.uf-rr-name { flex: 1; min-width: 0; }
.uf-rr-cell { width: 56px; text-align: right; flex: none; }
.uf-rr-when { width: 64px; text-align: right; flex: none; }
.uf-rr-remove { background: none; border: 0; padding: 4px 0; color: var(--uf-muted); font: 600 13px/1 var(--uf-body); cursor: pointer; flex: none; }
.uf-rr-remove:hover { color: var(--uf-bone); text-decoration: underline; }
.uf-rr-remove:focus-visible { outline: 2px solid var(--uf-bone); outline-offset: 2px; }
</style>
