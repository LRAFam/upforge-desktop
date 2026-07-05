<script setup lang="ts">
import { computed } from 'vue'
import { scoreGradeBadgeClass } from '../../lib/analysis-scoring'

const props = defineProps<{
  /** Internal score 0–100 (displayed ×10). */
  score: number
  grade?: string
}>()

const display = computed(() => Math.round(props.score * 10))
const pct = computed(() => Math.min(100, Math.max(0, props.score)))

const arcPath = computed(() => {
  const r = 42
  const cx = 50
  const cy = 52
  const start = Math.PI
  const end = Math.PI * (1 - pct.value / 100)
  const x1 = cx + r * Math.cos(start)
  const y1 = cy + r * Math.sin(start)
  const x2 = cx + r * Math.cos(end)
  const y2 = cy + r * Math.sin(end)
  const large = pct.value > 50 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
})
</script>

<template>
  <div class="relative w-[108px] h-[72px] flex-shrink-0">
    <svg viewBox="0 0 100 60" class="w-full h-full" aria-hidden="true">
      <path
        d="M 8 52 A 42 42 0 0 1 92 52"
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        stroke-width="7"
        stroke-linecap="round"
      />
      <path
        :d="arcPath"
        fill="none"
        stroke="url(#gaugeGrad)"
        stroke-width="7"
        stroke-linecap="round"
      />
      <defs>
        <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#ff4655" />
          <stop offset="100%" stop-color="#f97316" />
        </linearGradient>
      </defs>
    </svg>
    <div class="absolute inset-x-0 bottom-0 flex flex-col items-center leading-none">
      <span
        class="text-2xl font-black tabular-nums"
        :class="score >= 78 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'"
      >{{ display }}</span>
      <span v-if="grade" class="text-[9px] font-black px-1.5 py-px rounded-full mt-0.5" :class="scoreGradeBadgeClass(score)">{{ grade }}</span>
    </div>
  </div>
</template>
