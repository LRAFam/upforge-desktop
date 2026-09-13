<script setup lang="ts">
import type { TrainerScenarioKey, TrainerDifficulty } from '../../lib/trainer-scenarios'
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
    class="group flex h-full flex-col rounded-xl border bg-[#171719] p-5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:cursor-not-allowed"
    :class="completed ? 'border-emerald-500/25' : 'border-white/10 enabled:hover:border-white/25 enabled:hover:bg-[#1d1d20] disabled:opacity-50'"
    :disabled="disabled || completed"
    :aria-label="`${completed ? 'Completed' : running ? 'Running' : 'Play'} ${label}`"
    @click="emit('play')"
  >
    <div class="flex w-full items-start gap-4">
      <img :src="iconSrc" alt="" aria-hidden="true" class="h-14 w-14 shrink-0 object-contain" />
      <div class="min-w-0 flex-1">
        <h3 class="text-base font-semibold text-white">{{ label }}</h3>
        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
          <span class="capitalize">{{ difficulty }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ durationSeconds }} seconds</span>
        </div>
      </div>
    </div>
    <p class="mt-4 mb-5 text-sm leading-relaxed text-gray-400">{{ reason || description }}</p>
    <div class="mt-auto flex w-full items-end justify-between gap-3 border-t border-white/10 pt-4">
      <div>
        <p class="text-xs text-gray-400">Personal best</p>
        <p class="mt-1 text-lg font-semibold tabular-nums text-white">{{ personalBest ?? 'Not played' }}</p>
        <p v-if="formatTrainerRank(globalRank)" class="mt-1 text-xs text-gray-400">{{ formatTrainerRank(globalRank) }} globally</p>
      </div>
      <span class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold" :class="completed ? 'text-emerald-400' : 'bg-white/[0.06] text-white group-hover:bg-white/10'">
        {{ completed ? 'Completed' : running ? 'Running' : 'Play' }}
        <svg v-if="!completed && !running" viewBox="0 0 24 24" fill="currentColor" class="h-3 w-3" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </span>
    </div>
  </button>
</template>
