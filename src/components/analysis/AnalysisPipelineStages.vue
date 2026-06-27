<script setup lang="ts">
import { computed } from 'vue'
import { pipelineStagesFromStep } from '../../lib/duel-moments'
import PostGamePipelineIcon from '../post-game/PostGamePipelineIcon.vue'

const props = withDefaults(defineProps<{
  progress: number
  step?: string | null
  momentCount?: number
  layout?: 'horizontal' | 'vertical'
}>(), {
  layout: 'horizontal',
})

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
  <!-- Vertical — compact coaching pipeline -->
  <div v-if="layout === 'vertical'" class="flow-pipeline-vertical space-y-0">
    <div
      v-for="(stage, index) in parsed.stages"
      :key="stage.id"
      class="flex gap-2.5"
    >
      <div class="flex flex-col items-center">
        <span
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all duration-300"
          :class="{
            'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/35': stageState(index) === 'done',
            'bg-[#ff4655]/20 text-[#ff8a94] ring-1 ring-[#ff4655]/45 shadow-[0_0_14px_rgba(255,70,85,0.28)] scale-110': stageState(index) === 'active',
            'bg-white/[0.04] text-gray-600 ring-1 ring-white/[0.08]': stageState(index) === 'pending',
          }"
        >
          <svg v-if="stageState(index) === 'done'" class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
          </svg>
          <PostGamePipelineIcon
            v-else
            :stage="stage.id"
            :state="stageState(index)"
            :class="stageState(index) === 'active' ? 'animate-pulse' : ''"
          />
        </span>
        <div
          v-if="index < parsed.stages.length - 1"
          class="my-0.5 w-px flex-1 min-h-[10px] transition-colors"
          :class="stageState(index) === 'done' ? 'bg-emerald-500/35' : 'bg-white/[0.08]'"
        />
      </div>
      <div
        class="min-w-0 flex-1 pb-2.5"
        :class="{ 'opacity-45': stageState(index) === 'pending' }"
      >
        <p
          class="text-[10px] font-bold uppercase tracking-[0.14em] leading-tight"
          :class="stageState(index) === 'active' ? 'text-white' : stageState(index) === 'done' ? 'text-gray-300' : 'text-gray-600'"
        >
          {{ stage.label }}
        </p>
        <p class="mt-0.5 text-[10px] leading-snug text-gray-500">{{ stage.detail }}</p>
      </div>
    </div>
  </div>

  <!-- Horizontal — scrollable stage chips -->
  <div v-else class="overflow-x-auto scroll-col -mx-1 px-1 pb-0.5">
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
