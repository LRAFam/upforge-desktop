<script setup lang="ts">
import type { TrainerScenarioKey, TrainerDifficulty } from '../../lib/trainer-scenarios'
import TrainingIcon from './TrainingIcon.vue'

export type VodDrill = {
  scenario: TrainerScenarioKey
  difficulty: TrainerDifficulty
  reason: string
  weakness_score: number
  /** Coaching drill id (/api/drills): drills with one get a "Not now" control. */
  user_drill_id?: number
  /** From repeated match-stat problems: shows a label, the coach's why and the stat line. */
  from_matches?: boolean
  why?: string | null
  stat_line?: string | null
  beta?: boolean
}

defineProps<{
  drills: VodDrill[]
  label: (key: TrainerScenarioKey) => string
  description: (key: TrainerScenarioKey) => string
  improvementPct: (key: TrainerScenarioKey) => number
  iconSrc: (key: TrainerScenarioKey) => string
  disabled?: boolean
}>()

const emit = defineEmits<{ play: [drill: VodDrill]; dismiss: [drill: VodDrill] }>()
</script>

<template>
  <div v-if="drills.length" class="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
    <div class="flex items-center gap-2 px-4 py-2.5 border-b border-white/10">
      <TrainingIcon name="precision" class="h-5 w-5 text-teal-400" />
      <span class="text-xs font-semibold text-gray-300">Recommended from your VODs</span>
    </div>
    <div class="divide-y divide-white/10">
      <div v-for="drill in drills" :key="`${drill.scenario}:${drill.reason}`" class="flex items-stretch">
        <button
          type="button"
          class="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-red-400 transition-colors text-left disabled:opacity-40"
          :disabled="disabled"
          @click="emit('play', drill)"
        >
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-teal-300">
            <TrainingIcon :name="drill.scenario" class="h-5 w-5" />
          </div>
          <div class="flex-1 min-w-0">
            <p v-if="drill.from_matches" class="text-[10px] font-semibold uppercase tracking-wider text-amber-300">From your matches</p>
            <p class="text-[13px] font-bold text-white">
              {{ label(drill.scenario) }}
              <span v-if="drill.beta" class="ml-1.5 rounded-md border border-amber-500/30 bg-amber-500/[0.08] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300">Beta</span>
            </p>
            <p class="mt-1 text-xs leading-relaxed text-gray-400 line-clamp-2">{{ (drill.from_matches && drill.why) || drill.reason || description(drill.scenario) }}</p>
            <p v-if="drill.from_matches && drill.stat_line" class="mt-0.5 text-[11px] tabular-nums text-gray-300">{{ drill.stat_line }}</p>
          </div>
          <span class="shrink-0 text-xs font-semibold text-gray-300">Play <span aria-hidden="true">→</span></span>
        </button>
        <button
          v-if="drill.user_drill_id"
          type="button"
          class="shrink-0 px-3 text-[11px] font-semibold text-gray-500 hover:text-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
          :aria-label="`Not now: ${label(drill.scenario)}`"
          @click="emit('dismiss', drill)"
        >
          Not now
        </button>
      </div>
    </div>
  </div>
</template>
