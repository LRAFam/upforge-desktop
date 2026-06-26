<script setup lang="ts">
import { computed } from 'vue'
import { pipelineStagesFromStep } from '../../lib/duel-moments'

const props = defineProps<{
  progress: number
  step?: string | null
  momentCount?: number
}>()

const parsed = computed(() =>
  pipelineStagesFromStep(props.step, props.progress, props.momentCount ?? 0),
)

function stageState(index: number): 'done' | 'active' | 'pending' {
  if (index < parsed.value.activeIndex) return 'done'
  if (index === parsed.value.activeIndex) return 'active'
  return 'pending'
}
</script>

<template>
  <div class="overflow-x-auto scroll-col -mx-1 px-1 pb-0.5">
    <div class="flex gap-1.5 w-max min-w-full">
      <div
        v-for="(stage, index) in parsed.stages"
        :key="stage.id"
        class="w-[7.25rem] flex-shrink-0 rounded-xl border px-2 py-2 text-left transition-colors"
        :class="{
          'border-emerald-500/35 bg-emerald-500/[0.08]': stageState(index) === 'done',
          'border-orange-500/40 bg-orange-500/[0.1] shadow-[0_0_20px_rgba(249,115,22,0.12)]': stageState(index) === 'active',
          'border-white/[0.08] bg-white/[0.02]': stageState(index) === 'pending',
        }"
      >
        <div class="flex items-center gap-1.5">
          <span
            class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-black"
            :class="{
              'bg-emerald-500/25 text-emerald-300': stageState(index) === 'done',
              'bg-orange-500/30 text-orange-200': stageState(index) === 'active',
              'bg-white/[0.06] text-gray-600': stageState(index) === 'pending',
            }"
          >
            <svg v-if="stageState(index) === 'done'" class="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
            </svg>
            <span v-else>{{ index + 1 }}</span>
          </span>
          <p
            class="text-[10px] font-bold uppercase tracking-[0.12em] leading-tight"
            :class="stageState(index) === 'pending' ? 'text-gray-600' : 'text-gray-200'"
          >
            {{ stage.label }}
          </p>
        </div>
        <p class="mt-1 text-[9px] leading-snug text-gray-500">{{ stage.detail }}</p>
      </div>
    </div>
  </div>
</template>
