<script setup lang="ts">
import type { TrainerScenarioKey, TrainerDifficulty } from '../../lib/trainer-scenarios'
import TrainingIcon from './TrainingIcon.vue'

export type VodDrill = {
  scenario: TrainerScenarioKey
  difficulty: TrainerDifficulty
  reason: string
  weakness_score: number
}

defineProps<{
  drills: VodDrill[]
  label: (key: TrainerScenarioKey) => string
  description: (key: TrainerScenarioKey) => string
  improvementPct: (key: TrainerScenarioKey) => number
  iconSrc: (key: TrainerScenarioKey) => string
  disabled?: boolean
}>()

const emit = defineEmits<{ play: [drill: VodDrill] }>()
</script>

<template>
  <div v-if="drills.length" class="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
    <div class="flex items-center gap-2 px-4 py-2.5 border-b border-white/10">
      <TrainingIcon name="precision" class="h-5 w-5 text-teal-400" />
      <span class="text-xs font-semibold text-gray-300">Recommended from your VODs</span>
    </div>
    <div class="divide-y divide-white/10">
      <button
        v-for="drill in drills"
        :key="`${drill.scenario}:${drill.reason}`"
        type="button"
        class="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-red-400 transition-colors text-left disabled:opacity-40"
        :disabled="disabled"
        @click="emit('play', drill)"
      >
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-teal-300">
          <TrainingIcon :name="drill.scenario" class="h-5 w-5" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[13px] font-bold text-white">{{ label(drill.scenario) }}</p>
          <p class="mt-1 text-xs leading-relaxed text-gray-400 line-clamp-2">{{ drill.reason || description(drill.scenario) }}</p>
        </div>
        <span class="shrink-0 text-xs font-semibold text-gray-300">Play <span aria-hidden="true">→</span></span>
      </button>
    </div>
  </div>
</template>
