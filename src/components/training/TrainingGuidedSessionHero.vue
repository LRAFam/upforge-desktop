<script setup lang="ts">
import type { SessionStep } from '../../lib/structured-session'

defineProps<{
  steps: SessionStep[]
  focusReason?: string | null
  disabled?: boolean
  phaseBorder: (phase: SessionStep['phase']) => string
  scenarioLabel: (key: string) => string
}>()

const emit = defineEmits<{ start: [] }>()
</script>

<template>
  <section class="relative overflow-hidden rounded-xl border border-white/10 bg-[#131619] p-5 sm:p-6">
    <div class="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
      <div class="min-w-0 flex-1">
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-red-400">Today's session</p>
        <h2 class="mt-2 text-xl font-semibold text-white">A focused routine, ready to play.</h2>
        <p class="mt-2 text-sm leading-relaxed text-gray-300">{{ focusReason || 'Warm up, practise your focus drill, then cool down.' }}</p>
        <ol v-if="steps.length" class="mt-4 grid gap-3 sm:grid-cols-3">
          <li v-for="(step, i) in steps" :key="i" class="flex items-start gap-3 border-t border-white/10 pt-3">
            <span class="text-sm font-semibold tabular-nums text-red-400">{{ String(i + 1).padStart(2, '0') }}</span>
            <div>
              <p class="text-xs text-gray-400">{{ step.phaseLabel }}</p>
              <p class="mt-1 text-sm font-medium text-white">{{ scenarioLabel(step.scenario) }}</p>
            </div>
          </li>
        </ol>
      </div>
      <button type="button" class="flex self-start shrink-0 items-center justify-center gap-2 rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-400 disabled:opacity-40 disabled:cursor-not-allowed" :disabled="disabled" @click="emit('start')">
        <svg viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Start session
      </button>
    </div>
  </section>
</template>
