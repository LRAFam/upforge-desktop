<script setup lang="ts">
import type { TrainerScenarioKey, TrainerDifficulty } from '../../lib/trainer-scenarios'
import DifficultyStars from './DifficultyStars.vue'
import { formatTrainerRank } from '../../lib/training-ui'

defineProps<{
  scenario: TrainerScenarioKey
  label: string
  description: string
  difficulty: TrainerDifficulty
  durationSeconds: number
  personalBest: number | null
  globalRank: number | null
  progress: number
  reason?: string | null
  iconSrc: string
  accent: {
    color: string
    bg: string
    border: string
    band: string
  }
  completed?: boolean
  running?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{ play: [] }>()
</script>

<template>
  <button
    type="button"
    class="group relative rounded-xl border overflow-hidden text-left transition-all duration-200 disabled:opacity-50"
    :class="completed
      ? 'border-emerald-500/25 bg-emerald-500/[0.04] opacity-75'
      : 'border-white/[0.09] bg-white/[0.02] hover:border-white/[0.16] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30'"
    :disabled="disabled || completed"
    @click="emit('play')"
  >
    <div :class="['absolute left-0 top-0 bottom-0 w-1', accent.band]" />

    <div class="p-3.5 pl-4">
      <div class="flex items-start justify-between gap-2 mb-2">
        <img
          :src="iconSrc"
          :alt="`${label} icon`"
          class="w-9 h-9 rounded-lg flex-shrink-0 object-contain ring-1 ring-white/[0.06]"
        />
        <span
          v-if="formatTrainerRank(globalRank)"
          class="text-[9px] font-black tabular-nums px-2 py-1 rounded-md border border-white/[0.10] bg-black/30 text-gray-300"
        >{{ formatTrainerRank(globalRank) }}</span>
      </div>

      <p class="text-[13px] font-bold text-white">{{ label }}</p>
      <div class="flex items-center gap-2 mt-1">
        <DifficultyStars :difficulty="difficulty" size="sm" />
        <span class="text-[10px] text-gray-600 tabular-nums">{{ durationSeconds }}s</span>
      </div>
      <p v-if="reason" class="text-[10px] text-gray-500 mt-2 line-clamp-2 leading-snug italic">{{ reason }}</p>
      <p v-else class="text-[10px] text-gray-600 mt-2 line-clamp-2 leading-snug">{{ description }}</p>

      <div class="flex items-end justify-between gap-3 mt-3">
        <div class="min-w-0 flex-1">
          <p class="text-[9px] uppercase tracking-wide text-gray-600">Personal best</p>
          <p class="text-xl font-black tabular-nums text-white leading-none mt-0.5">
            {{ personalBest ?? '—' }}
          </p>
        </div>
        <span
          class="flex h-9 w-9 items-center justify-center rounded-lg border transition-colors flex-shrink-0"
          :class="running
            ? 'border-red-500/30 bg-red-500/10 text-red-400'
            : 'border-white/[0.10] bg-white/[0.04] text-gray-400 group-hover:text-red-400 group-hover:border-red-500/30'"
        >
          <svg v-if="running" class="w-2 h-2 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>
          <svg v-else-if="completed" class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </span>
      </div>

      <div class="mt-2.5 h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div :class="['h-full rounded-full transition-all', accent.band]" :style="{ width: `${progress}%` }" />
      </div>
    </div>
  </button>
</template>
