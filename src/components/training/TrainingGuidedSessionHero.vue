<script setup lang="ts">
import type { SessionStep } from '../../lib/structured-session'
import { TRAINING_ARTWORK } from '../../lib/training-icons'

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
  <div class="dash-panel relative overflow-hidden p-4">
    <img
      :src="TRAINING_ARTWORK.guidedSessionHero"
      alt=""
      aria-hidden="true"
      class="absolute inset-0 h-full w-full object-cover opacity-[0.22] pointer-events-none"
    />
    <div class="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/85 to-[#0a0a0a]/60 pointer-events-none" />
    <div class="absolute -right-8 top-0 h-32 w-32 rounded-full bg-red-500/10 blur-3xl pointer-events-none" />
    <div class="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0 flex-1">
        <p class="text-[10px] font-black uppercase tracking-[0.22em] text-red-400/90">Guided session</p>
        <h2 class="text-base font-black text-white mt-1">Warm-up → focus → cool-down</h2>
        <p v-if="focusReason" class="text-[11px] text-gray-500 mt-1 truncate">{{ focusReason }}</p>

        <div class="flex flex-wrap items-center gap-2 mt-3">
          <div
            v-for="(step, i) in steps"
            :key="i"
            class="flex items-center gap-2"
          >
            <span
              class="text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap"
              :class="phaseBorder(step.phase)"
            >{{ step.phaseLabel }} · {{ scenarioLabel(step.scenario) }}</span>
            <svg
              v-if="i < steps.length - 1"
              class="h-3 w-3 text-gray-600 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            ><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </div>
        </div>
      </div>

      <button
        type="button"
        class="btn-primary flex-shrink-0 !py-2.5 !px-6 flex items-center gap-2"
        :disabled="disabled"
        @click="emit('start')"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Start session
      </button>
    </div>
  </div>
</template>
