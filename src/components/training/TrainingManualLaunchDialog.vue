<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UfDialog from '../v3/UfDialog.vue'
import UfButton from '../v3/UfButton.vue'
import type { ManualTrainerRequest } from '../../composables/useManualTrainerLaunch'
import { TRAINER_BOARD_DIFFICULTIES, TRAINER_BOARD_DURATIONS, type ManualTrainerOptions } from '../../lib/manual-trainer-options'
import { difficultyLabel, drillBrief } from '../v3/practice/practice-v3'

const props = defineProps<{ request: ManualTrainerRequest | null; busy: boolean }>()
const emit = defineEmits<{ close: []; start: [options: ManualTrainerOptions] }>()
// The drill's goal, what to do and what a run records, so you know what success means before it opens.
const brief = computed(() => (props.request ? drillBrief(props.request.scenario) : null))
const difficulty = ref<ManualTrainerOptions['difficulty']>('medium')
const duration = ref(60)
watch(() => props.request, request => {
  if (!request) return
  difficulty.value = request.options.difficulty
  duration.value = request.options.duration_seconds
}, { immediate: true })
</script>

<template>
  <UfDialog :open="!!request" :title="request ? `Play ${request.label}` : ''" kicker="Manual practice" @close="emit('close')">
    <dl v-if="brief" class="uf-manual-brief">
      <div><dt class="uf-t4">Goal</dt><dd class="uf-t3">{{ brief.goal }}</dd></div>
      <div><dt class="uf-t4">How</dt><dd class="uf-t4">{{ brief.how }}</dd></div>
      <div><dt class="uf-t4">Scoring</dt><dd class="uf-t4">{{ brief.scored }}</dd></div>
    </dl>
    <p class="uf-t4" style="margin: 0 0 20px">Choose your settings. Your last choice is remembered for this drill and game.</p>
    <div class="uf-manual-fields">
      <label class="uf-manual-field"><span class="uf-t4">Difficulty</span>
        <select v-model="difficulty" class="uf-pselect" aria-label="Drill difficulty" :disabled="busy">
          <option v-for="d in TRAINER_BOARD_DIFFICULTIES" :key="d" :value="d">{{ difficultyLabel(d) }}</option>
        </select>
      </label>
      <label class="uf-manual-field"><span class="uf-t4">Length</span>
        <select v-model="duration" class="uf-pselect" aria-label="Drill length" :disabled="busy">
          <option v-for="seconds in TRAINER_BOARD_DURATIONS" :key="seconds" :value="seconds">{{ seconds }} seconds</option>
        </select>
      </label>
    </div>
    <template #actions>
      <UfButton variant="secondary" :disabled="busy" @click="emit('close')">Cancel</UfButton>
      <UfButton variant="primary" icon="play" :disabled="busy || !request" @click="emit('start', { difficulty, duration_seconds: duration })">
        Start {{ difficultyLabel(difficulty) }} · {{ duration }}s
      </UfButton>
    </template>
  </UfDialog>
</template>

<style scoped>
.uf-manual-brief { display: flex; flex-direction: column; gap: 10px; margin: 0 0 20px; }
.uf-manual-brief > div { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 12px; align-items: baseline; }
.uf-manual-brief dd { margin: 0; line-height: 1.5; }
.uf-manual-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.uf-manual-field { display: flex; flex-direction: column; gap: 8px; }
@media (max-width: 440px) { .uf-manual-fields { grid-template-columns: minmax(0, 1fr); } }
</style>
