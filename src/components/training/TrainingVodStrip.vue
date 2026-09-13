<script setup lang="ts">
import type { TrainerScenarioKey, TrainerDifficulty } from '../../lib/trainer-scenarios'
import { TRAINING_ARTWORK } from '../../lib/training-icons'

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
      <img :src="TRAINING_ARTWORK.vodRecommend" alt="" aria-hidden="true" class="w-5 h-5 rounded object-cover flex-shrink-0" />
      <span class="text-xs font-semibold text-gray-300">Recommended from your VODs</span>
    </div>
    <div class="divide-y divide-white/10">
      <button
        v-for="drill in drills"
        :key="drill.scenario"
        type="button"
        class="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-red-400 transition-colors text-left disabled:opacity-40"
        :disabled="disabled"
        @click="emit('play', drill)"
      >
        <img
          :src="iconSrc(drill.scenario)"
          :alt="`${label(drill.scenario)} icon`"
          class="h-9 w-9 rounded-lg border border-amber-400/20 flex-shrink-0 object-cover"
        />
        <div class="flex-1 min-w-0">
          <p class="text-[13px] font-bold text-white">{{ label(drill.scenario) }}</p>
          <p class="text-sm text-gray-400 line-clamp-2">{{ drill.reason || description(drill.scenario) }}</p>
        </div>
        <div class="text-right flex-shrink-0">
          <p class="text-[11px] font-black tabular-nums text-amber-300">{{ improvementPct(drill.scenario) }}%</p>
          <p class="text-xs text-gray-400">to improve</p>
        </div>
      </button>
    </div>
  </div>
</template>
