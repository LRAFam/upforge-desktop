<script setup lang="ts">
/**
 * Match page: "Send to {name}" ("Send to a coach" with 2+). Hidden without a coach or an analysis; shows the existing review
 * instead of offering a second send; explains limits. Opens itself when the route has ?sendToCoach=1
 * (post-game hands off with that). Sending is always a deliberate tap in the sheet.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import RosterSendSheet from '../../rosters/RosterSendSheet.vue'
import UfButton from '../UfButton.vue'
import { sendLabel, sendStateFor } from './roster-flow'
import { blockedLine } from '../coaches/coach-format'
import { useStudentHub } from './useStudentHub'

const props = defineProps<{ analysisId: number | null; matchLabel: string }>()

const route = useRoute()
const { hub, refresh } = useStudentHub()
const open = ref(false)
const busy = ref(false)
const message = ref<string | null>(null)
const autoOpened = ref(false)

const state = computed(() => sendStateFor(hub.value, props.analysisId))
const statusText = (s: string, name: string) => (s === 'completed' ? 'notes ready' : s === 'in_progress' ? `${name} is reviewing it` : `waiting for ${name}`)
const buttonLabel = computed(() => (state.value.kind === 'ready' ? sendLabel(state.value.coaches) : ''))
const blockedText = computed(() => (state.value.kind === 'blocked'
  ? (state.value.coachName ? blockedLine(state.value.coachName, state.value.code, state.value.reason) : state.value.reason)
  : ''))

async function send(payload: { coachId: number; question?: string }) {
  if (props.analysisId == null) return
  busy.value = true
  message.value = null
  try {
    const res = await window.api.coach.requestRosterReview({ analysisId: props.analysisId, coachId: payload.coachId, question: payload.question })
    if (!res.ok) { message.value = res.error || 'Could not send this match.'; return }
    open.value = false
    const name = state.value.kind === 'ready' ? state.value.coaches.find(c => c.coach_id === payload.coachId)?.display_name : null
    message.value = `Sent. ${name ?? 'Your coach'} will write notes on this match’s timeline.`
    await refresh(true)
  } finally {
    busy.value = false
  }
}

watch([state, () => route.query.sendToCoach], ([s, q]) => {
  if (!autoOpened.value && q === '1' && s.kind === 'ready') { autoOpened.value = true; open.value = true }
}, { immediate: true })

onMounted(() => { void refresh() })
</script>

<template>
  <div v-if="state.kind !== 'hidden'" class="sc3">
    <template v-if="state.kind === 'ready'">
      <UfButton variant="secondary" icon="team" @click="open = true">{{ buttonLabel }}</UfButton>
    </template>
    <span v-else-if="state.kind === 'already'" class="uf-t4">Sent to {{ state.coachName }} · {{ statusText(state.status, state.coachName) }}</span>
    <span v-else-if="state.kind === 'blocked'" class="uf-t4">{{ blockedText }}</span>
    <span v-if="message" class="uf-t4" role="status">{{ message }}</span>
    <RosterSendSheet
      v-if="state.kind === 'ready'"
      :open="open"
      :match-label="matchLabel"
      :coaches="state.coaches"
      :busy="busy"
      @close="open = false"
      @send="send"
    />
  </div>
</template>

<style scoped>
.sc3 { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
</style>
