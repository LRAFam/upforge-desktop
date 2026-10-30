<script setup lang="ts">
/** Deadlock replay review as a dialog (Matches / Progress). The body lives in DeadlockReviewContentV3. */
import { ref } from 'vue'
import UfDialog from '../UfDialog.vue'
import DeadlockReviewContentV3 from './DeadlockReviewContentV3.vue'

const props = defineProps<{ open: boolean; jobId: string | null; hero?: string | null }>()
const emit = defineEmits<{ close: [] }>()
const title = ref(props.hero ?? 'Deadlock match')
function openWeb() {
  if (props.jobId) void window.api.deadlock.openResults(props.jobId)
}
</script>

<template>
  <UfDialog :open="open" kicker="Replay review" :title="title" :width="900" @close="emit('close')">
    <DeadlockReviewContentV3 :active="open" :job-id="jobId" :hero="hero" @title="title = $event" />
    <template #actions>
      <button type="button" class="uf-link" @click="openWeb">Full report on the web →</button>
    </template>
  </UfDialog>
</template>
